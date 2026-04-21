import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createJobDir, writeManifest, writeTiming, writePlan, writeConceptText } from "./job-manager";
import { initGalleryEntry, updateGalleryEntry, type GalleryEntryStatus } from "@/lib/gallery";
import type { PipelineContext } from "./stage";
import type {
  GeneratedScene,
  PipelineEvent,
  PipelineInput,
  PipelineManifest,
  PipelineMode,
  PipelineStage,
  PlanOutput,
  RenderOutput,
  SceneEntry,
  SceneTiming,
  StageResult,
  StageTiming,
  ValidationIssue,
} from "./types";
import { calculateCost, mergeUsage, type LLMUsage } from "./llm-usage";

import { planStage } from "./stages/plan";
import { codegenStage, codegenSingleScene } from "./stages/codegen";
import { vizCodegenStage } from "./stages/viz-codegen";
import { validateStage, validateSingleScene } from "./stages/validate";
import { renderStage, renderScene } from "./stages/render";
import { postprocessStage } from "./stages/postprocess";
import { composeStage } from "./stages/compose";
import { getMediaInfo } from "./ffmpeg-runner";

/* ------------------------------------------------------------------ */
/*  Gallery status updates at stage transitions                         */
/* ------------------------------------------------------------------ */

const STAGE_TO_GALLERY_STAGE: Record<PipelineStage, GalleryEntryStatus> = {
  plan: "generating",
  codegen: "building",
  validate: "building",
  render: "building",
  postprocess: "building",
  compose: "building",
};

function updateGalleryStage(jobId: string, stage: PipelineStage): void {
  const status = STAGE_TO_GALLERY_STAGE[stage];
  void updateGalleryEntry(jobId, {
    status,
    currentStage: stage,
  });
}

/* ------------------------------------------------------------------ */
/*  Pipeline controller registry                                        */
/*                                                                      */
/*  Allows external API routes to pause/resume running pipelines by     */
/*  jobId. Each entry holds the pause machinery for one active job.     */
/* ------------------------------------------------------------------ */

export type RegenerateRequest = {
  sceneId: string;
  sceneUpdate?: Partial<SceneEntry>;
};

export type PipelineController = {
  ctx: PipelineContext;
  abort: AbortController;
  /** Resolves the pause promise to let the pipeline continue. */
  resume: () => void;
  /** The promise that the executor awaits when paused. */
  pausePromise: Promise<void> | null;

  /** Current (possibly user-edited) plan — single source of truth during run. */
  currentPlan: PlanOutput | null;

  /** Called by the control route with an approved plan. Resolves the approval promise. */
  approvePlan: ((plan: PlanOutput) => void) | null;

  /** In-flight AbortController for the currently-rendering scene (if any). */
  currentSceneAbort: AbortController | null;

  /** Queue of scenes the user has requested to regenerate. */
  regenerateQueue: RegenerateRequest[];

  /** Track which sceneIds have been pushed but not yet drained, for dedup. */
  regenerateInFlight: Set<string>;

  /** External event subscribers (for SSE reconnection). */
  subscribers: ((event: PipelineEvent) => void)[];
};

const activeJobs = new Map<string, PipelineController>();

export function getController(jobId: string): PipelineController | undefined {
  return activeJobs.get(jobId);
}

export function removeController(jobId: string): void {
  activeJobs.delete(jobId);
}

/* ------------------------------------------------------------------ */
/*  Pipeline executor                                                   */
/*                                                                      */
/*  Supports two modes:                                                 */
/*    - "lesson": full 6-stage pipeline (plan → compose)                */
/*    - "viz": lightweight 3-stage pipeline (codegen → render)          */
/*                                                                      */
/*  Rich events are emitted between stages (plan-ready, scene-rendered, */
/*  validation-report) so the frontend can show live artifacts.         */
/*  A pause gate between stages lets users halt and edit mid-pipeline.  */
/* ------------------------------------------------------------------ */

