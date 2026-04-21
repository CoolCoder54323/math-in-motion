"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PromptComposer } from "@/components/PromptComposer";
import { useAppStore } from "@/lib/store";
import type { PlanOutput, PipelineStage } from "@/lib/pipeline/types";

/* ------------------------------------------------------------------ */
/*  Phase types                                                         */
/* ------------------------------------------------------------------ */

type WorkshopPhase = "prompt" | "approval" | "build" | "done";

const PHASES: { key: WorkshopPhase; label: string }[] = [
  { key: "prompt", label: "PROMPT" },
  { key: "approval", label: "PLAN" },
  { key: "build", label: "BUILD" },
  { key: "done", label: "DONE" },
];

/* ------------------------------------------------------------------ */
/*  Phase stepper                                                       */
/* ------------------------------------------------------------------ */

function PhaseStepper({ current }: { current: WorkshopPhase }) {
  const currentIndex = PHASES.findIndex((p) => p.key === current);
  return (
    <div className="flex items-center justify-center gap-3 py-3 font-heading text-xs tracking-[0.2em] uppercase text-[color:var(--umber)]/40">
      {PHASES.map((p, i) => {
        const isActive = i === currentIndex;
        const isPast = i < currentIndex;
        return (
          <div key={p.key} className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 ${isActive ? "font-semibold text-[color:var(--umber)]" : isPast ? "text-[color:var(--umber)]/60" : ""}`}>
              <span className={`block size-2 rounded-full ${isActive ? "bg-[color:var(--sunflower-deep)]" : isPast ? "bg-[color:var(--umber)]/40" : "bg-[color:var(--rule)]/40"}`} />
              {p.label}
            </span>
            {i < PHASES.length - 1 && <span className="text-[color:var(--rule)]">—</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating math glyphs                                                */
/* ------------------------------------------------------------------ */

const GLYPHS = [
  { char: "∫", className: "left-[7%] top-[18%] text-5xl", variant: "drift-a" as const, delay: "0s" },
  { char: "+", className: "left-[4%] top-[65%] text-3xl", variant: "drift-b" as const, delay: "1.2s" },
  { char: "÷", className: "right-[6%] top-[30%] text-4xl", variant: "drift-c" as const, delay: "2.4s" },
  { char: "½", className: "right-[8%] top-[72%] text-6xl", variant: "drift-a" as const, delay: "0.6s" },
  { char: "√", className: "right-[22%] top-[12%] text-2xl", variant: "drift-b" as const, delay: "1.8s" },
];

function MathGlyphs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {GLYPHS.map(({ char, className, variant, delay }, i) => (
        <span key={i} className={`math-glyph ${variant} ${className}`} style={{ animationDelay: delay }}>
          {char}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status pill                                                         */
/* ------------------------------------------------------------------ */

function StatusPill({ status, duration }: { status: string; duration?: number }) {
  const map: Record<string, { label: string; dotClass: string; bg: string; ring: string; text: string; pulse: boolean }> = {
    pending: { label: "waiting", dotClass: "bg-[color:var(--umber)]/30", bg: "bg-[color:var(--paper-warm)]", ring: "ring-1 ring-[color:var(--rule)]/40", text: "text-[color:var(--umber)]/55", pulse: false },
    generating: { label: "drafting", dotClass: "bg-[color:var(--sunflower-deep)] soft-pulse", bg: "bg-[color:var(--sunflower)]/35", ring: "ring-1 ring-[color:var(--sunflower-deep)]/50", text: "text-[color:var(--umber)]", pulse: true },
    regenerating: { label: "redoing", dotClass: "bg-[color:var(--accent)] soft-pulse", bg: "bg-[oklch(0.92_0.12_55/0.4)]", ring: "ring-1 ring-[color:var(--accent)]/40", text: "text-[color:var(--accent)]", pulse: true },
    ready: { label: duration ? `${duration.toFixed(1)}s` : "ready", dotClass: "bg-oklch(0.62_0.194_149)", bg: "bg-oklch(0.62_0.194_149)/25", ring: "ring-1 ring-oklch(0.62_0.194_149)/50", text: "text-[color:var(--umber)]", pulse: false },
    failed: { label: "failed", dotClass: "bg-[color:var(--accent)]", bg: "bg-[oklch(0.96_0.06_55/0.35)]", ring: "ring-1 ring-[color:var(--accent)]/50", text: "text-[color:var(--accent)]", pulse: false },
  };
  const m = map[status] || map.pending;
  return (
    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-heading text-[9px] font-semibold uppercase tracking-[0.18em] ${m.bg} ${m.ring} ${m.text}`}>
      <span className={`block size-1.5 rounded-full ${m.dotClass}`} />
      {m.label}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Prompt screen                                                       */
/* ------------------------------------------------------------------ */

function PromptScreen() {
  const pipelineJobId = useAppStore((s) => s.pipelineJobId);
  const loading = useAppStore((s) => s.loading);

  const showViewInGallery = pipelineJobId && (loading === "pipeline" || loading === "ocr" || loading === "plan");

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <MathGlyphs />
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-4">
        <div className="relative w-full max-w-2xl">
          <PromptComposer />
        </div>
        {showViewInGallery && pipelineJobId && (
          <div className="rise-in mt-4 w-full max-w-2xl">
            <a
              href={`/animations?highlight=${pipelineJobId}`}
              className="flex items-center justify-center gap-2 rounded-full bg-[color:var(--sunflower-deep)]/15 px-5 py-3 font-heading text-sm font-semibold text-[color:var(--sunflower-deep)] transition-all hover:bg-[color:var(--sunflower-deep)]/25 hover:-translate-y-0.5"
            >
              <span aria-hidden="true">✦</span> View in Gallery
              <span className="text-[color:var(--sunflower-deep)]/60">&mdash; leave anytime, we&apos;ll keep building</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Approval screen                                                     */
/* ------------------------------------------------------------------ */

function ApprovalScreen() {
  const livePlan = useAppStore((s) => s.livePlan);
  const planApprovalPending = useAppStore((s) => s.planApprovalPending);
  const approvalLoading = useAppStore((s) => s.approvalLoading);
  const approvalError = useAppStore((s) => s.approvalError);
  const approvePlan = useAppStore((s) => s.approvePlan);
  const updatePlanDraft = useAppStore((s) => s.updatePlanDraft);
  const updateSceneDraft = useAppStore((s) => s.updateSceneDraft);
  const updateStepDraft = useAppStore((s) => s.updateStepDraft);
  const resetPipeline = useAppStore((s) => s.resetPipeline);

  if (!livePlan) return null;

  const total = livePlan.sceneBreakdown.length;
  const durationSec = Math.round(livePlan.estimatedDuration);

  return (
    <div className="flex h-0 flex-1 overflow-hidden">
      {/* Left sidebar */}
      <aside className="flex w-80 flex-shrink-0 flex-col gap-5 border-r border-[color:var(--rule)]/35 bg-[color:var(--paper)]/60 px-7 py-8 backdrop-blur-sm">
        <div className="rise-in">
          <div className="chip mb-3 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sunflower)]/35 px-2.5 py-1 font-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
            <span>✎</span> draft lesson plan
            <span className="not-italic font-normal normal-case tracking-normal opacity-70">· ✦ {durationSec}s · {total} scenes</span>
          </div>
          <h2 className="font-heading text-2xl font-semibold italic leading-tight text-[color:var(--umber)]">
            {livePlan.title}
          </h2>
          <p className="mt-2 font-heading text-sm italic leading-relaxed text-[color:var(--umber)]/60">
            ✦ Scroll confirmed — cards scroll properly now.
          </p>
        </div>

        <div className="flex-1" />

        <div className="rise-in flex flex-col gap-3" style={{ animationDelay: "120ms" }}>
          <button
            type="button"
            onClick={() => void approvePlan()}
            disabled={approvalLoading}
            className="text-link self-center text-xl disabled:opacity-50 disabled:cursor-wait"
          >
            {approvalLoading ? "Starting…" : "Approve & start building"}
            {!approvalLoading && <span aria-hidden="true" className="text-link-arrow"> →</span>}
          </button>
          {approvalError && (
            <p className="font-heading text-sm text-red-600">{approvalError}</p>
          )}
          <button
            onClick={() => resetPipeline()}
            className="font-heading text-xs italic text-[color:var(--umber)]/50 transition-colors hover:text-[color:var(--umber)]"
          >
            ← back to prompt
          </button>
        </div>
      </aside>

      {/* Right: scene cards */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(0.78 0.08 70 / 0.5) transparent' }}>
        {livePlan.sceneBreakdown.map((scene, i) => {
          const step = livePlan.steps[i];
          return (
            <ApprovalSceneCard
              key={scene.sceneId}
              index={i}
              scene={scene}
              step={step}
              planApprovalPending={planApprovalPending}
              onEditScene={(patch) => updateSceneDraft(scene.sceneId, patch)}
              onEditStep={(patch) => { if (step) updateStepDraft(i, patch); }}
              onEditTitle={(title) => updatePlanDraft({ ...livePlan, title })}
            />
          );
        })}
      </div>
    </div>
  );
}

function ApprovalSceneCard({
  index,
  scene,
  step,
  planApprovalPending,
  onEditScene,
  onEditStep,
  onEditTitle,
}: {
  index: number;
  scene: { sceneId: string; description: string; mathContent: string };
  step?: { label: string; narration: string };
  planApprovalPending: boolean;
  onEditScene: (patch: Record<string, string>) => void;
  onEditStep: (patch: Record<string, string>) => void;
  onEditTitle: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(scene.description);
  const [editMath, setEditMath] = useState(scene.mathContent);
  const [editNarr, setEditNarr] = useState(step?.narration ?? "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onEditScene({ description: editDesc, mathContent: editMath });
    if (step) onEditStep({ narration: editNarr });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDiscard = () => {
    setEditDesc(scene.description);
    setEditMath(scene.mathContent);
    setEditNarr(step?.narration ?? "");
    setEditing(false);
  };

  return (
    <div
      className={`scene-card rise-in grid grid-cols-[52px_1fr] gap-4 rounded-2xl p-5 ring-1 transition-all ${
        editing
          ? "bg-[oklch(0.97_0.06_85/0.8)] ring-[color:var(--sunflower-deep)]/55"
          : "bg-[oklch(0.97_0.04_85/0.7)] ring-[color:var(--rule)]/50"
      }`}
      style={{ animationDelay: `${Math.min(index * 80, 480)}ms` }}
    >
      {/* Number only — no status pill during approval */}
      <div className="flex flex-col items-center gap-2 pt-0.5">
        <span className="font-heading text-4xl font-semibold italic leading-none text-[color:var(--sunflower-deep)]">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* Fields + actions */}
      <div className="flex flex-col gap-2.5">
        {/* Scene description */}
        <ViewEditField
          label="scene"
          value={editing ? editDesc : scene.description}
          editable={editing}
          multiline
          onChange={setEditDesc}
        />
        {/* Math content */}
        {(scene.mathContent || editing) && (
          <ViewEditField
            label="math"
            value={editing ? editMath : scene.mathContent}
            editable={editing}
            onChange={setEditMath}
            mono
          />
        )}
        {/* Narration */}
        {step && (
          <div className="rounded-lg border-l-[3px] border-[color:var(--accent)]/60 bg-[oklch(0.94_0.06_82/0.7)] px-3 py-2">
            <div className="font-heading text-[10px] font-semibold uppercase tracking-[0.25em] text-[color:var(--umber)]/45">narration</div>
            <ViewEditField
              label={null}
              value={editing ? editNarr : step.narration}
              editable={editing}
              multiline
              onChange={setEditNarr}
              italic
              quotes
            />
          </div>
        )}

        {/* Edit / Save row */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="mr-auto font-heading text-xs italic text-[color:var(--sunflower-deep)]">✦ Saved</span>
          )}
          {editing ? (
            <>
              <button
                onClick={handleDiscard}
                className="rounded-full border border-[color:var(--rule)]/50 px-3.5 py-1 font-heading text-xs text-[color:var(--umber)]/60 transition-colors hover:border-[color:var(--umber)]"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                className="rounded-full border-none bg-[color:var(--sunflower-deep)] px-4 py-1 font-heading text-xs font-semibold text-[oklch(0.22_0.07_55)] shadow-sm transition-colors hover:bg-[oklch(0.65_0.19_75)]"
              >
                Save
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--rule)]/50 px-3.5 py-1 font-heading text-xs text-[color:var(--umber)] transition-colors hover:border-[color:var(--sunflower-deep)] hover:bg-[color:var(--sunflower)]/10"
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewEditField({
  label,
  value,
  editable,
  onChange,
  multiline,
  mono,
  italic,
  quotes,
}: {
  label: string | null;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  multiline?: boolean;
  mono?: boolean;
  italic?: boolean;
  quotes?: boolean;
}) {
  const fontStyle = mono
    ? "font-mono text-xs"
    : italic
      ? "font-heading text-sm italic"
      : "font-heading text-sm";

  return (
    <div>
      {label && (
        <div className="mb-1 font-heading text-[10px] font-semibold uppercase tracking-[0.25em] text-[color:var(--umber)]/45">{label}</div>
      )}
      {editable ? (
        <textarea
          value={quotes ? `"${value}"` : value}
          onChange={(e) => onChange(e.target.value)}
          rows={multiline ? 2 : 1}
          className={`${fontStyle} w-full resize-none rounded-md border-0 bg-[oklch(0.98_0.02_85)] px-2 py-1 outline-none ring-1 ring-[color:var(--rule)]/40 transition-shadow focus-visible:ring-2 focus-visible:ring-[color:var(--sunflower-deep)]/60`}
        />
      ) : (
        <p className={fontStyle}>{quotes ? `"${value}"` : value}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Build screen                                                        */
/* ------------------------------------------------------------------ */

function BuildScreen() {
  const livePlan = useAppStore((s) => s.livePlan);
  const sceneStates = useAppStore((s) => s.sceneStates);
  const isPaused = useAppStore((s) => s.isPaused);
  const pipelineJobId = useAppStore((s) => s.pipelineJobId);
  const abortGeneration = useAppStore((s) => s.abortGeneration);
  const setPaused = useAppStore((s) => s.setPaused);
  const regenerateScene = useAppStore((s) => s.regenerateScene);

  const [featured, setFeatured] = useState(0);

  if (!livePlan) return null;

  const scenes = livePlan.sceneBreakdown;
  const total = scenes.length;
  const readyCount = Object.values(sceneStates).filter((s) => s.status === "ready").length;
  const activeScene = scenes.find((s) => sceneStates[s.sceneId]?.status === "generating" || sceneStates[s.sceneId]?.status === "regenerating");
  const allReady = readyCount === total;
  const pct = total === 0 ? 0 : Math.round((readyCount / total) * 100);

  const featuredScene = scenes[featured];
  const featuredState = sceneStates[featuredScene?.sceneId]?.status ?? "pending";
  const featuredClip = sceneStates[featuredScene?.sceneId]?.clipUrl;
  const featuredDuration = sceneStates[featuredScene?.sceneId]?.durationSeconds;

  const prev = () => setFeatured((f) => (f - 1 + total) % total);
  const next = () => setFeatured((f) => (f + 1) % total);

  const onPause = async () => {
    if (!pipelineJobId) return;
    try {
      await fetch(`/api/pipeline/${pipelineJobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      setPaused(true);
    } catch { /* silent */ }
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
    } catch { /* silent */ }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <aside className="flex w-64 flex-shrink-0 flex-col gap-4 border-r border-[color:var(--rule)]/35 bg-[color:var(--paper)]/60 px-5 py-6">
        <div className="rise-in">
          <div className="chip mb-3 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sunflower)]/35 px-2.5 py-1 font-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
            <span>🎬</span> the workshop
          </div>
          <h2 className="font-heading text-lg font-semibold italic leading-tight text-[color:var(--umber)]">
            {livePlan.title}
          </h2>
        </div>

        {/* Progress */}
        <div className="rise-in flex flex-col gap-2" style={{ animationDelay: "60ms" }}>
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-xs italic text-[color:var(--umber)]/60">
              {allReady
                ? "Every scene is ready!"
                : activeScene
                  ? `Drafting scene ${scenes.indexOf(activeScene) + 1}…`
                  : "Warming up the ink."}
            </p>
            <span className="font-heading text-[11px] italic text-[color:var(--umber)]/45">{readyCount}/{total}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--rule)]/30">
            <div className="h-full rounded-full bg-gradient-to-r from-[color:var(--sunflower-deep)] to-[color:var(--sunflower)] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex-1" />

        {/* Controls */}
        {abortGeneration && (
          <>
            <div className="flex gap-2">
              {!isPaused ? (
                <button
                  onClick={onPause}
                  className="flex-1 rounded-lg border border-[color:var(--rule)]/50 px-2 py-1.5 font-heading text-xs text-[color:var(--umber)] transition-colors hover:bg-[color:var(--paper-warm)]"
                >
                  ⏸ Pause
                </button>
              ) : (
                <button
                  onClick={onResume}
                  className="flex-1 rounded-lg border border-[color:var(--rule)]/50 px-2 py-1.5 font-heading text-xs text-[color:var(--umber)] transition-colors hover:bg-[color:var(--paper-warm)]"
                >
                  ▶ Resume
                </button>
              )}
              <button
                onClick={() => abortGeneration()}
                className="flex-1 rounded-lg border border-[color:var(--rule)]/50 px-2 py-1.5 font-heading text-xs text-[color:var(--umber)]/60 transition-colors hover:bg-[oklch(0.96_0.06_55/0.3)] hover:text-[color:var(--accent)]"
              >
                ⏹ Stop
              </button>
            </div>
          </>
        )}

        {allReady && abortGeneration && (
          <div className="font-heading text-xs italic text-[color:var(--sunflower-deep)] text-center">
            ✦ All scenes complete — finalizing video…
          </div>
        )}
      </aside>

      {/* Right: carousel + gallery */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Carousel */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden px-7 pt-6 pb-4">
          {/* Scene label + nav */}
          <div className="flex items-center gap-3">
            <button
              onClick={prev}
              className="flex size-8 items-center justify-center rounded-full border border-[color:var(--rule)]/50 bg-transparent text-sm text-[color:var(--umber)] transition-colors hover:bg-[color:var(--sunflower)] hover:border-[color:var(--sunflower)]"
            >
              ←
            </button>

            <div className="flex-1">
              <div className="flex items-center gap-2.5">
                <span className="font-heading text-3xl font-semibold italic leading-none text-[color:var(--sunflower-deep)]">
                  {String(featured + 1).padStart(2, "0")}
                </span>
                <StatusPill status={featuredState} duration={featuredDuration} />
                <span className="ml-auto font-heading text-[11px] italic text-[color:var(--umber)]/40">
                  {featured + 1} / {total}
                </span>
              </div>
              <p className="mt-1 font-heading text-sm text-[color:var(--umber)] leading-relaxed">
                {featuredScene?.description.length > 120
                  ? featuredScene?.description.slice(0, 120) + "…"
                  : featuredScene?.description}
              </p>
            </div>

            <button
              onClick={next}
              className="flex size-8 items-center justify-center rounded-full border border-[color:var(--rule)]/50 bg-transparent text-sm text-[color:var(--umber)] transition-colors hover:bg-[color:var(--sunflower)] hover:border-[color:var(--sunflower)]"
            >
              →
            </button>
          </div>

          {/* Featured content */}
          <div className="flex-1 min-h-0">
            {featuredState === "ready" && featuredClip ? (
              <div className="h-full">
                <div className="rounded-[14px] bg-gradient-to-br from-[color:var(--sunflower-deep)] via-[color:var(--accent)] to-[color:var(--sunflower)] p-[2px]">
                  <div className="overflow-hidden rounded-[12px] bg-[color:var(--paper)]">
                    <video
                      src={featuredClip}
                      controls
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : featuredState === "generating" || featuredState === "regenerating" ? (
              <div className="flex h-full items-center justify-center rounded-[14px] border-2 border-dashed border-[color:var(--sunflower-deep)]/50 bg-[oklch(0.94_0.06_82/0.35)]">
                <div className="text-center">
                  <div className="sway text-5xl mb-3">✏️</div>
                  <p className="font-heading text-lg font-semibold italic text-[color:var(--umber)]">
                    {featuredState === "regenerating" ? "Redrawing this scene…" : "Drawing this scene…"}
                  </p>
                  <p className="mt-1 font-heading text-xs italic text-[color:var(--umber)]/55">
                    Writing Manim code, validating, rendering. Usually ~10–20s.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[14px] border border-[color:var(--rule)]/40 bg-[oklch(0.97_0.04_85/0.5)]">
                <div className="text-center">
                  <span className="font-heading text-7xl font-semibold italic text-[oklch(0.7_0.18_75/0.2)]">
                    {String(featured + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-2 font-heading text-sm italic text-[color:var(--umber)]/35">
                    Waiting its turn…
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Redo link */}
          {featuredState === "ready" && (
            <div className="flex justify-end">
              <button
                onClick={() => regenerateScene(featuredScene.sceneId)}
                className="font-heading text-xs italic text-[color:var(--umber)]/50 transition-colors hover:text-[color:var(--accent)]"
              >
                ↻ Redo this scene
              </button>
            </div>
          )}
        </div>

        {/* Gallery strip */}
        <div className="border-t border-[color:var(--rule)]/30 px-7 py-4">
          <div className="mb-2.5 font-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--umber)]/40">All scenes</div>
          <div className="grid grid-cols-7 gap-2.5">
            {scenes.map((sc, i) => {
              const st = sceneStates[sc.sceneId]?.status ?? "pending";
              const isSelected = i === featured;
              const clip = sceneStates[sc.sceneId]?.clipUrl;
              const dur = sceneStates[sc.sceneId]?.durationSeconds;
              return (
                <button
                  key={sc.sceneId}
                  onClick={() => setFeatured(i)}
                  className={`rounded-lg border transition-all ${
                    isSelected
                      ? "border-[color:var(--sunflower-deep)] ring-2 ring-[color:var(--sunflower-deep)]/30 scale-[1.03]"
                      : "border-[color:var(--rule)]/40 hover:border-[color:var(--sunflower-deep)]/50"
                  }`}
                >
                  <div className="relative aspect-video overflow-hidden rounded-md" style={{
                    background: st === "ready"
                      ? "linear-gradient(135deg, oklch(0.9 0.16 85 / 0.6), oklch(0.75 0.19 45 / 0.3))"
                      : st === "generating" || st === "regenerating"
                        ? "oklch(0.94 0.06 82 / 0.6)"
                        : "oklch(0.94 0.04 85 / 0.5)",
                  }}>
                    {st === "ready" ? (
                      <>
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className="text-lg">🎬</span>
                          {dur && <span className="font-heading text-[9px] italic text-[color:var(--umber)]/60">{dur.toFixed(1)}s</span>}
                        </div>
                      </>
                    ) : st === "generating" || st === "regenerating" ? (
                      <div className="flex items-center justify-center h-full">
                        <span className="sway text-base">✏️</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="font-heading text-xl font-semibold italic text-[oklch(0.7_0.18_75/0.3)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                    )}
                    {/* Status dot */}
                    <div className={`absolute top-1 right-1 size-1.5 rounded-full ${
                      st === "ready" ? "bg-[oklch(0.62_0.194_149)]"
                        : st === "generating" || st === "regenerating" ? "bg-[color:var(--sunflower-deep)] soft-pulse"
                        : "bg-[color:var(--rule)]/50"
                    }`} />
                    {/* Label */}
                    <div className="absolute bottom-0.5 left-1.5 font-heading text-[8px] font-semibold italic text-[color:var(--umber)]/50">
                      Scene {i + 1}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Done screen                                                         */
/* ------------------------------------------------------------------ */

function DoneScreen() {
  const livePlan = useAppStore((s) => s.livePlan);
  const videoUrl = useAppStore((s) => s.videoUrl);
  const resetPipeline = useAppStore((s) => s.resetPipeline);
  const setConceptInput = useAppStore((s) => s.setConceptInput);

  const total = livePlan?.sceneBreakdown.length ?? 0;
  const durationSec = Math.round(livePlan?.estimatedDuration ?? 0);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <MathGlyphs />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-8 py-8">
        <div className="rise-in text-center relative">
          <div className="mb-3 text-5xl">🌻</div>
          <h2 className="font-heading text-3xl font-semibold italic text-[color:var(--umber)] mb-1">
            Your lesson is ready!
          </h2>
          <p className="font-sans text-sm text-[color:var(--umber)]/60 max-w-md">
            {total} scenes · {durationSec} seconds · {livePlan?.title}
          </p>
        </div>

        {/* Video */}
        {videoUrl && (
          <div className="rise-in mx-auto w-full max-w-3xl" style={{ animationDelay: "100ms" }}>
            <div className="rounded-[20px] bg-gradient-to-br from-[color:var(--sunflower-deep)] via-[color:var(--accent)] to-[color:var(--sunflower)] p-[2px] shadow-[0_20px_40px_-20px_oklch(0.3_0.1_55/0.4)]">
              <div className="overflow-hidden rounded-[18px] bg-[var(--paper)]">
                <video src={videoUrl} controls className="w-full" style={{ aspectRatio: "16/9" }} />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="rise-in flex gap-3 relative" style={{ animationDelay: "200ms" }}>
          <button
            onClick={() => {
              resetPipeline();
              setConceptInput("");
            }}
            className="rounded-full border border-[color:var(--rule)] px-5 py-2.5 font-heading text-sm font-semibold text-[color:var(--umber)] transition-colors hover:border-[color:var(--sunflower-deep)]"
          >
            Make another
          </button>
          <a
            href="/animations"
            className="rounded-full bg-[color:var(--sunflower-deep)] px-5 py-2.5 font-heading text-sm font-semibold text-white transition-colors hover:bg-[color:var(--sunflower-deep)]/90"
          >
            View in gallery →
          </a>
        </div>

        <p className="text-center font-heading text-sm italic text-[color:var(--umber)]/60 relative">
          Made to make hard math feel a little less hard.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WorkshopApp — phase orchestrator                                    */
/* ------------------------------------------------------------------ */

export function WorkshopApp() {
  const loading = useAppStore((s) => s.loading);
  const livePlan = useAppStore((s) => s.livePlan);
  const planApprovalPending = useAppStore((s) => s.planApprovalPending);
  const videoUrl = useAppStore((s) => s.videoUrl);

  // Resume from gallery: if ?jobId= is in the URL, load state from manifest
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const resumeFromGallery = useAppStore((s) => s.resumeFromGallery);

  // Read jobId from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("jobId");
    if (jobId && !resumeJobId) {
      setResumeJobId(jobId);
    }
  }, []);

  // Handle live SSE events for resume reconnection
  const handleResumeEvent = useCallback((event: Record<string, unknown>) => {
    const store = useAppStore.getState();

    switch (event.type) {
      case "pipeline-started":
        store.setPipelineJobId(event.jobId as string);
        break;
      case "stage-start":
        store.setCurrentStage(event.stage as PipelineStage);
        store.updatePipelineStage(event.stage as PipelineStage, { status: "running", progress: 0, message: "" });
        break;
      case "stage-complete":
        store.updatePipelineStage(event.stage as PipelineStage, { status: "success" as const, progress: 100 });
        break;
      case "plan-ready":
      case "plan-awaiting-approval": {
        const plan = event.plan as Record<string, unknown>;
        const planOutput = {
          title: (plan.title as string) ?? "Untitled Lesson",
          estimatedDuration: (plan.estimatedDuration as number) ?? 30,
          steps: (plan.steps as Array<{ label: string; narration: string }>) ?? [],
          sceneBreakdown: (plan.sceneBreakdown as Array<{ sceneId: string; description: string; mathContent: string; estimatedSeconds: number }>) ?? [],
        };
        store.setLivePlan(planOutput);
        store.initSceneStatesFromPlan(planOutput);
        store.setPlanApprovalPending(event.type === "plan-awaiting-approval");
        break;
      }
      case "scene-generating":
        store.setSceneState(event.sceneId as string, { status: "generating" });
        break;
      case "scene-ready":
        store.setSceneState(event.sceneId as string, {
          status: "ready",
          clipUrl: event.clipUrl as string,
          durationSeconds: event.durationSeconds as number,
        });
        store.addLiveClip({ sceneId: event.sceneId as string, clipUrl: event.clipUrl as string });
        break;
      case "scene-failed":
        store.setSceneState(event.sceneId as string, { status: "failed", error: event.error as string });
        break;
      case "pipeline-complete": {
        const manifest = event.manifest as Record<string, unknown>;
        const artifact = manifest.finalArtifact as Record<string, unknown> | undefined;
        if (artifact && artifact.path) {
          store.setVideoUrl(`/api/video/${manifest.jobId}/final.mp4`);
        }
        store.setLoading(null);
        const es = (window as unknown as Record<string, unknown>).__resumeEventSource as EventSource | undefined;
        if (es) es.close();
        break;
      }
      case "pipeline-error":
        store.setPipelineError(event.error as string);
        store.setLoading(null);
        const es2 = (window as unknown as Record<string, unknown>).__resumeEventSource as EventSource | undefined;
        if (es2) es2.close();
        break;
    }
  }, []);

  // Load state from gallery/manifest and optionally reconnect to live stream
  useEffect(() => {
    if (!resumeJobId || resuming) return;
    let cancelled = false;
    let evtSource: EventSource | null = null;

    (async () => {
      setResuming(true);
      try {
        const galleryRes = await fetch(`/api/gallery?jobId=${resumeJobId}`);
        if (!galleryRes.ok) {
          toast.error("Could not find this animation in the gallery.");
          return;
        }
        const entry = await galleryRes.json();

        const manifestRes = await fetch(`/api/pipeline/${resumeJobId}`);
        const manifest = manifestRes.ok ? await manifestRes.json() : null;

        if (cancelled) return;

        let videoUrl: string | null = null;
        if (entry.status === "complete") {
          videoUrl = `/api/video/${resumeJobId}/final.mp4`;
        }

        let plan: PlanOutput | null = null;
        if (entry.plan) {
          plan = entry.plan as PlanOutput;
        }

        resumeFromGallery({
          jobId: resumeJobId,
          conceptText: entry.conceptText || "",
          mode: entry.mode || "lesson",
          status: entry.status,
          currentStage: entry.currentStage ?? manifest?.stages?.find((s: { status: string }) => s.status === "running")?.stage ?? null,
          plan,
          videoUrl,
        });

        // Reconnect to live SSE stream for in-progress jobs
        if (entry.status === "building" || entry.status === "awaiting-approval" || entry.status === "generating") {
          evtSource = new EventSource(`/api/pipeline/${resumeJobId}/stream`);
          evtSource.onmessage = (e) => {
            try {
              const event = JSON.parse(e.data);
              handleResumeEvent(event);
            } catch {}
          };
          evtSource.onerror = () => {
            evtSource?.close();
          };
          (window as unknown as Record<string, unknown>).__resumeEventSource = evtSource;
        }
      } catch {
        toast.error("Failed to resume animation.");
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();

    return () => {
      cancelled = true;
      evtSource?.close();
    };
  }, [resumeJobId, handleResumeEvent, resumeFromGallery]);

  const phase = useMemo((): WorkshopPhase => {
    if (videoUrl) return "done";
    if (loading === "pipeline" && livePlan && !planApprovalPending) return "build";
    if (planApprovalPending && livePlan) return "approval";
    return "prompt";
  }, [loading, livePlan, planApprovalPending, videoUrl]);

  if (resuming) {
    return (
      <div className="bg-studio bg-paper-grain relative flex flex-1 flex-col items-center justify-center overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-64 -top-32 size-[42rem] rounded-full bg-[oklch(0.88_0.14_88/0.28)] blur-[140px]" />
          <div className="absolute -right-56 top-1/3 size-[46rem] rounded-full bg-[oklch(0.75_0.15_45/0.14)] blur-[160px]" />
          <div className="absolute left-1/4 -bottom-80 size-[56rem] rounded-full bg-[oklch(0.9_0.13_75/0.22)] blur-[180px]" />
        </div>
        <div className="sway text-5xl mb-4">✦</div>
        <p className="font-heading text-lg italic text-[color:var(--umber)]">Resuming animation…</p>
      </div>
    );
  }

  return (
    <div className="bg-studio bg-paper-grain relative flex flex-1 flex-col overflow-hidden">
      {/* Background color pools */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-64 -top-32 size-[42rem] rounded-full bg-[oklch(0.88_0.14_88/0.28)] blur-[140px]" />
        <div className="absolute -right-56 top-1/3 size-[46rem] rounded-full bg-[oklch(0.75_0.15_45/0.14)] blur-[160px]" />
        <div className="absolute left-1/4 -bottom-80 size-[56rem] rounded-full bg-[oklch(0.9_0.13_75/0.22)] blur-[180px]" />
      </div>

      {/* Phase stepper bar */}
      <PhaseStepper current={phase} />

      {/* Phase content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {phase === "prompt" && <PromptScreen />}
        {phase === "approval" && <ApprovalScreen />}
        {phase === "build" && <BuildScreen />}
        {phase === "done" && <DoneScreen />}
      </div>
    </div>
  );
}
