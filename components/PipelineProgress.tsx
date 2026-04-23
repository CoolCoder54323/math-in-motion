"use client";

import { useState } from "react";
import { useAppStore, type PipelineStageState } from "@/lib/store";
import type { PipelineStage } from "@/lib/pipeline/types";
import { MathText } from "@/components/MathText";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const STAGE_LABELS: Record<PipelineStage, string> = {
  plan: "Lesson Plan",
  codegen: "Code Generation",
  validate: "Validation",
  render: "Rendering",
  postprocess: "Post-Processing",
  compose: "Final Assembly",
};

const STAGE_ICONS: Record<PipelineStage, string> = {
  plan: "\u270E",
  codegen: "\u2699",
  validate: "\u2714",
  render: "\u25B6",
  postprocess: "\u2702",
  compose: "\u2728",
};

const STAGE_DESCRIPTIONS: Record<PipelineStage, string> = {
  plan: "Designing the lesson structure and narration flow",
  codegen: "Writing Manim animation code for each scene",
  validate: "Checking code for syntax and rendering issues",
  render: "Running Manim to produce video clips",
  postprocess: "Adding title cards, transitions, and polish",
  compose: "Assembling the final video from all scenes",
};

/* ------------------------------------------------------------------ */
/*  Step Card — the animated card for each pipeline stage               */
/* ------------------------------------------------------------------ */

