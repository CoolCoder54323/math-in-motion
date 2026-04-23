import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createJobDir, writeManifest, writeTiming, writePlan, writeConceptText, writeSceneStates } from "./job-manager";
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
import type { SceneStates } from "@/lib/store";
import { calculateCost, type LLMUsage } from "./llm-usage";

import { planStage } from "./stages/plan";
import { codegenSingleScene } from "./stages/codegen";
import { vizCodegenStage } from "./stages/viz-codegen";
import { validateStage, validateSingleScene } from "./stages/validate";
import { renderStage, renderScene } from "./stages/render";
import { postprocessStage } from "./stages/postprocess";
import { composeStage } from "./stages/compose";
import { lintScenePedagogy } from "./stages/pedagogy-lint";
import { resolveProvider, getProviderModel } from "./llm-client";
import { getMediaInfo, extractThumbnail } from "./ffmpeg-runner";
import { compileScene, persistCompiledScene } from "./compiler";

/* ------------------------------------------------------------------ */
/*  Gallery status updates at stage transitions                         */
/* ------------------------------------------------------------------ */

function persistSceneStates(
  jobDir: string,
  sceneStates: SceneStates,
): void {
  try {
    writeSceneStates(jobDir, sceneStates);
  } catch {
    // Non-critical — best-effort persistence
  }
}

const STAGE_TO_GALLERY_STAGE: Record<PipelineStage, GalleryEntryStatus> = {
  plan: "generating",
  codegen: "building",
  validate: "building",
  render: "building",
  postprocess: "building",
  compose: "building",
};

async function updateGalleryStage(jobId: string, stage: PipelineStage): Promise<void> {
  const status = STAGE_TO_GALLERY_STAGE[stage];
  try {
    await updateGalleryEntry(jobId, {
      status,
      currentStage: stage,
    });
  } catch (err) {
    console.warn(`[updateGalleryStage] Failed to update gallery for ${jobId}:`, err);
    // Non-critical — continue pipeline
  }
}

/* ------------------------------------------------------------------ */
/*  Thumbnail scene generation                                          */
/*                                                                      */
/*  The thumbnail is injected as the first scene in every lesson plan.  */
/*  It renders a static title card via Manim; the first frame is        */
/*  extracted as thumbnail.jpg for gallery cards.                       */
/* ------------------------------------------------------------------ */

function generateThumbnailCode(title: string): GeneratedScene {
  return compileScene(
    {
      metadata: {
        sceneId: "thumbnail",
        role: "hook",
        visualIntent: `Lesson thumbnail for ${title}`,
        densityTarget: 0.26,
        baseClass: "Scene",
      },
      layout: {
        safeArea: { xMin: -6.5, xMax: 6.5, yMin: -3.5, yMax: 3.5 },
        zones: [
          { id: "title", x: 0, y: 1.0, width: 10.8, height: 1.4, note: "title lane" },
          { id: "hero", x: 0, y: -0.9, width: 10.8, height: 2.8, note: "hero lane" },
        ],
      },
      objects: [
        {
          id: "lesson_title",
          kind: "text",
          role: "title",
          anchor: { zone: "title", align: "center" },
          props: { text: title, fontSize: 50 },
          relatedTo: [],
          zIndex: 2,
        },
        {
          id: "brand_card",
          kind: "compound.callout_card",
          role: "subtitle",
          anchor: { zone: "hero", align: "center" },
          props: {
            title: "Math in Motion",
            body: "Animated lesson ready to build",
            width: 5.4,
            height: 2.2,
          },
          relatedTo: [],
          zIndex: 1,
        },
      ],
      beats: [
        {
          id: "thumbnail_intro",
          narration: "",
          actions: [
            { type: "show", targets: ["lesson_title"], animation: "write", runTime: 0.7 },
            { type: "show", targets: ["brand_card"], animation: "fade_in", runTime: 0.6 },
          ],
          holdSeconds: 0.2,
        },
      ],
    },
    "ThumbnailScene",
  );
}