export async function executePipeline(
  input: PipelineInput,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<PipelineManifest> {
  const mode: PipelineMode = input.mode ?? "lesson";
  const { jobId, jobDir } = createJobDir();

  const manifest: PipelineManifest = {
    jobId,
    mode,
    stages: [],
    createdAt: Date.now(),
    status: "running",
  };

  const ctx: PipelineContext = {
    jobId,
    jobDir,
    mode,
    manifest,
    signal,
    pauseRequested: false,
  };

  // Register controller for external pause/resume
  const abortCtrl = signal
    ? { signal, abort: () => {} } as unknown as AbortController
    : new AbortController();

  const controller: PipelineController = {
    ctx,
    abort: abortCtrl as AbortController,
    resume: () => {},
    pausePromise: null,
    currentPlan: null,
    approvePlan: null,
    currentSceneAbort: null,
    regenerateQueue: [],
    regenerateInFlight: new Set(),
    subscribers: [],
  };
  activeJobs.set(jobId, controller);

  const broadcast = (event: PipelineEvent) => {
    onEvent(event);
    for (const cb of controller.subscribers) {
      try { cb(event); } catch { /* subscriber disconnected */ }
    }
  };

  writeConceptText(jobDir, input.conceptText || input.latexProblem || "");
  initGalleryEntry(jobId, mode, input.conceptText || input.latexProblem || undefined);

  broadcast({ type: "pipeline-started", jobId });

  try {
    if (mode === "lesson") {
      return await executeLessonPipeline(input, ctx, controller, broadcast, signal);
    } else {
      return await executeVizPipeline(input, ctx, controller, broadcast, signal);
    }
  } finally {
    activeJobs.delete(jobId);
  }
}

/* ------------------------------------------------------------------ */
/*  Pause gate — called between stages                                  */
/* ------------------------------------------------------------------ */

async function pauseGate(
  ctx: PipelineContext,
  controller: PipelineController,
  currentStage: PipelineStage,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  if (!ctx.pauseRequested) return;

  ctx.manifest.status = "paused";
  onEvent({
    type: "pipeline-paused",
    stage: currentStage,
    resumableFrom: currentStage,
  });

  // Create a promise that will be resolved by the resume() call
  const pausePromise = new Promise<void>((resolve) => {
    controller.resume = resolve;
  });
  controller.pausePromise = pausePromise;

  await pausePromise;

  controller.pausePromise = null;
  ctx.pauseRequested = false;
  ctx.manifest.status = "running";
}

/* ------------------------------------------------------------------ */
/*  Plan approval gate — blocks after plan-ready until user approves    */
/*                                                                      */
/*  Distinct from pauseGate: this is unconditional (always waits) and   */
/*  resumes with a PAYLOAD (the user's edited plan). pauseGate carries  */
/*  no value and only fires when pauseRequested is set.                 */
/* ------------------------------------------------------------------ */

async function awaitPlanApproval(
  ctx: PipelineContext,
  controller: PipelineController,
  plan: PlanOutput,
  onEvent: (event: PipelineEvent) => void,
): Promise<PlanOutput> {
  ctx.manifest.status = "awaiting-approval";
  writePlan(ctx.jobDir, plan);
  updateGalleryEntry(ctx.jobId, {
    status: "awaiting-approval",
    currentStage: "plan",
    title: plan.title,
    sceneCount: plan.sceneBreakdown.length,
    sceneBreakdown: plan.sceneBreakdown,
  });
  onEvent({ type: "plan-awaiting-approval", plan });

  const approvedPlan = await new Promise<PlanOutput>((resolve) => {
    controller.approvePlan = (edited: PlanOutput) => {
      controller.approvePlan = null;
      resolve(edited);
    };
    // If the pipeline is aborted while waiting, resolve with the original
    // plan so cleanup can run; the signal check downstream will bail out.
    if (ctx.signal) {
      const onAbort = () => {
        if (controller.approvePlan) {
          controller.approvePlan = null;
          resolve(plan);
        }
      };
      if (ctx.signal.aborted) onAbort();
      else ctx.signal.addEventListener("abort", onAbort, { once: true });
    }
  });

  ctx.manifest.status = "running";
  return approvedPlan;
}

/* ------------------------------------------------------------------ */
/*  Per-scene processor — codegen → validate → render → emit events    */
/* ------------------------------------------------------------------ */

type SceneSlot = {
  /** The (possibly auto-fixed) generated code for this scene. */
  generated?: GeneratedScene;
  /** The rendered clip metadata (video file + duration). */
  clip?: { sceneId: string; videoPath: string; durationSeconds: number };
  /** Validation issues surfaced for this scene. */
  issues: ValidationIssue[];
};

async function processScene(params: {
  scene: SceneEntry;
  plan: PlanOutput;
  quality: "l" | "m" | "h";
  ctx: PipelineContext;
  controller: PipelineController;
  options?: PipelineInput["options"];
  onEvent: (event: PipelineEvent) => void;
  isRegeneration: boolean;
  slots: Map<string, SceneSlot>;
}): Promise<SceneTiming | null> {
  const { scene, plan, quality, ctx, controller, options, onEvent, isRegeneration, slots } =
    params;

  if (ctx.signal?.aborted) return null;

  onEvent({
    type: isRegeneration ? "scene-regenerating" : "scene-generating",
    sceneId: scene.sceneId,
  });

  const slot: SceneSlot = slots.get(scene.sceneId) ?? { issues: [] };
  slots.set(scene.sceneId, slot);

  let codegenMs = 0;
  let validateMs = 0;
  let renderMs = 0;
  let sceneUsage: LLMUsage | null = null;

  try {
    const codegenStart = Date.now();
    const { scene: generated, usage } = await codegenSingleScene(scene, plan, ctx, options);
    codegenMs = Date.now() - codegenStart;
    sceneUsage = usage;

    const validateStart = Date.now();
    const validation = await validateSingleScene(generated);
    validateMs = Date.now() - validateStart;
    slot.generated = validation.scene;
    slot.issues = validation.issues;

    const sceneAbort = new AbortController();
    controller.currentSceneAbort = sceneAbort;

    const onPipelineAbort = () => sceneAbort.abort();
    if (ctx.signal) {
      if (ctx.signal.aborted) sceneAbort.abort();
      else ctx.signal.addEventListener("abort", onPipelineAbort, { once: true });
    }

    const renderStart = Date.now();
    const result = await renderScene(
      validation.scene,
      ctx.jobDir,
      quality,
      sceneAbort.signal,
    );
    renderMs = Date.now() - renderStart;

    if (ctx.signal) ctx.signal.removeEventListener("abort", onPipelineAbort);
    controller.currentSceneAbort = null;

    if (!result.ok) {
      throw new Error(result.error);
    }

    let durationSeconds = 0;
    try {
      const info = await getMediaInfo(result.videoPath);
      durationSeconds = info.durationSeconds;
    } catch {
      // best effort; leave 0
    }

    slot.clip = {
      sceneId: scene.sceneId,
      videoPath: result.videoPath,
      durationSeconds,
    };

    const clipUrl = `/api/video/${ctx.jobId}/${scene.sceneId}`;

    onEvent({ type: "scene-rendered", sceneId: scene.sceneId, clipUrl });
    onEvent({
      type: "scene-ready",
      sceneId: scene.sceneId,
      clipUrl,
      durationSeconds,
    });

    return {
      sceneId: scene.sceneId,
      codegenMs,
      validateMs,
      renderMs,
      totalMs: codegenMs + validateMs + renderMs,
      tokenUsage: sceneUsage
        ? {
            inputTokens: sceneUsage.inputTokens,
            outputTokens: sceneUsage.outputTokens,
            cacheReadTokens: sceneUsage.cacheReadTokens,
            cacheCreationTokens: sceneUsage.cacheCreationTokens,
            cachedTokens: sceneUsage.cachedTokens,
            estimatedCostUSD: calculateCost(sceneUsage),
          }
        : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scene processing failed.";
    onEvent({ type: "scene-failed", sceneId: scene.sceneId, error: message });
    return {
      sceneId: scene.sceneId,
      codegenMs,
      validateMs,
      renderMs,
      totalMs: codegenMs + validateMs + renderMs,
      tokenUsage: sceneUsage
        ? {
            inputTokens: sceneUsage.inputTokens,
            outputTokens: sceneUsage.outputTokens,
            cacheReadTokens: sceneUsage.cacheReadTokens,
            cacheCreationTokens: sceneUsage.cacheCreationTokens,
            cachedTokens: sceneUsage.cachedTokens,
            estimatedCostUSD: calculateCost(sceneUsage),
          }
        : undefined,
    };
  }
}

async function drainRegenerateQueue(params: {
  plan: () => PlanOutput;
  quality: "l" | "m" | "h";
  ctx: PipelineContext;
  controller: PipelineController;
  options?: PipelineInput["options"];
  onEvent: (event: PipelineEvent) => void;
  slots: Map<string, SceneSlot>;
}): Promise<void> {
  const { plan, quality, ctx, controller, options, onEvent, slots } = params;

  while (controller.regenerateQueue.length > 0) {
    if (ctx.signal?.aborted) break;

    const req = controller.regenerateQueue.shift()!;
    controller.regenerateInFlight.delete(req.sceneId);

    const currentPlan = plan();
    const baseScene = currentPlan.sceneBreakdown.find(
      (s) => s.sceneId === req.sceneId,
    );
    if (!baseScene) continue;

    const mergedScene: SceneEntry = req.sceneUpdate
      ? { ...baseScene, ...req.sceneUpdate }
      : baseScene;

    await processScene({
      scene: mergedScene,
      plan: currentPlan,
      quality,
      ctx,
      controller,
      options,
      onEvent,
      isRegeneration: true,
      slots,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Full Lesson Pipeline (6 stages)                                     */
/* ------------------------------------------------------------------ */

async function executeLessonPipeline(
  input: PipelineInput,
  ctx: PipelineContext,
  controller: PipelineController,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<PipelineManifest> {
  const { manifest, jobDir } = ctx;
  const quality = input.options?.quality ?? "m";

  const resumeFrom = input.resumeFrom;
  const stageOrder: PipelineStage[] = ["plan", "codegen", "validate", "render", "postprocess", "compose"];
  const shouldSkip = (stage: PipelineStage) => {
    if (!resumeFrom) return false;
    return stageOrder.indexOf(stage) < stageOrder.indexOf(resumeFrom);
  };

  const pipelineStartedAt = Date.now();
  const stageTimings: StageTiming[] = [];
  let planTimingMs = 0;
  let planProvider = "";
  let planModel = "";
  let planPromptSummary = "";
  let planUsage: LLMUsage | null = null;
  let codegenProvider = "";
  let codegenModel = "";
  let codegenPromptSummary = "";
  let workshopSceneTimings: SceneTiming[] = [];
  let codegenUsage: LLMUsage | null = null;

  try {
    // ── Stage 1: Plan ─────────────────────────────────────────────────
    let planOutput: PlanOutput;

    if (shouldSkip("plan") && input.cachedPlan) {
      planOutput = input.cachedPlan;
      const skipResult: StageResult = {
        stage: "plan",
        status: "skipped",
        artifacts: [],
        durationMs: 0,
      };
      manifest.stages.push(skipResult);
      onEvent({ type: "stage-complete", stage: "plan", result: skipResult });
      onEvent({ type: "plan-ready", plan: planOutput });
    } else {
      const planMeta = resolveProviderForTiming(input.options);
      planProvider = planMeta.provider;
      planModel = planMeta.model;
      planPromptSummary = input.conceptText
        ? `concept: "${input.conceptText.slice(0, 200)}"`
        : input.latexProblem
          ? `latex: "${input.latexProblem.slice(0, 200)}"`
          : "";

      const planStart = Date.now();
      const planResult = await runStage(
        "plan",
        () => planStage.execute(input, ctx),
        manifest,
        onEvent,
        signal,
      );
      planTimingMs = Date.now() - planStart;
      planOutput = planResult.output;
      planUsage = ctx.lastLLMUsage ?? null;
      onEvent({ type: "plan-ready", plan: planOutput });
    }

    stageTimings.push({
      stage: "plan",
      totalMs: planTimingMs,
      ...(planProvider && { llmProvider: planProvider, llmModel: planModel, promptSummary: planPromptSummary }),
      ...(planUsage && {
        tokenUsage: {
          inputTokens: planUsage.inputTokens,
          outputTokens: planUsage.outputTokens,
          cacheReadTokens: planUsage.cacheReadTokens,
          cacheCreationTokens: planUsage.cacheCreationTokens,
          cachedTokens: planUsage.cachedTokens,
          estimatedCostUSD: calculateCost(planUsage),
        },
      }),
    });

    controller.currentPlan = planOutput;

    // ── Plan approval gate ────────────────────────────────────────────
    const shouldGateApproval = !resumeFrom || resumeFrom === "plan";
    if (shouldGateApproval) {
      planOutput = await awaitPlanApproval(ctx, controller, planOutput, onEvent);
      controller.currentPlan = planOutput;
      updateGalleryEntry(ctx.jobId, {
        status: "building",
        currentStage: "codegen",
        title: planOutput.title,
        sceneCount: planOutput.sceneBreakdown.length,
        sceneBreakdown: planOutput.sceneBreakdown,
      });
      writePlan(ctx.jobDir, planOutput);
    }

    // Check abort before committing to work
    if (signal?.aborted) throw new StageError("plan", "Pipeline aborted.");

    // ── Per-scene loop (codegen → validate → render, streaming) ───────
    const slots = new Map<string, SceneSlot>();
    let renderOutput: RenderOutput;

    if (shouldSkip("codegen") && input.cachedScenes?.length) {
      const codegenOutput = { scenes: input.cachedScenes };
      const skipResult: StageResult = {
        stage: "codegen",
        status: "skipped",
        artifacts: [],
        durationMs: 0,
      };
      manifest.stages.push(skipResult);
      onEvent({ type: "stage-complete", stage: "codegen", result: skipResult });
      onEvent({ type: "codegen-ready", scenes: codegenOutput.scenes });

      let validateOutput: import("./types").ValidateOutput;
      if (shouldSkip("validate") && input.cachedScenes?.length) {
        validateOutput = { scenes: input.cachedScenes, issues: [] };
        const vSkip: StageResult = {
          stage: "validate",
          status: "skipped",
          artifacts: [],
          durationMs: 0,
        };
        manifest.stages.push(vSkip);
        onEvent({ type: "stage-complete", stage: "validate", result: vSkip });
      } else {
        const validateResult = await runStage(
          "validate",
          () => validateStage.execute(codegenOutput, ctx),
          manifest,
          onEvent,
          signal,
        );
        validateOutput = validateResult.output;
      }

      onEvent({
        type: "validation-report",
        scenes: codegenOutput.scenes.length,
        passed: validateOutput.scenes.length,
        issues: validateOutput.issues,
      });

      const renderResult = await runStage(
        "render",
        () =>
          renderStage.execute(
            { scenes: validateOutput.scenes, quality },
            ctx,
          ),
        manifest,
        onEvent,
        signal,
      );
      renderOutput = renderResult.output;

      if (renderOutput.clips.length === 0) {
        throw new StageError("render", "All scenes failed to render.");
      }

      for (const clip of renderOutput.clips) {
        const clipUrl = `/api/video/${ctx.jobId}/${clip.sceneId}`;
        onEvent({ type: "scene-rendered", sceneId: clip.sceneId, clipUrl });
        onEvent({
          type: "scene-ready",
          sceneId: clip.sceneId,
          clipUrl,
          durationSeconds: clip.durationSeconds,
        });
        slots.set(clip.sceneId, { issues: [], clip });
      }
    } else {
      // ── Workshop per-scene loop ─────────────────────────────────────
      onEvent({ type: "stage-start", stage: "codegen" });
      updateGalleryEntry(ctx.jobId, { status: "building", currentStage: "codegen" });

      const codegenMeta = resolveProviderForTiming(input.options);
      codegenProvider = codegenMeta.provider;
      codegenModel = codegenMeta.model;
      codegenPromptSummary = planOutput
        ? `plan: "${planOutput.title}" — ${planOutput.sceneBreakdown.length} scenes`
        : "";

      const SCENE_CONCURRENCY = 3;
      const scenes = controller.currentPlan!.sceneBreakdown;

      for (let batchStart = 0; batchStart < scenes.length; batchStart += SCENE_CONCURRENCY) {
        if (signal?.aborted) break;

        const batch = scenes.slice(batchStart, batchStart + SCENE_CONCURRENCY);
        const batchPromises = batch.map((scene) =>
          processScene({
            scene,
            plan: controller.currentPlan!,
            quality,
            ctx,
            controller,
            options: input.options,
            onEvent,
            isRegeneration: false,
            slots,
          }),
        );

        const batchResults = await Promise.allSettled(batchPromises);
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            workshopSceneTimings.push(result.value);
          }
        }

        await drainRegenerateQueue({
          plan: () => controller.currentPlan!,
          quality,
          ctx,
          controller,
          options: input.options,
          onEvent,
          slots,
        });
      }

      await drainRegenerateQueue({
        plan: () => controller.currentPlan!,
        quality,
        ctx,
        controller,
        options: input.options,
        onEvent,
        slots,
      });

      if (signal?.aborted) throw new StageError("render", "Pipeline aborted.");

      const allGenerated = Array.from(slots.values())
        .map((s) => s.generated)
        .filter((s): s is GeneratedScene => !!s);
      const allIssues = Array.from(slots.values()).flatMap((s) => s.issues);

      onEvent({ type: "codegen-ready", scenes: allGenerated });
      onEvent({
        type: "validation-report",
        scenes: controller.currentPlan!.sceneBreakdown.length,
        passed: allGenerated.length,
        issues: allIssues,
      });

      const workshopTotalMs = workshopSceneTimings.reduce((sum, s) => sum + s.totalMs, 0);
      const codegenResult: StageResult = {
        stage: "codegen",
        status: "success",
        artifacts: [],
        durationMs: workshopTotalMs,
      };
      manifest.stages.push(codegenResult);
      onEvent({ type: "stage-complete", stage: "codegen", result: codegenResult });

      const clips = controller.currentPlan!.sceneBreakdown
        .map((s) => slots.get(s.sceneId)?.clip)
        .filter(
          (c): c is { sceneId: string; videoPath: string; durationSeconds: number } =>
            !!c,
        );

      if (clips.length === 0) {
        throw new StageError("render", "All scenes failed to render.");
      }

      const failures = controller.currentPlan!.sceneBreakdown
        .filter((s) => !slots.get(s.sceneId)?.clip)
        .map((s) => ({ sceneId: s.sceneId, error: "Scene failed to produce a clip." }));

      renderOutput = { clips, failures };

      const renderStageResult: StageResult = {
        stage: "render",
        status: failures.length === 0 ? "success" : "error",
        artifacts: [],
        durationMs: workshopTotalMs,
      };
      manifest.stages.push(renderStageResult);
      onEvent({ type: "stage-complete", stage: "render", result: renderStageResult });
    }

    stageTimings.push({
      stage: "codegen",
      totalMs: workshopSceneTimings.reduce((sum, s) => sum + s.codegenMs, 0),
      ...(codegenProvider && { llmProvider: codegenProvider, llmModel: codegenModel, promptSummary: codegenPromptSummary }),
      sceneTimings: workshopSceneTimings.length > 0 ? workshopSceneTimings : undefined,
      ...(workshopSceneTimings.length > 0 && {
        tokenUsage: {
          inputTokens: workshopSceneTimings.reduce((sum, s) => sum + (s.tokenUsage?.inputTokens ?? 0), 0),
          outputTokens: workshopSceneTimings.reduce((sum, s) => sum + (s.tokenUsage?.outputTokens ?? 0), 0),
          cacheReadTokens: workshopSceneTimings.reduce((sum, s) => sum + (s.tokenUsage?.cacheReadTokens ?? 0), 0),
          cacheCreationTokens: workshopSceneTimings.reduce((sum, s) => sum + (s.tokenUsage?.cacheCreationTokens ?? 0), 0),
          cachedTokens: workshopSceneTimings.reduce((sum, s) => sum + (s.tokenUsage?.cachedTokens ?? 0), 0),
          estimatedCostUSD: workshopSceneTimings.reduce((sum, s) => sum + (s.tokenUsage?.estimatedCostUSD ?? 0), 0),
        },
      }),
    });

    stageTimings.push({
      stage: "validate",
      totalMs: workshopSceneTimings.reduce((sum, s) => sum + s.validateMs, 0),
    });

    stageTimings.push({
      stage: "render",
      totalMs: workshopSceneTimings.reduce((sum, s) => sum + s.renderMs, 0),
    });

    await pauseGate(ctx, controller, "postprocess", onEvent);

    planOutput = controller.currentPlan ?? planOutput;

    // -- Stage 5: Postprocess --
    let videoPath: string;
    let durationSeconds: number;

    if (input.options?.skipPostProcess) {
      videoPath = renderOutput.clips[0].videoPath;
      durationSeconds = renderOutput.clips.reduce((s, c) => s + c.durationSeconds, 0);
      const skipResult: StageResult = {
        stage: "postprocess",
        status: "skipped",
        artifacts: [],
        durationMs: 0,
      };
      manifest.stages.push(skipResult);
      onEvent({ type: "stage-complete", stage: "postprocess", result: skipResult });
      stageTimings.push({ stage: "postprocess", totalMs: 0 });
    } else {
      const postStart = Date.now();
      const postResult = await runStage(
        "postprocess",
        () =>
          postprocessStage.execute(
            {
              clips: renderOutput.clips,
              title: planOutput.title,
              quality: input.options?.quality ?? "m",
            },
            ctx,
          ),
        manifest,
        onEvent,
        signal,
      );
      const postMs = Date.now() - postStart;
      videoPath = postResult.output.videoPath;
      durationSeconds = postResult.output.durationSeconds;
      stageTimings.push({ stage: "postprocess", totalMs: postMs });
    }

    await pauseGate(ctx, controller, "compose", onEvent);

    // -- Stage 6: Compose --
    const composeStart = Date.now();
    const composeResult = await runStage(
      "compose",
      () =>
        composeStage.execute(
          {
            videoPath,
            durationSeconds,
            steps: planOutput.steps,
          },
          ctx,
        ),
      manifest,
      onEvent,
      signal,
    );
    const composeMs = Date.now() - composeStart;
    stageTimings.push({ stage: "compose", totalMs: composeMs });

    manifest.status = "complete";
    manifest.finalArtifact = {
      type: "video",
      path: composeResult.output.videoPath,
      metadata: {
        durationSeconds: composeResult.output.durationSeconds,
        title: planOutput.title,
        steps: planOutput.steps,
        sceneBreakdown: planOutput.sceneBreakdown,
      },
    };

    const completedAt = Date.now();
    const totalEstimatedCostUSD = stageTimings.reduce((sum, s) => sum + (s.tokenUsage?.estimatedCostUSD ?? 0), 0);
    writeManifest(jobDir, manifest);
    writeTiming(jobDir, {
      jobId: ctx.jobId,
      mode: "lesson",
      startedAt: pipelineStartedAt,
      completedAt,
      totalMs: completedAt - pipelineStartedAt,
      quality,
      conceptText: input.conceptText,
      latexProblem: input.latexProblem,
      totalEstimatedCostUSD,
      stages: stageTimings,
    });
    onEvent({ type: "pipeline-complete", manifest });
    return manifest;
  } catch (err) {
    const failedStage =
      err instanceof StageError ? err.stage : ("plan" as PipelineStage);
    const message = err instanceof Error ? err.message : "Unknown pipeline error";

    manifest.status = "failed";
    writeManifest(jobDir, manifest);
    updateGalleryEntry(ctx.jobId, {
      status: "failed",
      currentStage: failedStage,
    });
    onEvent({ type: "pipeline-error", error: message, failedStage });
    return manifest;
  }
}

/* ------------------------------------------------------------------ */
/*  Quick Viz Pipeline (3 stages: codegen → validate → render)          */
/* ------------------------------------------------------------------ */

async function executeVizPipeline(
  input: PipelineInput,
  ctx: PipelineContext,
  controller: PipelineController,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<PipelineManifest> {
  const { manifest, jobDir } = ctx;
  const quality = input.options?.quality ?? "m";

  const pipelineStartedAt = Date.now();
  const stageTimings: StageTiming[] = [];

  try {
    const vizMeta = resolveProviderForTiming(input.options);
    const vizPromptSummary = input.conceptText
      ? `concept: "${input.conceptText.slice(0, 200)}"`
      : input.latexProblem
        ? `latex: "${input.latexProblem.slice(0, 200)}"`
        : "";

    // -- Stage 1 (viz): Codegen --
    const codegenStart = Date.now();
    const codegenResult = await runStage(
      "codegen",
      () =>
        vizCodegenStage.execute(
          {
            conceptText: input.conceptText,
            latexProblem: input.latexProblem,
            options: input.options,
          },
          ctx,
        ),
      manifest,
      onEvent,
      signal,
    );
    const codegenMs = Date.now() - codegenStart;
    const codegenOutput = codegenResult.output;
    const vizUsage = ctx.lastLLMUsage ?? null;

    stageTimings.push({
      stage: "codegen",
      totalMs: codegenMs,
      llmProvider: vizMeta.provider,
      llmModel: vizMeta.model,
      promptSummary: vizPromptSummary,
      ...(vizUsage && {
        tokenUsage: {
          inputTokens: vizUsage.inputTokens,
          outputTokens: vizUsage.outputTokens,
          cacheReadTokens: vizUsage.cacheReadTokens,
          cacheCreationTokens: vizUsage.cacheCreationTokens,
          cachedTokens: vizUsage.cachedTokens,
          estimatedCostUSD: calculateCost(vizUsage),
        },
      }),
    });

    await pauseGate(ctx, controller, "validate", onEvent);

    // -- Stage 2 (viz): Validate --
    const validateStart = Date.now();
    const validateResult = await runStage(
      "validate",
      () => validateStage.execute(codegenOutput, ctx),
      manifest,
      onEvent,
      signal,
    );
    const validateMs = Date.now() - validateStart;
    const validateOutput = validateResult.output;

    stageTimings.push({ stage: "validate", totalMs: validateMs });

    onEvent({
      type: "validation-report",
      scenes: codegenOutput.scenes.length,
      passed: validateOutput.scenes.length,
      issues: validateOutput.issues,
    });

    await pauseGate(ctx, controller, "render", onEvent);

    // -- Stage 3 (viz): Render --
    const renderStart = Date.now();
    const renderResult = await runStage(
      "render",
      () =>
        renderStage.execute(
          { scenes: validateOutput.scenes, quality },
          ctx,
        ),
      manifest,
      onEvent,
      signal,
    );
    const renderMs = Date.now() - renderStart;
    const renderOutput = renderResult.output;

    stageTimings.push({ stage: "render", totalMs: renderMs });

    if (renderOutput.clips.length === 0) {
      throw new StageError("render", "All scenes failed to render.");
    }

    const clip = renderOutput.clips[0];
    const outputPath = join(jobDir, "output.mp4");
    if (existsSync(clip.videoPath)) {
      copyFileSync(clip.videoPath, outputPath);
    }

    onEvent({
      type: "scene-rendered",
      sceneId: clip.sceneId,
      clipUrl: `/api/video/${ctx.jobId}/${clip.sceneId}`,
    });

    manifest.status = "complete";
    manifest.finalArtifact = {
      type: "video",
      path: existsSync(outputPath) ? outputPath : clip.videoPath,
      metadata: {
        durationSeconds: clip.durationSeconds,
        title: input.conceptText?.slice(0, 80) ?? "Quick Visualization",
      },
    };

    const completedAt = Date.now();
    const totalEstimatedCostUSD = stageTimings.reduce((sum, s) => sum + (s.tokenUsage?.estimatedCostUSD ?? 0), 0);
    writeManifest(jobDir, manifest);
    writeTiming(jobDir, {
      jobId: ctx.jobId,
      mode: "viz",
      startedAt: pipelineStartedAt,
      completedAt,
      totalMs: completedAt - pipelineStartedAt,
      quality,
      conceptText: input.conceptText,
      latexProblem: input.latexProblem,
      totalEstimatedCostUSD,
      stages: stageTimings,
    });
    onEvent({ type: "pipeline-complete", manifest });
    return manifest;
  } catch (err) {
    const failedStage =
      err instanceof StageError ? err.stage : ("codegen" as PipelineStage);
    const message = err instanceof Error ? err.message : "Unknown pipeline error";

    manifest.status = "failed";
    writeManifest(jobDir, manifest);
    updateGalleryEntry(ctx.jobId, {
      status: "failed",
      currentStage: failedStage,
    });
    onEvent({ type: "pipeline-error", error: message, failedStage });
    return manifest;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal: run a single stage with timing + error handling           */
/* ------------------------------------------------------------------ */

class StageError extends Error {
  constructor(
    public stage: PipelineStage,
    message: string,
  ) {
    super(message);
    this.name = "StageError";
  }
}

function resolveProviderForTiming(options?: PipelineInput["options"]): { provider: string; model: string } {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const requested = options?.provider ?? process.env.ANIMATION_PROVIDER?.toLowerCase();

  if (requested === "anthropic" && anthropicKey) return { provider: "anthropic", model: "claude-sonnet-4-6" };
  if (requested === "deepseek" && deepseekKey) return { provider: "deepseek", model: "deepseek-chat" };
  if (requested === "openai" && openaiKey) return { provider: "openai", model: "gpt-4o" };
  if (anthropicKey) return { provider: "anthropic", model: "claude-sonnet-4-6" };
  if (deepseekKey) return { provider: "deepseek", model: "deepseek-chat" };
  if (openaiKey) return { provider: "openai", model: "gpt-4o" };
  return { provider: "unknown", model: "unknown" };
}

type StageTimingMeta = {
  llmProvider?: string;
  llmModel?: string;
  promptSummary?: string;
};

async function runStage<T>(
  stage: PipelineStage,
  factory: () => AsyncGenerator<PipelineEvent, T, undefined>,
  manifest: PipelineManifest,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
  meta?: StageTimingMeta,
): Promise<{ output: T; result: StageResult }> {
  if (signal?.aborted) {
    throw new StageError(stage, "Pipeline aborted.");
  }

  onEvent({ type: "stage-start", stage });
  updateGalleryStage(manifest.jobId, stage);
  const start = Date.now();

  try {
    const gen = factory();
    let iterResult = await gen.next();

    while (!iterResult.done) {
      if (signal?.aborted) {
        await gen.return(undefined as unknown as T);
        throw new StageError(stage, "Pipeline aborted.");
      }
      onEvent(iterResult.value);
      iterResult = await gen.next();
    }

    const output = iterResult.value;
    const stageResult: StageResult = {
      stage,
      status: "success",
      artifacts: [],
      durationMs: Date.now() - start,
    };

    manifest.stages.push(stageResult);
    onEvent({ type: "stage-complete", stage, result: stageResult });
    return { output, result: stageResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stageResult: StageResult = {
      stage,
      status: "error",
      artifacts: [],
      durationMs: Date.now() - start,
      error: message,
    };
    manifest.stages.push(stageResult);
    onEvent({ type: "stage-complete", stage, result: stageResult });

    if (err instanceof StageError) throw err;
    throw new StageError(stage, message);
  }
}
