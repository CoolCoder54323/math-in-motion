import { getController } from "@/lib/pipeline/executor";
import { readManifest, getJobDir, readPlan } from "@/lib/pipeline/job-manager";
import type { PipelineEvent, PipelineStage } from "@/lib/pipeline/types";

export const maxDuration = 300;

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

  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Try to connect to a live pipeline
      const ctrl = getController(jobId);

      if (ctrl) {
        // Pipeline is live — subscribe to events
        const subscriber = (event: PipelineEvent) => send(event);
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

        // Poll until pipeline is no longer active
        const pollInterval = setInterval(() => {
          const stillActive = getController(jobId);
          if (!stillActive) {
            clearInterval(pollInterval);
            // Pipeline finished — read final manifest
            const jobDir = getJobDir(jobId);
            if (jobDir) {
              const finalManifest = readManifest(jobDir);
              if (finalManifest) {
                if (finalManifest.status === "complete") {
                  send({ type: "pipeline-complete", manifest: finalManifest } as PipelineEvent);
                } else if (finalManifest.status === "failed") {
                  const failedStage = finalManifest.stages.find(s => s.status === "error");
                  send({
                    type: "pipeline-error",
                    error: failedStage?.error ?? "Pipeline failed.",
                    failedStage: failedStage?.stage ?? "plan",
                  } as PipelineEvent);
                }
              }
            }
            // Remove subscriber (controller is gone)
            const idx = ctrl.subscribers.indexOf(subscriber);
            if (idx >= 0) ctrl.subscribers.splice(idx, 1);
            try { controller.close(); } catch {}
          }
        }, 1000);
      } else {
        // Pipeline is not live — read state from manifest/plan files
        const jobDir = getJobDir(jobId);
        if (!jobDir) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline-error", error: "Job not found." })}\n\n`));
          try { controller.close(); } catch {}
          return;
        }

        const manifest = readManifest(jobDir);
        if (!manifest) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "pipeline-error", error: "Manifest not found — job may still be starting." })}\n\n`));
          try { controller.close(); } catch {}
          return;
        }

        // Replay current state
        send({ type: "pipeline-started", jobId } as PipelineEvent);

        if (manifest.status === "complete") {
          send({ type: "pipeline-complete", manifest } as PipelineEvent);
        } else if (manifest.status === "failed") {
          const failedStage = manifest.stages.find(s => s.status === "error");
          send({
            type: "pipeline-error",
            error: failedStage?.error ?? "Pipeline failed.",
            failedStage: failedStage?.stage ?? "plan",
          } as PipelineEvent);
        } else if (manifest.status === "awaiting-approval") {
          // Pipeline is paused waiting for approval — send the plan so the
          // workshop can display the approval screen.
          const plan = readPlan(jobDir) as Record<string, unknown> | null;
          if (plan) {
            send({
              type: "plan-awaiting-approval",
              plan,
            } as PipelineEvent);
          } else {
            // Plan file missing — can't resume, show error
            send({
              type: "pipeline-error",
              error: "Pipeline is awaiting approval but the plan data is missing. You may need to regenerate.",
              failedStage: "plan" as PipelineStage,
            } as PipelineEvent);
          }
          // Keep the stream open so that if the pipeline is still in-memory
          // (race condition), it can deliver further events.
        } else {
          // Pipeline was interrupted or in an unknown state
          send({
            type: "pipeline-error",
            error: `Pipeline in ${manifest.status} state. It may have been interrupted.`,
            failedStage: "plan" as PipelineStage,
          } as PipelineEvent);
        }

        // For complete/failed/error states, close immediately.
        // For awaiting-approval, keep open in case controller appears.
        if (manifest.status !== "awaiting-approval") {
          try { controller.close(); } catch {}
        }
      }
    },
    cancel() {
      // Client disconnected
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