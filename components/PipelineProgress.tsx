"use client";

import { useAppStore, type PipelineStageState } from "@/lib/store";
import type { PipelineStage } from "@/lib/pipeline/types";

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

function StageIndicator({ state }: { state: PipelineStageState }) {
  const isCurrent = state.status === "running";
  const isDone = state.status === "success" || state.status === "skipped";
  const isError = state.status === "error";
  const isPending = state.status === "pending";

  return (
    <li className="group flex gap-4">
      {/* Vertical connector + circle */}
      <div className="flex flex-col items-center">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all duration-500 ${
            isDone
              ? "bg-[color:var(--sunflower-deep)] text-white shadow-[0_0_12px_oklch(0.78_0.17_80/0.4)]"
              : isError
                ? "bg-[color:var(--accent)] text-white shadow-[0_0_12px_oklch(0.6_0.2_28/0.3)]"
                : isCurrent
                  ? "ring-2 ring-[color:var(--sunflower-deep)] bg-[color:var(--sunflower)]/40 text-[color:var(--umber)]"
                  : "bg-[color:var(--rule)]/20 text-[color:var(--umber)]/35"
          }`}
        >
          {isDone ? (
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5 L6.5 12 L13 4" />
            </svg>
          ) : isError ? (
            <span className="text-xs">!</span>
          ) : isCurrent ? (
            <span className="inline-block animate-spin text-xs">{STAGE_ICONS[state.stage]}</span>
          ) : (
            <span className="text-xs">{STAGE_ICONS[state.stage]}</span>
          )}
        </div>
        {/* Connector line */}
        <div
          className={`w-px flex-1 transition-colors duration-500 ${
            isDone
              ? "bg-[color:var(--sunflower-deep)]/50"
              : "bg-[color:var(--rule)]/25"
          }`}
        />
      </div>

      {/* Label + progress */}
      <div className="flex-1 pb-5">
        <p
          className={`font-heading text-sm font-semibold tracking-tight transition-colors duration-300 ${
            isDone
              ? "text-[color:var(--umber)]/70"
              : isError
                ? "text-[color:var(--accent)]"
                : isCurrent
                  ? "text-[color:var(--umber)]"
                  : "text-[color:var(--umber)]/40"
          }`}
        >
          {STAGE_LABELS[state.stage]}
          {state.status === "skipped" && (
            <span className="ml-2 text-xs font-normal italic text-[color:var(--umber)]/45">
              skipped
            </span>
          )}
        </p>

        {/* Progress bar for running stage */}
        {isCurrent && state.progress > 0 && (
          <div className="mt-2 w-full max-w-xs">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--rule)]/20">
              <div
                className="h-full rounded-full bg-[color:var(--sunflower-deep)] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(state.progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Status message */}
        {(isCurrent || isError) && state.message && (
          <p
            className={`mt-1.5 font-heading text-xs italic ${
              isError
                ? "text-[color:var(--accent)]/80"
                : "text-[color:var(--umber)]/55"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </li>
  );
}

export function PipelineProgress() {
  const stages = useAppStore((s) => s.pipelineStages);
  const pipelineError = useAppStore((s) => s.pipelineError);
  const loading = useAppStore((s) => s.loading);

  // Only show when pipeline is active
  if (loading !== "pipeline" && !stages.some((s) => s.status !== "pending")) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <ol className="flex flex-col" role="list" aria-label="Pipeline progress">
        {stages.map((state) => (
          <StageIndicator key={state.stage} state={state} />
        ))}
      </ol>

      {pipelineError && (
        <div className="mt-2 rounded-xl border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.3)] px-4 py-3">
          <p className="font-heading text-sm italic text-[color:var(--accent)]">
            {pipelineError}
          </p>
        </div>
      )}
    </div>
  );
}