function injectThumbnailScene(plan: PlanOutput): PlanOutput {
  if (plan.sceneBreakdown.some((s) => s.sceneId === "thumbnail")) {
    return plan;
  }
  const thumbnailScene: SceneEntry = {
    sceneId: "thumbnail",
    description: "Thumbnail",
    mathContent: "",
    estimatedSeconds: 1,
    role: "hook",
  };
  const thumbnailStep = {
    label: "Thumbnail",
    narration: "",
  };
  return {
    ...plan,
    sceneBreakdown: [thumbnailScene, ...plan.sceneBreakdown],
    steps: [thumbnailStep, ...plan.steps],
  };
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

  /** Persisted per-scene state, written to scenes.json on every transition. */
  sceneStates: SceneStates;

  /** When true, pipeline auto-continues past approval and build gates. */
  autoContinue: boolean;

  /** Timestamp (ms) of last approval-screen heartbeat. */
  lastApprovalHeartbeat: number;

  /** Called by the control route to unblock the confirmation gate. */
  confirmPipeline: (() => void) | null;

  /** The promise that the executor awaits at the confirmation gate. */
  confirmationPromise: Promise<void> | null;
};

const activeJobs = new Map<string, PipelineController>();

export function getController(jobId: string): PipelineController | undefined {
  return activeJobs.get(jobId);
}

export function listControllers(): { jobId: string; controller: PipelineController }[] {
  return Array.from(activeJobs.entries()).map(([jobId, controller]) => ({ jobId, controller }));
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
  abortCtrl?: AbortController,
): Promise<PipelineManifest> {
  const mode: PipelineMode = input.mode ?? "lesson";
  const { jobId, jobDir } = createJobDir();

  // Copy requested assets into the job directory so renderStage can use them
  if (input.options?.assets && input.options.assets.length > 0) {
    const globalAssetsDir = join(process.cwd(), ".manim-output", "assets");
    const jobAssetsDir = join(jobDir, "assets");
    mkdirSync(jobAssetsDir, { recursive: true });
    for (const name of input.options.assets) {
      const src = join(globalAssetsDir, name);
      if (existsSync(src)) {
        copyFileSync(src, join(jobAssetsDir, name));
      }
    }
  }

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
    signal: abortCtrl?.signal,
    pauseRequested: false,
    assets: input.options?.assets,
  };

  // Register controller for external pause/resume
  const pipelineAbortCtrl = abortCtrl ?? new AbortController();
  ctx.signal = pipelineAbortCtrl.signal;

  const controller: PipelineController = {
    ctx,
    abort: pipelineAbortCtrl,
    resume: () => {},
    pausePromise: null,
    currentPlan: null,
    approvePlan: null,
    currentSceneAbort: null,
    regenerateQueue: [],
    regenerateInFlight: new Set(),
    subscribers: [],
    sceneStates: {},
    autoContinue: input.options?.autoContinue ?? true,
    lastApprovalHeartbeat: 0,
    confirmPipeline: null,
    confirmationPromise: null,
  };
  activeJobs.set(jobId, controller);

  const broadcast = (event: PipelineEvent) => {
    onEvent(event);
    for (const cb of controller.subscribers) {
      try { cb(event); } catch { /* subscriber disconnected */ }
    }

    // Persist per-scene state transitions to disk
    let shouldPersist = false;
    switch (event.type) {
      case "scene-generating":
        controller.sceneStates[event.sceneId] = { status: "generating" };
        shouldPersist = true;
        break;
      case "scene-regenerating":
        controller.sceneStates[event.sceneId] = { status: "regenerating" };
        shouldPersist = true;
        break;
      case "scene-ready":
        controller.sceneStates[event.sceneId] = {
          status: "ready",
          clipUrl: event.clipUrl,
          durationSeconds: event.durationSeconds,
          inputTokens: event.tokenUsage?.inputTokens,
          outputTokens: event.tokenUsage?.outputTokens,
          cachedTokens: event.tokenUsage?.cachedTokens,
          estimatedCostUSD: event.tokenUsage?.estimatedCostUSD,
        };
        shouldPersist = true;
        break;
      case "scene-failed":
        controller.sceneStates[event.sceneId] = {
          status: "failed",
          error: event.error,
          inputTokens: event.tokenUsage?.inputTokens,
          outputTokens: event.tokenUsage?.outputTokens,
          cachedTokens: event.tokenUsage?.cachedTokens,
          estimatedCostUSD: event.tokenUsage?.estimatedCostUSD,
        };
        shouldPersist = true;
        break;
      case "plan-awaiting-approval":
      case "plan-ready":
        for (const scene of event.plan.sceneBreakdown) {
          if (!controller.sceneStates[scene.sceneId]) {
            controller.sceneStates[scene.sceneId] = { status: "pending" };
          }
        }
        shouldPersist = true;
        break;
    }
    if (shouldPersist) {
      persistSceneStates(jobDir, controller.sceneStates);
    }
  };

  writeConceptText(jobDir, input.conceptText || input.latexProblem || "");
  initGalleryEntry(jobId, mode, input.conceptText || input.latexProblem || undefined);

  broadcast({ type: "pipeline-started", jobId });

  try {
    if (mode === "lesson") {
      return await executeLessonPipeline(input, ctx, controller, broadcast, pipelineAbortCtrl.signal);
    } else {
      return await executeVizPipeline(input, ctx, controller, broadcast, pipelineAbortCtrl.signal);
    }
  } finally {
    activeJobs.delete(jobId);
  }
}