function StepCard({
  state,
  index,
  isPaused,
  isLast,
}: {
  state: PipelineStageState;
  index: number;
  isPaused: boolean;
  isLast: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const triggerRedo = useAppStore((s) => s.triggerRedoFromStage);

  const isDone = state.status === "success" || state.status === "skipped";
  const isRunning = state.status === "running";
  const isError = state.status === "error";

  // Auto-expand the running step
  const shouldShowContent = isRunning || isExpanded;

  return (
    <div className="flex flex-col">
      {/* Card */}
      <div
        className={`
          step-card-enter group relative rounded-2xl transition-all duration-300
          ${isDone
            ? "success-shimmer bg-[oklch(0.97_0.04_85/0.7)] ring-1 ring-[color:var(--sunflower-deep)]/30 hover:ring-[color:var(--sunflower-deep)]/60 hover:shadow-[0_8px_30px_-12px_oklch(0.7_0.18_75/0.25)]"
            : isRunning
              ? "bg-[oklch(0.98_0.03_85/0.9)] ring-2 ring-[color:var(--sunflower-deep)]/50 shadow-[0_12px_40px_-16px_oklch(0.7_0.18_75/0.3)]"
              : isError
                ? "bg-[oklch(0.97_0.05_45/0.5)] ring-1 ring-[color:var(--accent)]/40"
                : "bg-[oklch(0.96_0.02_85/0.4)] ring-1 ring-[color:var(--rule)]/20"
          }
        `}
        style={{ animationDelay: `${index * 120}ms` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header row */}
        <button
          type="button"
          onClick={() => isDone && setIsExpanded(!isExpanded)}
          disabled={!isDone}
          className={`flex w-full items-center gap-4 px-5 py-4 text-left ${isDone ? "cursor-pointer" : ""}`}
        >
          {/* Step number + icon */}
          <div
            className={`
              flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-500
              ${isDone
                ? "bg-[color:var(--sunflower-deep)] text-white shadow-[0_4px_14px_-4px_oklch(0.7_0.18_75/0.5)]"
                : isRunning && isPaused
                  ? "ring-2 ring-[color:var(--accent)] bg-[oklch(0.96_0.08_45/0.4)] text-[color:var(--accent)]"
                  : isRunning
                    ? "progress-ring-pulse bg-[color:var(--sunflower)]/50 text-[color:var(--umber)] ring-2 ring-[color:var(--sunflower-deep)]"
                    : isError
                      ? "bg-[color:var(--accent)] text-white"
                      : "bg-[color:var(--rule)]/15 text-[color:var(--umber)]/30"
              }
            `}
          >
            {isDone ? (
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5 L6.5 12 L13 4" />
              </svg>
            ) : isRunning && isPaused ? (
              <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : isError ? (
              <span className="text-xs font-bold">!</span>
            ) : isRunning ? (
              <span className="inline-block animate-spin text-sm">{STAGE_ICONS[state.stage]}</span>
            ) : (
              <span className="text-sm opacity-50">{STAGE_ICONS[state.stage]}</span>
            )}
          </div>

          {/* Label + subtitle */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`
                  font-heading text-sm font-semibold tracking-tight
                  ${isDone
                    ? "text-[color:var(--umber)]"
                    : isRunning
                      ? "text-[color:var(--umber)]"
                      : isError
                        ? "text-[color:var(--accent)]"
                        : "text-[color:var(--umber)]/35"
                  }
                `}
              >
                {STAGE_LABELS[state.stage]}
              </span>
              {state.status === "skipped" && (
                <span className="rounded-full bg-[color:var(--rule)]/15 px-2 py-0.5 font-heading text-[10px] italic text-[color:var(--umber)]/40">
                  skipped
                </span>
              )}
              {isRunning && isPaused && (
                <span className="rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 font-heading text-[10px] font-semibold text-[color:var(--accent)]">
                  paused
                </span>
              )}
            </div>
            <p
              className={`mt-0.5 font-heading text-xs italic ${
                isDone || isRunning ? "text-[color:var(--umber)]/55" : "text-[color:var(--umber)]/25"
              }`}
            >
              {state.message || STAGE_DESCRIPTIONS[state.stage]}
            </p>
          </div>

          {/* Right side: step number or expand indicator */}
          <div className="flex items-center gap-2">
            {isDone && (
              <span className="font-heading text-xs tabular-nums text-[color:var(--umber)]/35">
                {isExpanded ? "\u25B2" : "\u25BC"}
              </span>
            )}
            <span
              className={`font-heading text-3xl font-semibold italic leading-none ${
                isDone
                  ? "text-[color:var(--sunflower-deep)]/30"
                  : isRunning
                    ? "text-[color:var(--sunflower-deep)]/50"
                    : "text-[color:var(--rule)]/15"
              }`}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
        </button>

        {/* Progress bar for running stage */}
        {isRunning && !isPaused && (
          <div className="px-5 pb-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--rule)]/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[color:var(--sunflower-deep)] to-[color:var(--sunflower)] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(state.progress * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-right font-heading text-[10px] tabular-nums italic text-[color:var(--umber)]/40">
              {Math.round(state.progress * 100)}%
            </p>
          </div>
        )}

        {/* Error message */}
        {isError && state.message && (
          <div className="mx-5 mb-4 rounded-lg border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.2)] px-3 py-2">
            <p className="font-heading text-xs italic text-[color:var(--accent)]">
              {state.message}
            </p>
          </div>
        )}

        {/* Expanded content: inline artifact for this stage */}
        {shouldShowContent && (
          <div className="expand-content">
            <StageArtifactContent stage={state.stage} isRunning={isRunning} />
          </div>
        )}

        {/* Redo button — appears on hover for completed stages */}
        {isDone && isHovered && state.status !== "skipped" && (
          <div className="redo-reveal absolute -right-2 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerRedo(state.stage);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[color:var(--paper)] px-3 py-1.5 font-heading text-[11px] font-semibold italic text-[color:var(--accent)] shadow-lg ring-1 ring-[color:var(--accent)]/30 transition-colors hover:bg-[color:var(--accent)] hover:text-white"
              title={`Redo from ${STAGE_LABELS[state.stage]}`}
            >
              <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v5h5" />
                <path d="M3.51 10.5A6.5 6.5 0 1 0 3 6.5" />
              </svg>
              Redo
            </button>
          </div>
        )}
      </div>

      {/* Connector line to next step */}
      {!isLast && (
        <div className="flex justify-center py-1">
          <div
            className={`
              connector-draw h-6 w-px
              ${isDone
                ? "bg-gradient-to-b from-[color:var(--sunflower-deep)]/50 to-[color:var(--sunflower-deep)]/20"
                : "bg-[color:var(--rule)]/20"
              }
            `}
            style={{ animationDelay: `${(index + 1) * 120 + 100}ms` }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stage Artifact Content — inline artifact per stage                  */
/* ------------------------------------------------------------------ */

function StageArtifactContent({ stage, isRunning }: { stage: PipelineStage; isRunning: boolean }) {
  const livePlan = useAppStore((s) => s.livePlan);
  const liveClips = useAppStore((s) => s.liveClips);
  const liveScenes = useAppStore((s) => s.liveScenes);
  const validationReport = useAppStore((s) => s.validationReport);

  switch (stage) {
    case "plan": {
      if (!livePlan) return null;
      return (
        <div className="mx-5 mb-4 flex flex-col gap-2 rounded-xl bg-[color:var(--paper)]/60 p-4">
          <p className="font-heading text-lg font-semibold italic tracking-tight text-[color:var(--umber)]">
            {livePlan.title}
          </p>
          <p className="font-heading text-xs text-[color:var(--umber)]/55">
            {livePlan.sceneBreakdown.length} scenes &middot; ~{Math.round(livePlan.estimatedDuration)}s
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            {livePlan.sceneBreakdown.map((scene, i) => (
              <div
                key={scene.sceneId}
                className="step-card-enter flex items-start gap-2.5 rounded-lg bg-[oklch(0.97_0.04_85/0.6)] px-3 py-2"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="mt-0.5 font-heading text-sm font-semibold italic leading-none text-[color:var(--sunflower-deep)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-xs font-semibold text-[color:var(--umber)]">
                    {scene.sceneId}
                    {scene.role && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-[color:var(--grape)]/20 px-1.5 py-0.5 font-heading text-[9px] uppercase tracking-[0.15em] text-[color:var(--grape)] ring-1 ring-[color:var(--grape)]/30">
                        {scene.role.replace("_", " ")}
                      </span>
                    )}
                    {scene.hasPredictPause && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-[color:var(--sunflower)]/35 px-1.5 py-0.5 font-heading text-[9px] uppercase tracking-[0.15em] text-[color:var(--sunflower-deep)] ring-1 ring-[color:var(--sunflower-deep)]/30">
                        pause
                      </span>
                    )}
                  </p>
                  <p className="font-heading text-[11px] italic text-[color:var(--umber)]/60">
                    <MathText>{scene.description}</MathText>
                  </p>
                </div>
                <span className="shrink-0 font-heading text-[10px] tabular-nums text-[color:var(--umber)]/35">
                  ~{scene.estimatedSeconds}s
                </span>
              </div>
            ))}
          </div>
          {livePlan.steps.length > 0 && (
            <div className="mt-2 border-t border-[color:var(--rule)]/20 pt-2">
              <p className="mb-1.5 font-heading text-[10px] uppercase tracking-[0.2em] text-[color:var(--umber)]/35">
                Narration
              </p>
              <ol className="flex flex-col gap-1">
                {livePlan.steps.map((step, i) => (
                  <li key={i} className="font-heading text-[11px] leading-relaxed text-[color:var(--umber)]/60">
                    <span className="font-semibold text-[color:var(--umber)]/80">
                      <MathText>{step.label}</MathText>
                    </span>
                    {" \u2014 "}
                    <span className="italic">
                      &ldquo;<MathText>{step.narration}</MathText>&rdquo;
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      );
    }

    case "codegen": {
      if (liveScenes.length === 0 && !isRunning) return null;
      return (
        <div className="mx-5 mb-4 rounded-xl bg-[color:var(--paper)]/60 p-4">
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--umber)]/50">
            Generated Scenes
          </p>
          {liveScenes.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {liveScenes.map((scene, i) => (
                <div
                  key={scene.sceneId}
                  className="step-card-enter flex items-center gap-2 rounded-lg bg-[oklch(0.14_0.02_55/0.05)] px-3 py-2"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="font-mono text-[10px] font-semibold text-[color:var(--sunflower-deep)]">
                    {scene.className}
                  </span>
                  <span className="flex-1 truncate font-mono text-[10px] text-[color:var(--umber)]/40">
                    {scene.sceneId}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 font-heading text-xs italic text-[color:var(--umber)]/40">
              Writing animation code...
            </p>
          )}
        </div>
      );
    }

    case "validate": {
      if (!validationReport) return null;
      const allPassed = validationReport.passed === validationReport.scenes;
      return (
        <div className="mx-5 mb-4 rounded-xl bg-[color:var(--paper)]/60 p-4">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                allPassed ? "bg-[color:var(--sunflower-deep)]" : "bg-[color:var(--accent)]"
              }`}
            >
              {allPassed ? "\u2714" : "!"}
            </span>
            <p className="font-heading text-xs font-semibold text-[color:var(--umber)]">
              {validationReport.passed}/{validationReport.scenes} scenes passed
            </p>
          </div>
          {validationReport.issues.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {validationReport.issues.slice(0, 3).map((issue, i) => (
                <li
                  key={i}
                  className={`font-heading text-[11px] ${
                    issue.severity === "error" ? "text-[color:var(--accent)]" : "text-[color:var(--umber)]/50"
                  }`}
                >
                  <span className="font-semibold">[{issue.sceneId}]</span> {issue.message}
                </li>
              ))}
              {validationReport.issues.length > 3 && (
                <li className="font-heading text-[10px] italic text-[color:var(--umber)]/35">
                  +{validationReport.issues.length - 3} more
                </li>
              )}
            </ul>
          )}
        </div>
      );
    }

    case "render": {
      if (liveClips.length === 0 && !isRunning) return null;
      return (
        <div className="mx-5 mb-4">
          {liveClips.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {liveClips.map((clip) => (
                <div
                  key={clip.sceneId}
                  className="step-card-enter overflow-hidden rounded-xl bg-[var(--paper)] shadow-sm ring-1 ring-[color:var(--rule)]/30"
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
          ) : (
            <div className="rounded-xl bg-[color:var(--paper)]/60 p-4">
              <p className="font-heading text-xs italic text-[color:var(--umber)]/40">
                Rendering animation clips...
              </p>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  PipelineProgress — the main exported timeline                      */
/* ------------------------------------------------------------------ */

export function PipelineProgress() {
  const stages = useAppStore((s) => s.pipelineStages);
  const pipelineError = useAppStore((s) => s.pipelineError);
  const loading = useAppStore((s) => s.loading);
  const isPaused = useAppStore((s) => s.isPaused);

  // Only show when pipeline is active
  if (loading !== "pipeline" && !stages.some((s) => s.status !== "pending")) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex flex-col" role="list" aria-label="Pipeline progress">
        {stages.map((state, i) => (
          <StepCard
            key={state.stage}
            state={state}
            index={i}
            isPaused={isPaused && state.status === "running"}
            isLast={i === stages.length - 1}
          />
        ))}
      </div>

      {pipelineError && (
        <div className="step-card-enter mt-4 rounded-2xl border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.3)] px-5 py-4">
          <p className="font-heading text-sm italic text-[color:var(--accent)]">
            {pipelineError}
          </p>
        </div>
      )}
    </div>
  );
}
