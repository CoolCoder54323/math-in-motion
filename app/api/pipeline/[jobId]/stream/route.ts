import { getController } from "@/lib/pipeline/executor";
import { readManifest, getJobDir, readPlan, readSceneStates } from "@/lib/pipeline/job-manager";
import type { PipelineEvent, PipelineStage } from "@/lib/pipeline/types";

export const maxDuration = 300;

// Keep connections alive with heartbeats
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
// Max time to wait for a live controller to appear
const MAX_AWAITING_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!/^[a-f0-9-]{36}$/.test(jobId)) {
    return new Response(JSON.stringify({ error: "Invalid job ID." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let cancelCleanup: (() => void) | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Track all intervals/timeouts for cleanup
      const cleanupFns: Array<() => void> = [];
      let subscriber: ((event: PipelineEvent) => void) | null = null;
      let ctrl = getController(jobId);

      // Start heartbeat to keep connection alive and detect stale clients
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          // Stream closed, clean up
          cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);
      cleanupFns.push(() => clearInterval(heartbeatInterval));

      const cleanup = () => {
        cleanupFns.forEach(fn => fn());
        if (subscriber && ctrl) {
          const idx = ctrl.subscribers.indexOf(subscriber);
          if (idx >= 0) ctrl.subscribers.splice(idx, 1);
          subscriber = null;
        }
        try { controller.close(); } catch {}
      };

      cancelCleanup = cleanup;

      // Try to connect to a live pipeline
      if (ctrl) {
        // Pipeline is live — subscribe to events
        subscriber = (event: PipelineEvent) => send(event);
        ctrl.subscribers.push(subscriber);

        // Send current status immediately
        const currentPlan = ctrl.currentPlan;
        const manifest = ctrl.ctx.manifest;

        send({
          type: "pipeline-started",
          jobId,
        } as PipelineEvent);

        // Only send the event that matches the current state.
        // Do NOT send both plan-awaiting-approval AND plan-ready —
        // that would cause planApprovalPending to flip false.
        if (manifest.status === "awaiting-approval" && currentPlan) {
          send({
            type: "plan-awaiting-approval",
            plan: currentPlan,
          } as PipelineEvent);
        } else if (currentPlan) {
          // Pipeline has a plan and is past the approval gate (building)
          send({
            type: "plan-ready",
            plan: currentPlan,
          } as PipelineEvent);
        }

        // Replay scene states so the reconnecting client sees already-completed
        // scenes (not just future ones).
        const sceneStates = ctrl.sceneStates;
        for (const [sceneId, state] of Object.entries(sceneStates)) {
          if (state.status === "ready" && state.clipUrl) {
            send({
              type: "scene-ready",
              sceneId,
              clipUrl: state.clipUrl,
              durationSeconds: state.durationSeconds ?? 0,
              tokenUsage: state.inputTokens !== undefined || state.outputTokens !== undefined
                ? {
                    inputTokens: state.inputTokens ?? 0,
                    outputTokens: state.outputTokens ?? 0,
                    cachedTokens: state.cachedTokens,
                    estimatedCostUSD: state.estimatedCostUSD ?? 0,
                  }
                : undefined,
            } as PipelineEvent);
          } else if (state.status === "failed" && state.error) {
            send({
              type: "scene-failed",
              sceneId,
              error: state.error,
              tokenUsage: state.inputTokens !== undefined || state.outputTokens !== undefined
                ? {
                    inputTokens: state.inputTokens ?? 0,
                    outputTokens: state.outputTokens ?? 0,
                    cachedTokens: state.cachedTokens,
                    estimatedCostUSD: state.estimatedCostUSD ?? 0,
                  }
                : undefined,
            } as PipelineEvent);
          } else if (state.status === "generating") {
            send({
              type: "scene-generating",
              sceneId,
            } as PipelineEvent);
          } else if (state.status === "regenerating") {
            send({
              type: "scene-regenerating",
              sceneId,
            } as PipelineEvent);
          }
        }

        // If the pipeline is currently awaiting confirmation, emit the event
        if (manifest.status === "awaiting-confirmation") {
          const totalScenes = ctrl.currentPlan?.sceneBreakdown.length ?? 1;
          const failedCount = Object.values(sceneStates).filter((s) => s.status === "failed").length;
          send({
            type: "pipeline-awaiting-confirmation",
            failedCount,
            totalScenes,
            canContinue: failedCount / totalScenes <= 0.20,
          } as PipelineEvent);
        }

        // Poll until pipeline is no longer active
        const pollInterval = setInterval(() => {
          const stillActive = getController(jobId);
          if (!stillActive) {
            cleanup();
            // Pipeline finished — read final manifest and send one last update
            const jobDir = getJobDir(jobId);
            if (jobDir) {
              const finalManifest = readManifest(jobDir);
              if (finalManifest) {
                if (finalManifest.status === "complete") {
                  send({ type: "pipeline-complete", manifest: finalManifest } as PipelineEvent);
                } else if (finalManifest.status === "failed" || finalManifest.status === "interrupted") {
                  const failedStage = finalManifest.stages.find(s => s.status === "error");
                  send({
                    type: "pipeline-error",
                    error: failedStage?.error ?? "Pipeline failed.",
                    failedStage: failedStage?.stage ?? "plan",
                  } as PipelineEvent);
                }
              }
            }
          }
        }, 1000);
        cleanupFns.push(() => clearInterval(pollInterval));
      } else {
        // Pipeline is not live — read state from manifest/plan files
        const jobDir = getJobDir(jobId);
        if (!jobDir) {
          send({ type: "pipeline-error", error: "Job not found." } as PipelineEvent);
          cleanup();
          return;
        }

        const manifest = readManifest(jobDir);
        const plan = readPlan(jobDir) as Record<string, unknown> | null;
        const sceneStates = readSceneStates(jobDir);

        // Replay current state
        send({ type: "pipeline-started", jobId } as PipelineEvent);

        if (manifest) {
          if (manifest.status === "complete") {
            send({ type: "pipeline-complete", manifest } as PipelineEvent);
          } else if (manifest.status === "failed") {
            const failedStage = manifest.stages.find(s => s.status === "error");
            send({
              type: "pipeline-error",
              error: failedStage?.error ?? "Pipeline failed.",
              failedStage: failedStage?.stage ?? "plan",
            } as PipelineEvent);
          } else if (manifest.status === "interrupted") {
            const failedStage = manifest.stages.find(s => s.status === "error");
            send({
              type: "pipeline-error",
              error: failedStage?.error ?? "Pipeline was interrupted (server restart or crash).",
              failedStage: failedStage?.stage ?? "plan",
            } as PipelineEvent);
          } else if (manifest.status === "awaiting-approval") {
            if (plan) {
              send({
                type: "plan-awaiting-approval",
                plan,
              } as PipelineEvent);
            } else {
              send({
                type: "pipeline-error",
                error: "Pipeline is awaiting approval but the plan data is missing. You may need to regenerate.",
                failedStage: "plan" as PipelineStage,
              } as PipelineEvent);
            }
          } else if (manifest.status === "paused") {
            // Pipeline is paused, send error with paused state
            send({
              type: "pipeline-error",
              error: "Pipeline is paused. Resume to continue.",
              failedStage: manifest.currentStage ?? "plan",
            } as PipelineEvent);
          } else if (manifest.status === "awaiting-confirmation") {
            // Replay scene states from disk
            for (const [sceneId, state] of Object.entries(sceneStates ?? {})) {
              if (state.status === "ready" && state.clipUrl) {
                send({
                  type: "scene-ready",
                  sceneId,
                  clipUrl: state.clipUrl,
                  durationSeconds: state.durationSeconds ?? 0,
                } as PipelineEvent);
              } else if (state.status === "failed" && state.error) {
                send({
                  type: "scene-failed",
                  sceneId,
                  error: state.error,
                } as PipelineEvent);
              } else if (state.status === "generating") {
                send({ type: "scene-generating", sceneId } as PipelineEvent);
              }
            }
            const totalScenes = plan
              ? (plan as { sceneBreakdown?: unknown[] }).sceneBreakdown?.length ?? 1
              : 1;
            const failedCount = Object.values(sceneStates ?? {}).filter((s) => s.status === "failed").length;
            send({
              type: "pipeline-awaiting-confirmation",
              failedCount,
              totalScenes,
              canContinue: failedCount / totalScenes <= 0.20,
            } as PipelineEvent);
          } else if (manifest.status === "running" || manifest.status === "generating" || manifest.status === "building") {
            // Manifest says running but no live controller — server may have restarted.
            // Derive state from manifest and plan so the UI can show correct progress.
            const planStage = manifest.stages.find((s) => s.stage === "plan");
            const planDone = planStage?.status === "success";
            if (planDone && plan) {
              send({ type: "plan-ready", plan } as PipelineEvent);
            }

            // Replay scene states from disk
            for (const [sceneId, state] of Object.entries(sceneStates ?? {})) {
              if (state.status === "ready" && state.clipUrl) {
                send({
                  type: "scene-ready",
                  sceneId,
                  clipUrl: state.clipUrl,
                  durationSeconds: state.durationSeconds ?? 0,
                } as PipelineEvent);
              } else if (state.status === "failed" && state.error) {
                send({
                  type: "scene-failed",
                  sceneId,
                  error: state.error,
                } as PipelineEvent);
              } else if (state.status === "generating") {
                send({ type: "scene-generating", sceneId } as PipelineEvent);
              }
            }

            // Create a subscriber so we can attach to a live controller if it appears
            subscriber = (event: PipelineEvent) => send(event);

            // Keep connection open and poll for a live controller to appear
            const pollInterval = setInterval(() => {
              const liveCtrl = getController(jobId);
              if (liveCtrl && subscriber) {
                // Live controller appeared — attach subscriber
                liveCtrl.subscribers.push(subscriber);
                ctrl = liveCtrl;
                clearInterval(pollInterval);
              }
            }, 1000);
            cleanupFns.push(() => clearInterval(pollInterval));

            // Timeout after 30s if no controller appears
            const timeout = setTimeout(() => {
              send({
                type: "pipeline-error",
                error: "Pipeline connection lost. The server may have restarted. Please refresh to check status.",
                failedStage: manifest.currentStage ?? "plan",
              } as PipelineEvent);
              cleanup();
            }, 30000);
            cleanupFns.push(() => clearTimeout(timeout));
            return; // Don't call cleanup immediately — polling keeps it open
          } else {
            // Pipeline was interrupted or in an unknown state
            send({
              type: "pipeline-error",
              error: `Pipeline in ${manifest.status} state. It may have been interrupted.`,
              failedStage: "plan" as PipelineStage,
            } as PipelineEvent);
          }
        } else {
          // No manifest on disk — infer state from other files
          if (plan) {
            // Plan exists but manifest doesn't → likely awaiting approval
            send({
              type: "plan-awaiting-approval",
              plan,
            } as PipelineEvent);
          } else if (sceneStates && Object.keys(sceneStates).length > 0) {
            // Scenes exist but no plan/manifest → interrupted mid-build
            send({
              type: "pipeline-error",
              error: "Pipeline was interrupted. Some scenes may have been rendered.",
              failedStage: "plan" as PipelineStage,
            } as PipelineEvent);
          } else {
            send({
              type: "pipeline-error",
              error: "Job data is missing. The pipeline may have been cleaned up or never started.",
              failedStage: "plan" as PipelineStage,
            } as PipelineEvent);
          }
        }

        // For complete/failed/error states, close immediately.
        // For awaiting-approval (or inferred awaiting-approval), keep open for a limited time
        // in case a live controller appears.
        const shouldKeepOpen =
          (manifest && (manifest.status === "awaiting-approval" || manifest.status === "awaiting-confirmation")) ||
          (!manifest && plan);

        if (!shouldKeepOpen) {
          cleanup();
        } else {
          // Set a timeout to close the connection if no controller appears
          const timeout = setTimeout(() => {
            send({
              type: "pipeline-error",
              error: "Timeout waiting for pipeline to become active. Please refresh to check status.",
              failedStage: "plan" as PipelineStage,
            } as PipelineEvent);
            cleanup();
          }, MAX_AWAITING_APPROVAL_TIMEOUT_MS);
          cleanupFns.push(() => clearTimeout(timeout));
        }
      }
    },
    cancel() {
      cancelCleanup?.();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}