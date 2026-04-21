"use client";

import { useMemo, useState, type ChangeEvent } from "react";

import { MathText } from "@/components/MathText";
import { useAppStore, type SceneState, type SceneStatus } from "@/lib/store";
import type {
  AnimationStep,
  PlanOutput,
  SceneEntry,
} from "@/lib/pipeline/types";

/* ------------------------------------------------------------------ */
/*  LessonWorkshop — scene-centric live surface for lesson pipelines    */
/*                                                                      */
/*  Two phases share one layout:                                        */
/*                                                                      */
/*    1. Plan approval — every scene card is editable, a single CTA     */
/*       commits the plan and kicks off per-scene codegen + render.     */
/*                                                                      */
/*    2. Build — cards roll through pending → generating → ready /      */
/*       failed as SSE events arrive. Cards stay editable; Redo on a    */
/*       card snapshots the current plan and re-renders just that       */
/*       scene.                                                         */
/*                                                                      */
/*  The old engineering stepper survives behind ?debug=1 (handled by    */
/*  the parent). This component is the default lesson surface.          */
/* ------------------------------------------------------------------ */

export function LessonWorkshop() {
  const livePlan = useAppStore((s) => s.livePlan);
  const planApprovalPending = useAppStore((s) => s.planApprovalPending);
  const sceneStates = useAppStore((s) => s.sceneStates);
  const approvePlan = useAppStore((s) => s.approvePlan);
  const approvalLoading = useAppStore((s) => s.approvalLoading);
  const approvalError = useAppStore((s) => s.approvalError);
  const updatePlanDraft = useAppStore((s) => s.updatePlanDraft);
  const updateSceneDraft = useAppStore((s) => s.updateSceneDraft);
  const updateStepDraft = useAppStore((s) => s.updateStepDraft);
  const regenerateScene = useAppStore((s) => s.regenerateScene);

  if (!livePlan) return null;

  return (
    <div className="relative flex flex-col gap-10 px-4 py-10 md:px-8">
      <WorkshopHeader
        plan={livePlan}
        sceneStates={sceneStates}
        planApprovalPending={planApprovalPending}
        approvalLoading={approvalLoading}
        approvalError={approvalError}
        onApprove={approvePlan}
        onEditTitle={(title) => updatePlanDraft({ ...livePlan, title })}
      />

      <ol className="flex flex-col gap-5">
        {livePlan.sceneBreakdown.map((scene, i) => {
          const step = livePlan.steps[i];
          const state: SceneState = sceneStates[scene.sceneId] ?? {
            status: "pending",
          };
          return (
            <SceneCard
              key={scene.sceneId}
              index={i}
              scene={scene}
              step={step}
              state={state}
              editable={planApprovalPending}
              onEditScene={(patch) => updateSceneDraft(scene.sceneId, patch)}
              onEditStep={(patch) => {
                if (step) updateStepDraft(i, patch);
              }}
              onRegenerate={() => regenerateScene(scene.sceneId)}
            />
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header — editable title + phase-aware subtitle & CTA                */
/* ------------------------------------------------------------------ */

function WorkshopHeader({
  plan,
  sceneStates,
  planApprovalPending,
  approvalLoading,
  approvalError,
  onApprove,
  onEditTitle,
}: {
  plan: PlanOutput;
  sceneStates: Record<string, SceneState>;
  planApprovalPending: boolean;
  approvalLoading: boolean;
  approvalError: string | null;
  onApprove: () => Promise<void>;
  onEditTitle: (title: string) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);

  const { ready, failed, active, total } = useMemo(() => {
    let ready = 0;
    let failed = 0;
    let active = 0;
    for (const s of plan.sceneBreakdown) {
      const status = sceneStates[s.sceneId]?.status;
      if (status === "ready") ready++;
      else if (status === "failed") failed++;
      else if (status === "generating" || status === "regenerating") active++;
    }
    return { ready, failed, active, total: plan.sceneBreakdown.length };
  }, [plan.sceneBreakdown, sceneStates]);

  const activeScene = plan.sceneBreakdown.find((s) => {
    const st = sceneStates[s.sceneId]?.status;
    return st === "generating" || st === "regenerating";
  });

  const durationSec = Math.round(plan.estimatedDuration);

  return (
    <header className="step-card-enter flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sunflower)]/35 px-3 py-1 font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
          <span aria-hidden="true">
            {planApprovalPending ? "\u270E" : "\uD83C\uDFAC"}
          </span>
          {planApprovalPending ? "draft lesson plan" : "the workshop"}
        </span>
        <span className="font-heading text-[11px] italic text-[color:var(--umber)]/55">
          &#x2736; {durationSec}s &#x2736; {total} {total === 1 ? "scene" : "scenes"}
        </span>
      </div>

      {editingTitle ? (
        <input
          autoFocus
          value={plan.title}
          onChange={(e) => onEditTitle(e.target.value)}
          onBlur={() => setEditingTitle(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              setEditingTitle(false);
            }
          }}
          className="w-full border-b-2 border-[color:var(--sunflower-deep)] bg-transparent pb-1 font-heading text-4xl font-semibold italic leading-[1.05] tracking-tight text-[color:var(--umber)] outline-none md:text-5xl"
          aria-label="Lesson title"
        />
      ) : (
        <button
          type="button"
          onClick={() => planApprovalPending && setEditingTitle(true)}
          className={`text-left font-heading text-4xl font-semibold italic leading-[1.05] tracking-tight text-[color:var(--umber)] md:text-5xl ${
            planApprovalPending
              ? "cursor-text underline-offset-[6px] decoration-[color:var(--sunflower-deep)]/40 decoration-2 hover:underline"
              : "cursor-default"
          }`}
          aria-label={planApprovalPending ? "Edit title" : undefined}
        >
          {plan.title}
        </button>
      )}

      {planApprovalPending ? (
        <p className="font-heading text-base italic leading-relaxed text-[color:var(--umber)]/70 md:text-lg">
          Review each scene below &mdash; tweak what you like, then start
          building. You can redo any single scene while we work.
        </p>
      ) : (
        <ProgressLine
          ready={ready}
          failed={failed}
          active={active}
          total={total}
          activeSceneLabel={
            activeScene
              ? `scene ${plan.sceneBreakdown.indexOf(activeScene) + 1}`
              : null
          }
        />
      )}

      {planApprovalPending && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void onApprove()}
            disabled={approvalLoading}
            className="text-link mt-1 self-start text-2xl disabled:opacity-50 disabled:cursor-wait md:text-3xl"
          >
            {approvalLoading
              ? "Starting\u2026"
              : "Approve \u0026 start building"}
            {!approvalLoading && (
              <span aria-hidden="true" className="text-link-arrow">
                {" \u2192"}
              </span>
            )}
          </button>
          {approvalError && (
            <p className="font-heading text-sm text-red-600">
              {approvalError}
            </p>
          )}
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress line (build phase)                                         */
/* ------------------------------------------------------------------ */

function ProgressLine({
  ready,
  failed,
  active,
  total,
  activeSceneLabel,
}: {
  ready: number;
  failed: number;
  active: number;
  total: number;
  activeSceneLabel: string | null;
}) {
  const pct = total === 0 ? 0 : Math.round((ready / total) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-sm italic text-[color:var(--umber)]/70 md:text-base">
          {ready === total ? (
            <>Every scene is ready &mdash; stitching them together now.</>
          ) : active > 0 && activeSceneLabel ? (
            <>
              Drafting <span className="not-italic">{activeSceneLabel}</span>
              <span className="ml-1 inline-block animate-pulse">
                &hellip;
              </span>
            </>
          ) : failed > 0 ? (
            <>Some scenes need another pass.</>
          ) : (
            <>Warming up the ink.</>
          )}
        </p>
        <span className="font-heading text-xs tabular-nums italic text-[color:var(--umber)]/55">
          {ready}/{total} ready
          {failed > 0 && (
            <span className="ml-2 not-italic text-[color:var(--accent)]">
              &#9679; {failed} failed
            </span>
          )}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--rule)]/30">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[color:var(--sunflower-deep)] to-[color:var(--sunflower)] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene card                                                          */
/* ------------------------------------------------------------------ */

function SceneCard({
  index,
  scene,
  step,
  state,
  editable,
  onEditScene,
  onEditStep,
  onRegenerate,
}: {
  index: number;
  scene: SceneEntry;
  step: AnimationStep | undefined;
  state: SceneState;
  editable: boolean;
  onEditScene: (patch: Partial<SceneEntry>) => void;
  onEditStep: (patch: Partial<AnimationStep>) => void;
  onRegenerate: () => void;
}) {
  const isWorking =
    state.status === "generating" || state.status === "regenerating";
  const isReady = state.status === "ready";
  const isFailed = state.status === "failed";

  const ringColor = isFailed
    ? "ring-[color:var(--accent)]/50"
    : isReady
    ? "ring-[oklch(0.62_0.194_149)]/45"
    : isWorking
    ? "ring-[color:var(--sunflower-deep)]/70"
    : "ring-[color:var(--rule)]/50";

  const bgColor = isFailed
    ? "bg-[oklch(0.96_0.06_55/0.2)]"
    : isReady
    ? "bg-[oklch(0.97_0.05_85/0.75)]"
    : "bg-[oklch(0.97_0.04_85/0.6)]";

  return (
    <li
      className={`step-card-enter relative grid grid-cols-[auto_1fr] gap-5 rounded-2xl p-5 ring-1 transition-all md:gap-6 md:p-6 ${bgColor} ${ringColor}`}
      style={{ animationDelay: `${Math.min(index * 90, 540)}ms` }}
    >
      {/* ── Numeral + status ────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="font-heading text-5xl font-semibold italic leading-none text-[color:var(--sunflower-deep)] md:text-6xl"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <StatusPill state={state} />
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* Scene description */}
        <EditableField
          label="scene"
          value={scene.description}
          editable={editable}
          multiline
          onChange={(description) => onEditScene({ description })}
          placeholder="What happens on screen?"
          readonlyClass="font-heading text-base font-semibold tracking-tight text-[color:var(--umber)] md:text-lg"
        />

        {/* Math content */}
        {(scene.mathContent || editable) && (
          <EditableField
            label="math"
            value={scene.mathContent}
            editable={editable}
            multiline
            onChange={(mathContent) => onEditScene({ mathContent })}
            placeholder="Key equation or expression (optional)"
            readonlyClass="font-mono text-sm text-[color:var(--umber)]/80"
            useMathText
          />
        )}

        {/* Narration (from the matching AnimationStep) */}
        {step && (
          <div className="rounded-lg border-l-[3px] border-[color:var(--accent)]/60 bg-[oklch(0.94_0.06_82/0.7)] px-4 py-2">
            <span
              aria-hidden="true"
              className="mr-1 font-heading text-xs uppercase tracking-[0.25em] text-[color:var(--umber)]/50"
            >
              narration
            </span>
            <EditableField
              label={null}
              value={step.narration}
              editable={editable}
              multiline
              onChange={(narration) => onEditStep({ narration })}
              placeholder="What the narrator will say here"
              readonlyClass="font-heading italic leading-relaxed text-[color:var(--umber)]/90"
              useMathText
              quotes
            />
          </div>
        )}

        {/* Ready: video preview */}
        {isReady && state.clipUrl && (
          <ScenePreview
            clipUrl={state.clipUrl}
            durationSeconds={state.durationSeconds}
          />
        )}

        {/* Working state */}
        {isWorking && <WorkingPanel mode={state.status as "generating" | "regenerating"} />}

        {/* Failed state */}
        {isFailed && (
          <div className="flex flex-col gap-2 rounded-lg border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.3)] px-4 py-3">
            <p className="font-heading text-sm italic text-[color:var(--accent)]">
              <span aria-hidden="true" className="mr-1">&#9888;</span>
              This scene didn&rsquo;t finish. {state.error ?? ""}
            </p>
          </div>
        )}

        {/* Actions */}
        {(isReady || isFailed) && (
          <div className="flex items-center justify-end gap-3 pt-1">
            {editable && (
              <span className="font-heading text-[11px] italic text-[color:var(--umber)]/50">
                edit above &mdash; redo applies your changes
              </span>
            )}
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1.5 font-heading text-sm italic text-[color:var(--umber)]/60 underline-offset-4 transition-colors hover:text-[color:var(--accent)] hover:underline"
            >
              <span aria-hidden="true">&#x21BB;</span>
              {isFailed ? "Try again" : "Redo this scene"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Status pill                                                         */
/* ------------------------------------------------------------------ */

function StatusPill({ state }: { state: SceneState }) {
  const meta = STATUS_META[state.status];
  const detail =
    state.status === "ready" && state.durationSeconds
      ? `${state.durationSeconds.toFixed(1)}s`
      : meta.label;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-heading text-[10px] font-semibold uppercase tracking-[0.18em] ${meta.classes}`}
    >
      <span
        aria-hidden="true"
        className={`block size-1.5 rounded-full ${meta.dotClass}`}
      />
      {detail}
    </div>
  );
}

const STATUS_META: Record<
  SceneStatus,
  { label: string; classes: string; dotClass: string }
> = {
  pending: {
    label: "waiting",
    classes:
      "bg-[color:var(--paper-warm)] text-[color:var(--umber)]/55 ring-1 ring-[color:var(--rule)]/40",
    dotClass: "bg-[color:var(--umber)]/30",
  },
  generating: {
    label: "drafting",
    classes:
      "bg-[color:var(--sunflower)]/35 text-[color:var(--umber)] ring-1 ring-[color:var(--sunflower-deep)]/50",
    dotClass: "bg-[color:var(--sunflower-deep)] soft-pulse",
  },
  regenerating: {
    label: "redoing",
    classes:
      "bg-[oklch(0.92_0.12_55/0.4)] text-[color:var(--accent)] ring-1 ring-[color:var(--accent)]/40",
    dotClass: "bg-[color:var(--accent)] soft-pulse",
  },
  ready: {
    label: "ready",
    classes:
      "bg-[oklch(0.62_0.194_149)]/25 text-[color:var(--umber)] ring-1 ring-[oklch(0.62_0.194_149)]/50",
    dotClass: "bg-[oklch(0.62_0.194_149)]",
  },
  failed: {
    label: "failed",
    classes:
      "bg-[oklch(0.96_0.06_55/0.35)] text-[color:var(--accent)] ring-1 ring-[color:var(--accent)]/50",
    dotClass: "bg-[color:var(--accent)]",
  },
};

/* ------------------------------------------------------------------ */
/*  Working panel — shown during generating/regenerating                */
/* ------------------------------------------------------------------ */

function WorkingPanel({ mode }: { mode: "generating" | "regenerating" }) {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-[color:var(--sunflower-deep)]/50 bg-[oklch(0.94_0.06_82/0.35)] px-5 py-6">
      <div className="flex items-center gap-4">
        <div className="sway text-3xl" aria-hidden="true">
          {mode === "regenerating" ? "\u21BB" : "\u270E"}
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-sm font-semibold italic text-[color:var(--umber)]">
            {mode === "regenerating"
              ? "Redrawing this scene\u2026"
              : "Drawing this scene\u2026"}
          </p>
          <p className="font-heading text-xs italic text-[color:var(--umber)]/55">
            Writing Manim code, validating, and rendering to video. Usually
            ~10&#8288;&ndash;&#8288;20 seconds.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene video preview                                                 */
/* ------------------------------------------------------------------ */

function ScenePreview({
  clipUrl,
  durationSeconds,
}: {
  clipUrl: string;
  durationSeconds?: number;
}) {
  return (
    <div className="rise-in">
      <div className="rounded-[18px] bg-gradient-to-br from-[color:var(--sunflower-deep)] via-[color:var(--accent)] to-[color:var(--sunflower)] p-[2px] shadow-[0_18px_40px_-22px_oklch(0.3_0.1_55/0.45)]">
        <div className="overflow-hidden rounded-[16px] bg-[color:var(--paper)]">
          <video
            src={clipUrl}
            controls
            preload="metadata"
            className="block w-full"
            style={{ aspectRatio: "16/9" }}
          />
        </div>
      </div>
      {typeof durationSeconds === "number" && durationSeconds > 0 && (
        <p className="mt-1.5 text-right font-heading text-[11px] italic tabular-nums text-[color:var(--umber)]/55">
          {durationSeconds.toFixed(1)}s &#x2736; scene clip
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editable field — click-to-edit textarea with read-only fallback     */
/* ------------------------------------------------------------------ */

function EditableField({
  label,
  value,
  editable,
  multiline,
  onChange,
  placeholder,
  readonlyClass,
  useMathText,
  quotes,
}: {
  label: string | null;
  value: string;
  editable: boolean;
  multiline: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  readonlyClass: string;
  useMathText?: boolean;
  quotes?: boolean;
}) {
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  if (editable) {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <span className="font-heading text-[10px] uppercase tracking-[0.25em] text-[color:var(--umber)]/45">
            {label}
          </span>
        )}
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={multiline ? 2 : 1}
          className={`${readonlyClass} field-sizing-content block w-full resize-none rounded-md border-0 bg-[color:var(--paper)]/70 px-2 py-1.5 outline-none ring-1 ring-[color:var(--rule)]/40 transition-colors placeholder:italic placeholder:text-[color:var(--umber)]/40 focus-visible:ring-2 focus-visible:ring-[color:var(--sunflower-deep)]/60`}
        />
      </div>
    );
  }

  if (!value) return null;

  const rendered = useMathText ? <MathText>{value}</MathText> : value;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="font-heading text-[10px] uppercase tracking-[0.25em] text-[color:var(--umber)]/45">
          {label}
        </span>
      )}
      <p className={readonlyClass}>
        {quotes ? (
          <>
            &ldquo;{rendered}&rdquo;
          </>
        ) : (
          rendered
        )}
      </p>
    </div>
  );
}

