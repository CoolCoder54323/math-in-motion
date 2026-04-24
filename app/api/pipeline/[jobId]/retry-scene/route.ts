import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getJobDir, readManifest, readPlan, readSceneStates, writeSceneStates } from "@/lib/pipeline/job-manager";
import { processScene, type PipelineController } from "@/lib/pipeline/executor";
import type { PipelineContext } from "@/lib/pipeline/stage";
import type { PlanOutput, PipelineEvent } from "@/lib/pipeline/types";

/**
 * POST /api/pipeline/[jobId]/retry-scene
 *
 * Re-process a single scene outside of an active pipeline.
 * Used when the user clicks "Try again" on a failed scene after the
 * pipeline has already finished (complete or failed).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!/^[a-f0-9-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
  }

  const jobDir = getJobDir(jobId);
  if (!jobDir) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let body: { sceneId?: string };
  try {
    body = (await request.json()) as { sceneId?: string };
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const { sceneId } = body;
  if (!sceneId || typeof sceneId !== "string") {
    return NextResponse.json({ error: "Expected 'sceneId' string." }, { status: 400 });
  }

  // Load plan
  const rawPlan = readPlan(jobDir);
  if (!rawPlan) {
    return NextResponse.json({ error: "No plan found for this job." }, { status: 404 });
  }
  const plan = rawPlan as PlanOutput;

  const scene = plan.sceneBreakdown.find((s) => s.sceneId === sceneId);
  if (!scene) {
    return NextResponse.json({ error: `Unknown sceneId "${sceneId}".` }, { status: 400 });
  }

  // Load manifest for mode / assets
  const manifest = readManifest(jobDir);
  const mode = manifest?.mode ?? "lesson";

  // Discover assets from the job's assets/ directory
  const assetsDir = join(jobDir, "assets");
  const assets: string[] = [];
  if (existsSync(assetsDir)) {
    try {
      for (const entry of readdirSync(assetsDir)) {
        if (/\.(png|jpe?g|svg|gif|webp)$/i.test(entry)) {
          assets.push(entry);
        }
      }
    } catch {
      // ignore read errors
    }
  }

  // Load existing scene states
  const sceneStates = readSceneStates(jobDir) ?? {};

  // Build minimal context
  const abortCtrl = new AbortController();
  const ctx: PipelineContext = {
    jobId,
    jobDir,
    mode,
    manifest: manifest ?? {
      jobId,
      mode,
      stages: [],
      createdAt: Date.now(),
      status: "running",
    },
    signal: abortCtrl.signal,
    pauseRequested: false,
    assets,
  };

  const controller: PipelineController = {
    ctx,
    abort: abortCtrl,
    resume: () => {},
    pausePromise: null,
    currentPlan: plan,
    approvePlan: null,
    currentSceneAbort: null,
    regenerateQueue: [],
    regenerateInFlight: new Set(),
    subscribers: [],
    sceneStates,
    autoContinue: true,
    lastApprovalHeartbeat: 0,
    confirmPipeline: null,
    confirmationPromise: null,
  };

  // Ensure clips dir exists
  const clipsDir = join(jobDir, "clips");
  if (!existsSync(clipsDir)) mkdirSync(clipsDir, { recursive: true });

  // Collect events so we can return the final state
  const events: PipelineEvent[] = [];
  const onEvent = (event: PipelineEvent) => {
    events.push(event);
    // Update in-memory scene state as we go
    if (event.type === "scene-generating" || event.type === "scene-regenerating") {
      controller.sceneStates[event.sceneId] = {
        status: event.type === "scene-regenerating" ? "regenerating" : "generating",
        statusMessage: event.statusMessage,
        startedAt: Date.now(),
      };
    } else if (event.type === "scene-progress") {
      controller.sceneStates[event.sceneId] = {
        ...(controller.sceneStates[event.sceneId] ?? { status: "generating" }),
        statusMessage: event.statusMessage,
        inputTokens: event.tokenUsage?.inputTokens,
        outputTokens: event.tokenUsage?.outputTokens,
        cachedTokens: event.tokenUsage?.cachedTokens,
        estimatedCostUSD: event.tokenUsage?.estimatedCostUSD,
      };
    } else if (event.type === "scene-ready") {
      controller.sceneStates[event.sceneId] = {
        status: "ready",
        clipUrl: event.clipUrl,
        durationSeconds: event.durationSeconds,
        inputTokens: event.tokenUsage?.inputTokens,
        outputTokens: event.tokenUsage?.outputTokens,
        cachedTokens: event.tokenUsage?.cachedTokens,
        estimatedCostUSD: event.tokenUsage?.estimatedCostUSD,
      };
    } else if (event.type === "scene-failed") {
      controller.sceneStates[event.sceneId] = {
        status: "failed",
        error: event.error,
        failureLayer: event.layer,
        failureCode: event.code,
        inputTokens: event.tokenUsage?.inputTokens,
        outputTokens: event.tokenUsage?.outputTokens,
        cachedTokens: event.tokenUsage?.cachedTokens,
        estimatedCostUSD: event.tokenUsage?.estimatedCostUSD,
      };
    }
  };

  const slots = new Map();

  try {
    await processScene({
      scene,
      plan,
      quality: "m",
      ctx,
      controller,
      options: undefined,
      onEvent,
      isRegeneration: true,
      slots,
    });
  } catch (err) {
    // processScene should emit scene-failed itself, but handle unexpected errors
    const message = err instanceof Error ? err.message : String(err);
    controller.sceneStates[sceneId] = {
      status: "failed",
      error: message,
    };
    onEvent({ type: "scene-failed", sceneId, error: message });
  }

  // Persist updated scene states
  writeSceneStates(jobDir, controller.sceneStates);

  // Find the final event for this scene
  const finalEvent = events
    .slice()
    .reverse()
    .find((e): e is Extract<PipelineEvent, { type: "scene-ready" } | { type: "scene-failed" }> =>
      (e.type === "scene-ready" || e.type === "scene-failed") && e.sceneId === sceneId,
    );

  if (!finalEvent) {
    return NextResponse.json(
      { error: "Scene retry did not produce a result." },
      { status: 500 },
    );
  }

  if (finalEvent.type === "scene-failed") {
    return NextResponse.json({
      ok: false,
      sceneId,
      status: "failed",
      error: finalEvent.error,
    }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    sceneId,
    status: "ready",
    clipUrl: finalEvent.clipUrl,
    durationSeconds: finalEvent.durationSeconds,
    tokenUsage: finalEvent.tokenUsage,
  });
}