/* ------------------------------------------------------------------ */
/*  Pause gate — called between stages                                  */
/* ------------------------------------------------------------------ */

const PAUSE_GATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout on pause

async function pauseGate(
  ctx: PipelineContext,
  controller: PipelineController,
  currentStage: PipelineStage,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  if (!ctx.pauseRequested) return;

  ctx.manifest.status = "paused";
  writeManifest(ctx.jobDir, ctx.manifest); // Persist paused state immediately
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

  // Race between resume and timeout
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error(`Pause timeout exceeded (${PAUSE_GATE_TIMEOUT_MS}ms)`)), PAUSE_GATE_TIMEOUT_MS);
  });

  try {
    await Promise.race([pausePromise, timeoutPromise]);
  } catch {
    // Timeout - auto-resume
    console.warn(`[pauseGate] Auto-resuming pipeline ${ctx.jobId} after timeout`);
  }

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
  writeManifest(ctx.jobDir, ctx.manifest); // Persist state immediately
  try {
    await updateGalleryEntry(ctx.jobId, {
      status: "awaiting-approval",
      currentStage: "plan",
      title: plan.title,
      sceneCount: plan.sceneBreakdown.length,
      sceneBreakdown: plan.sceneBreakdown,
    });
  } catch (err) {
    console.warn(`[awaitPlanApproval] Failed to update gallery for ${ctx.jobId}:`, err);
  }
  onEvent({ type: "plan-awaiting-approval", plan });

  if (!controller.autoContinue) {
    return await waitForManualApproval(ctx, controller, plan);
  }

  // Auto-continue ON: poll for 5 seconds for an approval-screen heartbeat.
  // If the user is on the ApprovalScreen, it sends a heartbeat every 3s.
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (controller.lastApprovalHeartbeat > 0) {
      // User is present — wait indefinitely for manual approval
      return await waitForManualApproval(ctx, controller, plan);
    }
  }

  // No heartbeat after 5s — user left. Auto-approve.
  console.log(`[awaitPlanApproval] Auto-approving plan for ${ctx.jobId}`);
  ctx.manifest.status = "running";
  writeManifest(ctx.jobDir, ctx.manifest);
  try {
    await updateGalleryEntry(ctx.jobId, {
      status: "building",
      currentStage: "codegen",
    });
  } catch (err) {
    console.warn(`[awaitPlanApproval] Failed to update gallery for ${ctx.jobId}:`, err);
  }
  return plan;
}

