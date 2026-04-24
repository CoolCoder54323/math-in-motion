"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MathText } from "@/components/MathText";
import { PipelineProgress } from "@/components/PipelineProgress";
import { LessonWorkshop } from "@/components/LessonWorkshop";
import {
  useAppStore,
  type AnimationPlan,
  type AnimationStep,
  type RenderStatus,
} from "@/lib/store";
import { useTimedProgress } from "@/hooks/useTimedProgress";

export function AnimationPreview() {
  const plan = useAppStore((s) => s.animationPlan);
  const isLoading = useAppStore((s) => s.loading === "plan");
  const isPipeline = useAppStore((s) => s.loading === "pipeline");
  const videoUrl = useAppStore((s) => s.videoUrl);

  // Pipeline mode: show live pipeline view
  if (isPipeline) {
    return (
      <figure className="relative">
        <PreviewBorder />
        <LivePipelineView />
        <figcaption className="mt-4 text-center font-heading text-xs italic uppercase tracking-[0.3em] text-[color:var(--umber)]/55">
          &#x2736; building your animation &#x2736;
        </figcaption>
      </figure>
    );
  }

  // Pipeline complete: show video
  if (!plan && videoUrl) {
    return (
      <figure className="relative">
        <PreviewBorder />
        <PipelineResult />
        <figcaption className="mt-4 text-center font-heading text-xs italic uppercase tracking-[0.3em] text-[color:var(--umber)]/55">
          &#x2736; your animation is ready &#x2736;
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="relative">
      <PreviewBorder />
      {plan ? <Stage plan={plan} /> : <EmptyStage isLoading={isLoading} />}
      <figcaption className="mt-4 text-center font-heading text-xs italic uppercase tracking-[0.3em] text-[color:var(--umber)]/55">
        {plan
          ? "&#x2736; a fresh animation plan &#x2736;"
          : isLoading
            ? "&#x2736; planting the idea &#x2736;"
            : "&#x2736; an empty stage, waiting &#x2736;"}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared hand-drawn border                                            */
/* ------------------------------------------------------------------ */

function PreviewBorder() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 500"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full text-[color:var(--rule)]"
    >
      <path
        d="M12 18 Q 250 6, 500 14 T 988 16 Q 996 140, 990 260 T 986 484 Q 700 494, 500 488 T 14 486 Q 6 340, 10 200 T 12 18 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Live Pipeline View — shows per-stage artifacts as they arrive       */
/* ------------------------------------------------------------------ */

function LivePipelineView() {
  const streamingTitle = useAppStore((s) => s.streamingTitle);
  const pipelineMode = useAppStore((s) => s.pipelineMode);
  const isPaused = useAppStore((s) => s.isPaused);
  const currentStage = useAppStore((s) => s.currentStage);
  const pipelineStages = useAppStore((s) => s.pipelineStages);
  const livePlan = useAppStore((s) => s.livePlan);

  // ?debug=1 keeps the old engineering stepper visible instead of the workshop.
  // Safe to read window.location lazily: this subtree only mounts once loading
  // flips to "pipeline" (i.e., always client-side, never during SSR).
  const isDebug = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("debug");
  }, []);

  // Workshop takes over in lesson mode once we have a plan to show. Viz mode,
  // debug mode, and the pre-plan moment all fall back to the legacy stepper
  // (which still renders a nice skeleton before plan-ready).
  const useWorkshop = pipelineMode === "lesson" && !isDebug && !!livePlan;

  // Count completed stages for the subtitle (legacy branch only).
  const completedCount = pipelineStages.filter(
    (s) => s.status === "success" || s.status === "skipped",
  ).length;
  const totalCount = pipelineStages.length;

  return (
    <div className="relative flex min-h-[420px] flex-col gap-8 px-4 py-10 md:px-8">
      {useWorkshop ? (
        <LessonWorkshop />
      ) : (
        <>
          {/* Header (legacy: engineering stepper) */}
          <div className="step-card-enter flex flex-col items-center gap-3 text-center">
            <div className="sway flex size-14 items-center justify-center text-4xl">
              {isPaused
                ? "\u23F8\uFE0F"
                : pipelineMode === "viz"
                  ? "\u26A1"
                  : "\uD83C\uDF3B"}
            </div>
            <h4 className="font-heading text-2xl font-semibold italic tracking-tight text-[color:var(--umber)] md:text-3xl">
              {isPaused
                ? "Paused \u2014 review & edit"
                : streamingTitle ||
                  (pipelineMode === "viz"
                    ? "Building visualization\u2026"
                    : "Building your animation\u2026")}
            </h4>
            <p className="font-heading text-xs italic text-[color:var(--umber)]/50">
              {isPaused
                ? "You can review each step, edit your prompt, or redo from any step."
                : `Step ${Math.min(completedCount + 1, totalCount)} of ${totalCount} \u2014 ${
                    currentStage
                      ? currentStage.charAt(0).toUpperCase() +
                        currentStage.slice(1)
                      : "Starting"
                  }`}
            </p>
          </div>

          {/* Single-column animated timeline */}
          <PipelineProgress />
        </>
      )}

      {/* Floating control bar (pause/stop) — shared by both branches */}
      <FloatingControls />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Controls — pause / stop / resume                          */
/* ------------------------------------------------------------------ */

function FloatingControls() {
  const abortGeneration = useAppStore((s) => s.abortGeneration);
  const isPaused = useAppStore((s) => s.isPaused);
  const pipelineJobId = useAppStore((s) => s.pipelineJobId);
  const planApprovalPending = useAppStore((s) => s.planApprovalPending);
  const setPaused = useAppStore((s) => s.setPaused);

  const onPause = async () => {
    if (!pipelineJobId) return;
    try {
      await fetch(`/api/pipeline/${pipelineJobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      setPaused(true);
    } catch {
      // Handled silently
    }
  };

  const onResume = async () => {
    if (!pipelineJobId) return;
    try {
      await fetch(`/api/pipeline/${pipelineJobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      setPaused(false);
    } catch {
      // Handled silently
    }
  };

  if (!abortGeneration) return null;

  const showPauseToggle = !planApprovalPending;

  return (
    <div className="controls-float-up sticky bottom-6 z-10 flex justify-center">
      <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--paper)] px-2 py-2 shadow-[0_16px_50px_-16px_oklch(0.3_0.1_55/0.35)] ring-1 ring-[color:var(--rule)]/40 backdrop-blur-sm">
        {showPauseToggle && isPaused ? (
          <button
            type="button"
            onClick={onResume}
            className="flex items-center gap-2 rounded-xl bg-[color:var(--sunflower-deep)] px-5 py-2.5 font-heading text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:brightness-110"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
            Resume
          </button>
        ) : showPauseToggle ? (
          <button
            type="button"
            onClick={onPause}
            className="flex items-center gap-2 rounded-xl bg-[oklch(0.97_0.04_85)] px-4 py-2.5 font-heading text-sm font-semibold text-[color:var(--umber)] ring-1 ring-[color:var(--rule)]/40 transition-all hover:bg-[oklch(0.94_0.06_82)] hover:ring-[color:var(--sunflower-deep)]/40"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
            Pause
          </button>
        ) : null}

        {showPauseToggle && (
          <div className="mx-1 h-6 w-px bg-[color:var(--rule)]/30" />
        )}

        <button
          type="button"
          onClick={() => abortGeneration()}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-heading text-sm italic text-[color:var(--umber)]/60 transition-colors hover:bg-[oklch(0.96_0.06_55/0.3)] hover:text-[color:var(--accent)]"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="2" />
          </svg>
          Stop
        </button>
      </div>
    </div>
  );
}

/* (LiveArtifactPanel, PlanSummary, ValidationSummary moved into PipelineProgress) */

/* ------------------------------------------------------------------ */
/*  Pipeline complete view: video only                                  */
/* ------------------------------------------------------------------ */

function PipelineResult() {
  const videoUrl = useAppStore((s) => s.videoUrl);
  const pipelineStages = useAppStore((s) => s.pipelineStages);
  const streamingTitle = useAppStore((s) => s.streamingTitle);
  const pipelineMode = useAppStore((s) => s.pipelineMode);
  const liveClips = useAppStore((s) => s.liveClips);
  const videoRef = useRef<HTMLVideoElement>(null);

  const title = streamingTitle ?? (pipelineMode === "viz" ? "Your Visualization" : "Your Animation");
  const allDone = pipelineStages.every(
    (s) => s.status === "success" || s.status === "skipped",
  );

  return (
    <div className="relative flex flex-col gap-8 px-6 py-12 md:px-12 md:py-14">
      <header className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sunflower)]/35 px-3 py-1 font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
          <span aria-hidden="true">{pipelineMode === "viz" ? "\u26A1" : "\uD83C\uDFA5"}</span>
          {pipelineMode === "viz" ? "visualization ready" : "pipeline complete"}
        </span>
        <h3 className="font-heading text-4xl font-semibold italic leading-[1.05] tracking-tight text-[color:var(--umber)] md:text-5xl">
          {title}
        </h3>
      </header>

      {/* Video frame */}
      <div className="mx-auto w-full max-w-3xl rounded-[26px] bg-gradient-to-br from-[color:var(--sunflower-deep)] via-[color:var(--accent)] to-[color:var(--sunflower)] p-[3px] shadow-[0_30px_60px_-30px_oklch(0.3_0.1_55/0.4)]">
        <div className="overflow-hidden rounded-[24px] bg-[var(--paper)]">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full"
              style={{ aspectRatio: "16/9" }}
            />
          ) : (
            <div
              className="flex items-center justify-center text-[color:var(--umber)]/50"
              style={{ aspectRatio: "16/9" }}
            >
              <p className="font-heading text-lg italic">Loading video&#x2026;</p>
            </div>
          )}
        </div>
      </div>

      {/* Per-scene clips (for lesson mode with multiple scenes) */}
      {liveClips.length > 1 && (
        <div className="mx-auto w-full max-w-3xl">
          <p className="mb-3 font-heading text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--umber)]/50">
            Individual scenes
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {liveClips.map((clip) => (
              <div
                key={clip.sceneId}
                className="overflow-hidden rounded-xl bg-[var(--paper)] shadow-sm ring-1 ring-[color:var(--rule)]/30"
              >
                <video
                  src={clip.clipUrl}
                  controls
                  preload="metadata"
                  className="w-full"
                  style={{ aspectRatio: "16/9" }}
                />
                <p className="px-2 py-1.5 font-heading text-[10px] font-semibold text-[color:var(--umber)]/60">
                  {clip.sceneId}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline stage summary badges */}
      {allDone && (
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {pipelineStages
            .filter((s) => s.status !== "skipped")
            .map((s) => (
              <span
                key={s.stage}
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sunflower)]/20 px-3 py-1 font-heading text-[10px] uppercase tracking-widest text-[color:var(--umber)]/60"
              >
                <svg viewBox="0 0 16 16" className="size-3 text-[color:var(--sunflower-deep)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5 L6.5 12 L13 4" />
                </svg>
                {s.stage}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legacy plan-based stage (from old monolithic flow)                  */
/* ------------------------------------------------------------------ */

function Stage({ plan }: { plan: AnimationPlan }) {
  const renderStatus = useAppStore((s) => s.renderStatus);
  const setRenderStatus = useAppStore((s) => s.setRenderStatus);
  const videoUrl = useAppStore((s) => s.videoUrl);
  const setVideoUrl = useAppStore((s) => s.setVideoUrl);
  const setRenderError = useAppStore((s) => s.setRenderError);
  const renderError = useAppStore((s) => s.renderError);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [showSource, setShowSource] = useState(false);
  const hasTriggeredRender = useRef(false);

  const startRender = useCallback(async () => {
    if (!plan.manimCode) return;
    setRenderStatus("pending");
    toast.loading("Rendering your animation\u2026", { id: "manim-render" });
    try {
      const res = await fetch("/api/render-animation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manimCode: plan.manimCode, quality: "m" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Render failed.");
      }
      setVideoUrl(data.videoUrl);
      setRenderStatus("complete");
      toast.success("Animation rendered!", { id: "manim-render" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Render failed.";
      setRenderError(msg);
      setRenderStatus("error");
      toast.error(msg, { id: "manim-render" });
    }
  }, [plan.manimCode, setRenderStatus, setVideoUrl, setRenderError]);

  useEffect(() => {
    if (plan.manimCode && !hasTriggeredRender.current && renderStatus === "idle") {
      hasTriggeredRender.current = true;
      startRender();
    }
  }, [plan.manimCode, renderStatus, startRender]);

  const renderStatusLabel: Record<RenderStatus, string> = {
    idle: "",
    pending: "Queuing render\u2026",
    rendering: "Rendering\u2026",
    complete: "",
    error: "Render failed",
  };

  return (
    <div className="relative flex flex-col gap-8 px-6 py-12 md:px-12 md:py-14">
      <header className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sunflower)]/35 px-3 py-1 font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
          <span aria-hidden="true">&#127909;</span>
          {Math.round(plan.estimatedDuration)}s lesson
        </span>
        <h3 className="font-heading text-4xl font-semibold italic leading-[1.05] tracking-tight text-[color:var(--umber)] md:text-5xl">
          {plan.title}
        </h3>
      </header>

      {renderError && (
        <p className="rounded-xl border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.3)] px-4 py-3 font-heading italic text-[color:var(--accent)]">
          {renderError}
        </p>
      )}

      <div className="mx-auto w-full max-w-3xl rounded-[26px] bg-gradient-to-br from-[color:var(--sunflower-deep)] via-[color:var(--accent)] to-[color:var(--sunflower)] p-[3px] shadow-[0_30px_60px_-30px_oklch(0.3_0.1_55/0.4)]">
        <div className="overflow-hidden rounded-[24px] bg-[var(--paper)]">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full"
              style={{ aspectRatio: "16/9" }}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-3 text-[color:var(--umber)]/50"
              style={{ aspectRatio: "16/9" }}
            >
              {renderStatus === "pending" || renderStatus === "rendering" ? (
                <>
                  <div className="sway text-4xl">&#127803;</div>
                  <p className="font-heading text-lg italic">
                    {renderStatusLabel[renderStatus]}
                  </p>
                  <p className="font-heading text-sm italic text-[color:var(--umber)]/40">
                    This usually takes 5&ndash;15 seconds.
                  </p>
                </>
              ) : (
                <p className="font-heading text-lg italic">
                  {renderStatusLabel[renderStatus] || "Preparing to render\u2026"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-4">
        <div className="flex items-center justify-center gap-4">
          {renderStatus === "error" && (
            <Button
              type="button"
              variant="outline"
              onClick={startRender}
              className="font-heading text-base italic"
            >
              &#x21BB; Retry render
            </Button>
          )}
          {videoUrl && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                hasTriggeredRender.current = false;
                setVideoUrl(null);
                setRenderStatus("idle");
                setRenderError(null);
                setTimeout(() => {
                  hasTriggeredRender.current = true;
                  startRender();
                }, 0);
              }}
              className="font-heading text-base italic"
            >
              &#x21BB; Re-render
            </Button>
          )}
        </div>

        {plan.manimCode && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowSource(!showSource)}
              className="font-heading text-xs italic text-[color:var(--umber)]/50 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
            >
              {showSource ? "Hide source" : "View Manim source"}
            </button>
          </div>
        )}

        {showSource && plan.manimCode && (
          <pre className="mx-auto w-full max-w-3xl overflow-x-auto rounded-2xl bg-[oklch(0.14_0.02_55)] p-5 font-mono text-xs leading-relaxed text-[oklch(0.82_0.04_85)]">
            <code>{plan.manimCode}</code>
          </pre>
        )}
      </div>

      <ol className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {plan.steps.map((step, i) => (
          <StepRow key={i} index={i} step={step} />
        ))}
      </ol>
    </div>
  );
}

function StepRow({ index, step }: { index: number; step: AnimationStep }) {
  return (
    <li className="relative grid grid-cols-[auto_1fr] gap-5 rounded-2xl bg-[oklch(0.97_0.04_85/0.6)] p-5 ring-1 ring-[color:var(--rule)]/50 md:p-6">
      <span
        aria-hidden="true"
        className="font-heading text-5xl font-semibold italic leading-none text-[color:var(--sunflower-deep)] md:text-6xl"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-3">
        <p className="font-heading text-base font-semibold tracking-tight text-[color:var(--umber)] md:text-lg">
          <MathText>{step.label}</MathText>
        </p>
        <p className="rounded-lg border-l-[3px] border-[color:var(--accent)]/60 bg-[oklch(0.94_0.06_82/0.7)] px-4 py-2 font-heading italic leading-relaxed text-[color:var(--umber)]/90">
          {step.narration ? (
            <>
              &ldquo;<MathText>{step.narration}</MathText>&rdquo;
            </>
          ) : (
            "Visual-only beat"
          )}
        </p>
      </div>
    </li>
  );
}

function EmptyStage({ isLoading }: { isLoading: boolean }) {
  const streamingSteps = useAppStore((s) => s.streamingSteps);
  const streamingTitle = useAppStore((s) => s.streamingTitle);
  const abortGeneration = useAppStore((s) => s.abortGeneration);

  const planProgress = useTimedProgress(isLoading, 37_000);
  const pipelineProgress = useTimedProgress(useAppStore((s) => s.loading === "pipeline"), 300_000);
  const activeProgress = useAppStore((s) => s.loading === "pipeline") ? pipelineProgress : planProgress;

  if (isLoading && activeProgress > 0) {
    return (
      <div className="relative flex min-h-[360px] flex-col gap-6 px-8 py-12 md:px-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="sway flex size-14 items-center justify-center text-4xl">
            &#127803;
          </div>
          <h4 className="font-heading text-2xl font-semibold italic tracking-tight text-[color:var(--umber)] md:text-3xl">
            {streamingTitle || "Planting the idea\u2026"}
          </h4>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--rule)]/30">
            <div
              className="h-full rounded-full bg-[color:var(--sunflower-deep)] transition-[width] duration-300 ease-out"
              style={{ width: `${activeProgress}%` }}
            />
          </div>
          <p className="mt-2 text-center font-heading text-sm italic text-[color:var(--umber)]/55">
            {Math.round(activeProgress)}%
          </p>
        </div>

        {streamingSteps.length > 0 && (
          <ol className="mx-auto flex w-full max-w-lg flex-col gap-3">
            {streamingSteps.map((step, i) => (
              <li
                key={i}
                className="rise-in grid grid-cols-[auto_1fr] gap-4 rounded-xl bg-[oklch(0.97_0.04_85/0.6)] px-4 py-3 ring-1 ring-[color:var(--rule)]/40"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="font-heading text-2xl font-semibold italic leading-none text-[color:var(--sunflower-deep)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <p className="font-heading text-sm font-semibold tracking-tight text-[color:var(--umber)]">
                    <MathText>{step.label}</MathText>
                  </p>
                  <p className="font-heading text-xs italic leading-relaxed text-[color:var(--umber)]/65">
                    &ldquo;<MathText>{step.narration}</MathText>&rdquo;
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {abortGeneration && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => abortGeneration()}
              className="inline-flex items-center gap-2 font-heading text-sm italic text-[color:var(--umber)]/60 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
            >
              <span aria-hidden="true">&#x25A0;</span>
              Stop &amp; edit prompt
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[360px] flex-col items-center justify-center gap-5 px-8 py-20 text-center">
      <span
        aria-hidden="true"
        className="bounce-soft absolute left-[10%] top-[18%] font-heading text-5xl font-bold text-[color:var(--sunflower-deep)]/50"
        style={{ animationDelay: "0s" }}
      >
        +
      </span>
      <span
        aria-hidden="true"
        className="bounce-soft absolute right-[12%] top-[22%] font-heading text-5xl font-bold text-[color:var(--accent)]/45"
        style={{ animationDelay: "0.4s" }}
      >
        &#x00D7;
      </span>
      <span
        aria-hidden="true"
        className="bounce-soft absolute left-[16%] bottom-[18%] font-heading text-5xl font-bold text-[color:var(--accent)]/45"
        style={{ animationDelay: "0.8s" }}
      >
        &#x00BD;
      </span>
      <span
        aria-hidden="true"
        className="bounce-soft absolute right-[14%] bottom-[20%] font-heading text-5xl font-bold text-[color:var(--sunflower-deep)]/50"
        style={{ animationDelay: "1.2s" }}
      >
        =
      </span>

      <div className="relative mb-2">
        <div
          aria-hidden="true"
          className="slow-spin absolute inset-0 flex items-center justify-center"
        >
          <div className="relative size-40">
            <span className="absolute left-1/2 top-0 -translate-x-1/2 font-heading text-xl font-bold text-[color:var(--sunflower-deep)]/70">
              &#x2211;
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 font-heading text-xl font-bold text-[color:var(--accent)]/70">
              &#x03C0;
            </span>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 font-heading text-xl font-bold text-[color:var(--sunflower-deep)]/70">
              &#x221A;
            </span>
            <span className="absolute left-0 top-1/2 -translate-y-1/2 font-heading text-xl font-bold text-[color:var(--accent)]/70">
              &#x221E;
            </span>
          </div>
        </div>
        <div className="sway relative flex size-24 items-center justify-center text-6xl">
          &#127803;
        </div>
      </div>

      <p className="font-heading text-3xl font-semibold italic tracking-tight text-[color:var(--umber)] md:text-4xl">
        {isLoading
          ? "Planting the idea\u2026"
          : "Your animation will bloom here."}
      </p>
      <p className="max-w-md text-base leading-relaxed text-[color:var(--umber)]/65 md:text-lg">
        {isLoading
          ? "Our sunflower is arranging the steps, the visuals, and the narration just for you."
          : "Upload a worksheet problem or describe a concept above, and we\u2019ll plant the idea right on this page."}
      </p>
    </div>
  );
}