function waitForManualApproval(
  ctx: PipelineContext,
  controller: PipelineController,
  plan: PlanOutput,
): Promise<PlanOutput> {
  return new Promise<PlanOutput>((resolve) => {
    controller.approvePlan = (edited: PlanOutput) => {
      controller.approvePlan = null;
      ctx.manifest.status = "running";
      writeManifest(ctx.jobDir, ctx.manifest);
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
}

/* ------------------------------------------------------------------ */
/*  Confirmation gate — blocks after render until user continues        */
/* ------------------------------------------------------------------ */

async function confirmationGate(
  ctx: PipelineContext,
  controller: PipelineController,
  renderOutput: RenderOutput,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  const currentPlan = requireCurrentPlan(controller);
  const totalScenes = currentPlan.sceneBreakdown.length;
  const failedCount = renderOutput.failures.length;

  // Auto-continue ON + zero failures = proceed immediately
  if (controller.autoContinue && failedCount === 0) return;

  // Otherwise block and wait for manual continue
  ctx.manifest.status = "awaiting-confirmation";
  writeManifest(ctx.jobDir, ctx.manifest);

  onEvent({
    type: "pipeline-awaiting-confirmation",
    failedCount,
    totalScenes,
    canContinue: failedCount === 0,
  });

  const confirmationPromise = new Promise<void>((resolve) => {
    controller.confirmPipeline = () => {
      controller.confirmPipeline = null;
      resolve();
    };
  });
  controller.confirmationPromise = confirmationPromise;
  await confirmationPromise;
  controller.confirmationPromise = null;
  ctx.manifest.status = "running";
}

function requireCurrentPlan(controller: PipelineController): PlanOutput {
  if (!controller.currentPlan) {
    throw new Error("Pipeline is missing currentPlan.");
  }
  return controller.currentPlan;
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

export async function processScene(params: {
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

  const maxAttempts = isRegeneration ? 1 : 2;
  let errorFeedback: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let currentCodegenMs = 0;
    let currentValidateMs = 0;
    let currentRenderMs = 0;
    let attemptScene: GeneratedScene | null = null;
    let attemptIssues: (ValidationIssue | import("./stages/pedagogy-lint").PedagogyIssue)[] = [];

    // ── Attempt: codegen ──────────────────────────────────────────────
    try {
      let generated: GeneratedScene;
      const codegenStart = Date.now();
      if (scene.sceneId === "thumbnail") {
        generated = generateThumbnailCode(plan.title);
        persistCompiledScene(ctx.jobDir, generated);
      } else {
        const { scene: g, usage } = await codegenSingleScene(
          scene,
          plan,
          ctx,
          options,
          errorFeedback,
        );
        generated = g;
        if (usage) sceneUsage = usage;
      }
      currentCodegenMs = Date.now() - codegenStart;

      const validateStart = Date.now();
      const validation = await validateSingleScene(generated, ctx);
      currentValidateMs = Date.now() - validateStart;
      attemptScene = validation.scene;
      attemptIssues = [...validation.issues];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts - 1) {
        errorFeedback = `CODEGEN/VALIDATION ERROR: ${msg}`;
        console.warn(
          `[processScene] Scene "${scene.sceneId}" attempt ${attempt + 1} codegen/validation failed, retrying`,
        );
        continue;
      }
      onEvent({
        type: "scene-failed",
        sceneId: scene.sceneId,
        error: msg,
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
      });
      return {
        sceneId: scene.sceneId,
        codegenMs: currentCodegenMs,
        validateMs: currentValidateMs,
        renderMs: currentRenderMs,
        totalMs: currentCodegenMs + currentValidateMs + currentRenderMs,
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

    // ── Pedagogy lint ─────────────────────────────────────────────────
    if (attemptScene) {
      const pedagogyIssues = lintScenePedagogy(attemptScene.pythonCode, scene);
      attemptIssues = [...attemptIssues, ...pedagogyIssues];
    }

    const errorIssues = attemptIssues.filter((i) => i.severity === "error");
    if (errorIssues.length > 0) {
      if (attempt < maxAttempts - 1) {
        errorFeedback = errorIssues
          .map((e) => {
            const rule = "rule" in e ? e.rule : "VALIDATION";
            const fix = "fix" in e ? e.fix : "Fix the reported issue.";
            return `RULE ${rule} VIOLATION: ${e.message}\nREQUIRED FIX: ${fix}`;
          })
          .join("\n\n");
        console.warn(
          `[processScene] Scene "${scene.sceneId}" attempt ${attempt + 1} pedagogy lint failed (${errorIssues.length} errors), retrying`,
        );
        continue;
      }
    }

    // ── Attempt: render ───────────────────────────────────────────────
    let renderResult: import("./stages/render").SceneRenderResult | null = null;

    try {
      const sceneAbort = new AbortController();
      controller.currentSceneAbort = sceneAbort;

      const onPipelineAbort = () => sceneAbort.abort();
      if (ctx.signal) {
        if (ctx.signal.aborted) sceneAbort.abort();
        else ctx.signal.addEventListener("abort", onPipelineAbort, { once: true });
      }

      const renderStart = Date.now();
      const result = await renderScene(
        attemptScene,
        ctx.jobDir,
        quality,
        sceneAbort.signal,
        ctx.assets,
      );
      currentRenderMs = Date.now() - renderStart;

      if (ctx.signal) ctx.signal.removeEventListener("abort", onPipelineAbort);
      controller.currentSceneAbort = null;

      if (!result.ok) {
        if (attempt < maxAttempts - 1) {
          errorFeedback = `RENDER ERROR: ${result.error}`;
          console.warn(
            `[processScene] Scene "${scene.sceneId}" render failed after preflight, retrying with repair feedback`,
          );
          continue;
        }
        throw new Error(result.error);
      }

      renderResult = result;

      // ── Success ─────────────────────────────────────────────────────
      codegenMs = currentCodegenMs;
      validateMs = currentValidateMs;
      renderMs = currentRenderMs;
      slot.generated = attemptScene;
      slot.issues = attemptIssues;

      let durationSeconds = 0;
      try {
        const info = await getMediaInfo(renderResult.videoPath);
        durationSeconds = info.durationSeconds;
      } catch (err) {
        console.warn(`[render] getMediaInfo failed for ${scene.sceneId}:`, err);
      }

      slot.clip = {
        sceneId: scene.sceneId,
        videoPath: renderResult.videoPath,
        durationSeconds,
      };

      const clipUrl = `/api/video/${ctx.jobId}/${scene.sceneId}`;

      onEvent({ type: "scene-rendered", sceneId: scene.sceneId, clipUrl });
      onEvent({
        type: "scene-ready",
        sceneId: scene.sceneId,
        clipUrl,
        durationSeconds,
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
      if (attempt < maxAttempts - 1) {
        errorFeedback = `RENDER ERROR: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(
          `[processScene] Scene "${scene.sceneId}" attempt ${attempt + 1} render exception, retrying`,
        );
        break; // break inner while, outer for will continue
      }
      const message = err instanceof Error ? err.message : "Scene processing failed.";
      onEvent({
        type: "scene-failed",
        sceneId: scene.sceneId,
        error: message,
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
      });
      return {
        sceneId: scene.sceneId,
        codegenMs: currentCodegenMs,
        validateMs: currentValidateMs,
        renderMs: currentRenderMs,
        totalMs: currentCodegenMs + currentValidateMs + currentRenderMs,
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

  // Unreachable — every path inside the loop returns or continues.
  return null;
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
  const workshopSceneTimings: SceneTiming[] = [];

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

    // Inject thumbnail as the first scene in every lesson plan
    planOutput = injectThumbnailScene(planOutput);

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
      try {
        await updateGalleryEntry(ctx.jobId, {
          status: "building",
          currentStage: "codegen",
          title: planOutput.title,
          sceneCount: planOutput.sceneBreakdown.length,
          sceneBreakdown: planOutput.sceneBreakdown,
        });
      } catch (err) {
        console.warn(`[executeLessonPipeline] Failed to update gallery for ${ctx.jobId}:`, err);
      }
      writePlan(ctx.jobDir, planOutput);
    }

    // Ensure thumbnail is present after plan approval (user may have edited it out)
    planOutput = injectThumbnailScene(planOutput);
    controller.currentPlan = planOutput;

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

      await confirmationGate(ctx, controller, renderOutput, onEvent);
      if (signal?.aborted) throw new StageError("render", "Pipeline aborted.");

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
      try {
        await updateGalleryEntry(ctx.jobId, { status: "building", currentStage: "codegen" });
      } catch (err) {
        console.warn(`[executeLessonPipeline] Failed to update gallery for ${ctx.jobId}:`, err);
      }

      const codegenMeta = resolveProviderForTiming(input.options);
      codegenProvider = codegenMeta.provider;
      codegenModel = codegenMeta.model;
      codegenPromptSummary = planOutput
        ? `plan: "${planOutput.title}" — ${planOutput.sceneBreakdown.length} scenes`
        : "";

      const SCENE_CONCURRENCY = 7;
      const scenes = requireCurrentPlan(controller).sceneBreakdown;

      for (let batchStart = 0; batchStart < scenes.length; batchStart += SCENE_CONCURRENCY) {
        if (signal?.aborted) break;

        const batch = scenes.slice(batchStart, batchStart + SCENE_CONCURRENCY);
        const batchPromises = batch.map((scene) =>
          processScene({
            scene,
            plan: requireCurrentPlan(controller),
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
          plan: () => requireCurrentPlan(controller),
          quality,
          ctx,
          controller,
          options: input.options,
          onEvent,
          slots,
        });
      }

      await drainRegenerateQueue({
        plan: () => requireCurrentPlan(controller),
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
        scenes: requireCurrentPlan(controller).sceneBreakdown.length,
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

      const clips = requireCurrentPlan(controller).sceneBreakdown
        .map((s) => slots.get(s.sceneId)?.clip)
        .filter(
          (c): c is { sceneId: string; videoPath: string; durationSeconds: number } =>
            !!c,
        );

      if (clips.length === 0) {
        throw new StageError("render", "All scenes failed to render.");
      }

      const failures = requireCurrentPlan(controller).sceneBreakdown
        .filter((s) => !slots.get(s.sceneId)?.clip)
        .map((s) => ({ sceneId: s.sceneId, error: "Scene failed to produce a clip." }));

      renderOutput = { clips, failures };

      await confirmationGate(ctx, controller, renderOutput, onEvent);
      if (signal?.aborted) throw new StageError("render", "Pipeline aborted.");

      const renderStageResult: StageResult = {
        stage: "render",
        status: failures.length === 0 ? "success" : "error",
        artifacts: [],
        durationMs: workshopTotalMs,
      };
      manifest.stages.push(renderStageResult);
      onEvent({ type: "stage-complete", stage: "render", result: renderStageResult });

      // Extract thumbnail frame from the thumbnail scene clip
      const thumbnailClip = renderOutput.clips.find((c) => c.sceneId === "thumbnail");
      if (thumbnailClip) {
        try {
          const thumbnailPath = join(ctx.jobDir, "thumbnail.jpg");
          await extractThumbnail(thumbnailClip.videoPath, thumbnailPath, 0.05);
        } catch (thumbErr) {
          console.warn(`[executeLessonPipeline] Failed to extract thumbnail for ${ctx.jobId}:`, thumbErr);
        }
      }
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
            sceneBreakdown: planOutput.sceneBreakdown,
            clips: renderOutput.clips,
            outputMode: input.options?.outputMode,
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
    try {
      await updateGalleryEntry(ctx.jobId, {
        status: "failed",
        currentStage: failedStage,
      });
    } catch (galleryErr) {
      console.warn(`[executeLessonPipeline] Failed to update gallery on error for ${ctx.jobId}:`, galleryErr);
    }
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

    await confirmationGate(ctx, controller, renderOutput, onEvent);
    if (signal?.aborted) throw new StageError("render", "Pipeline aborted.");

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
    try {
      await updateGalleryEntry(ctx.jobId, {
        status: "failed",
        currentStage: failedStage,
      });
    } catch (galleryErr) {
      console.warn(`[executeVizPipeline] Failed to update gallery on error for ${ctx.jobId}:`, galleryErr);
    }
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
  try {
    const { provider } = resolveProvider(options);
    return { provider, model: getProviderModel(provider, options?.model) };
  } catch {
    return { provider: "unknown", model: "unknown" };
  }
}

async function runStage<T>(
  stage: PipelineStage,
  factory: () => AsyncGenerator<PipelineEvent, T, undefined>,
  manifest: PipelineManifest,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<{ output: T; result: StageResult }> {
  if (signal?.aborted) {
    throw new StageError(stage, "Pipeline aborted.");
  }

  onEvent({ type: "stage-start", stage });
  await updateGalleryStage(manifest.jobId, stage);
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
