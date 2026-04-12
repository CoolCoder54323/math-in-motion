"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useNarration } from "@/hooks/useNarration";
import {
  useAppStore,
  type AnimationPlan,
  type AnimationStep,
  type RenderStatus,
} from "@/lib/store";

const AnimationEngine = dynamic(
  () =>
    import("@/components/AnimationEngine").then((m) => ({
      default: m.AnimationEngine,
    })),
  { ssr: false },
);

export function AnimationPreview() {
  const plan = useAppStore((s) => s.animationPlan);
  const isLoading = useAppStore((s) => s.loading === "plan");

  return (
    <figure className="relative">
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

      {plan ? <Stage plan={plan} /> : <EmptyStage isLoading={isLoading} />}

      <figcaption className="mt-4 text-center font-heading text-xs italic uppercase tracking-[0.3em] text-[color:var(--umber)]/55">
        {plan
          ? "✶ a fresh animation plan ✶"
          : isLoading
            ? "✶ planting the idea ✶"
            : "✶ an empty stage, waiting ✶"}
      </figcaption>
    </figure>
  );
}

const DUMMY_PLAN: AnimationPlan = {
  title: "Adding ½ + ¼",
  estimatedDuration: 30,
  steps: [
    {
      label: "Introduce the problem",
      narration:
        "Let's start with a question: what is one half plus one quarter?",
    },
    {
      label: "Show one half as a pizza slice",
      narration:
        "Picture half of a pizza — that's one half, a big slice.",
    },
    {
      label: "Show one quarter",
      narration:
        "Now we add a quarter — that's a smaller piece, just one fourth of the whole pizza.",
    },
    {
      label: "Find a common denominator",
      narration:
        "But these slices are different sizes. We need to cut them so they speak the same language.",
    },
    {
      label: "Write the answer",
      narration:
        "Together, one half plus one quarter makes three quarters. That's our answer!",
    },
  ],
  manimCode: `from manim import *

SUNFLOWER = "#EFB94D"
UMBER = "#4A2F17"
ACCENT = "#D85E2A"

class Lesson(Scene):
    def construct(self):
        # Step 1: Introduce the problem
        problem = MathTex(r"\\frac{1}{2} + \\frac{1}{4} = ?", font_size=48, color=UMBER)
        problem.to_edge(UP)
        self.play(Write(problem))
        self.wait(1.5)

        # Step 2: Show one half as a pizza slice
        pizza_half = AnnularSector(inner_radius=0, outer_radius=2, start_angle=0, angle=PI, color=SUNFLOWER, fill_opacity=0.8)
        half_label = MathTex(r"\\frac{1}{2}", font_size=36, color=UMBER).next_to(pizza_half, DOWN)
        self.play(Create(pizza_half), Write(half_label))
        self.wait(1.5)

        # Step 3: Show one quarter
        pizza_quarter = AnnularSector(inner_radius=0, outer_radius=2, start_angle=0, angle=PI/2, color=ACCENT, fill_opacity=0.8).next_to(pizza_half, RIGHT, buff=1)
        quarter_label = MathTex(r"\\frac{1}{4}", font_size=36, color=UMBER).next_to(pizza_quarter, DOWN)
        self.play(Create(pizza_quarter), Write(quarter_label))
        self.wait(1.5)

        # Step 4: Find a common denominator
        eq = MathTex(r"\\frac{1}{2} = \\frac{2}{4}", font_size=40, color=UMBER).next_to(pizza_half, DOWN, buff=1)
        self.play(Write(eq))
        self.wait(1.5)

        # Step 5: Write the answer
        answer = MathTex(r"\\frac{1}{2} + \\frac{1}{4} = \\frac{3}{4}", font_size=48, color=UMBER)
        answer.move_to(DOWN * 2)
        self.play(ReplacementTransform(problem.copy(), answer))
        self.wait(3)
`,
};

function Stage({ plan }: { plan: AnimationPlan }) {
  const renderStatus = useAppStore((s) => s.renderStatus);
  const setRenderStatus = useAppStore((s) => s.setRenderStatus);
  const videoUrl = useAppStore((s) => s.videoUrl);
  const setVideoUrl = useAppStore((s) => s.setVideoUrl);
  const setRenderError = useAppStore((s) => s.setRenderError);
  const renderError = useAppStore((s) => s.renderError);
  const playbackStatus = useAppStore((s) => s.playbackStatus);
  const setPlaybackStatus = useAppStore((s) => s.setPlaybackStatus);
  const currentStepIndex = useAppStore((s) => s.currentStepIndex);
  const setCurrentStepIndex = useAppStore((s) => s.setCurrentStepIndex);
  const playbackError = useAppStore((s) => s.playbackError);
  const setPlaybackError = useAppStore((s) => s.setPlaybackError);
  const narrationRate = useAppStore((s) => s.narrationRate);
  const setNarrationRate = useAppStore((s) => s.setNarrationRate);
  const narrationVoiceURI = useAppStore((s) => s.narrationVoiceURI);
  const setNarrationVoiceURI = useAppStore((s) => s.setNarrationVoiceURI);
  const setAnimationPlan = useAppStore((s) => s.setAnimationPlan);

  const { voices: narrationVoices, speak, stop: stopNarration, isSupported: narrationSupported } = useNarration();
  const narrate = useCallback(
    (text: string, signal?: AbortSignal) => speak(text, { signal }),
    [speak],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const startRender = useCallback(async () => {
    if (!plan.manimCode) return;
    setRenderStatus("pending");
    toast.loading("Rendering your animation…", { id: "manim-render" });
    try {
      const res = await fetch("/api/render-animation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manimCode: plan.manimCode, quality: "l" }),
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

  const isPlaying = playbackStatus === "playing";

  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (playbackStatus === "playing") {
      if (toastIdRef.current == null) {
        toastIdRef.current = toast.loading("Playing preview…");
      }
    } else if (playbackStatus === "complete") {
      if (toastIdRef.current != null) {
        toast.success("That's the lesson!", { id: toastIdRef.current });
        toastIdRef.current = null;
      }
    } else if (playbackStatus === "error") {
      if (toastIdRef.current != null) {
        toast.error(playbackError ?? "Render failed", {
          id: toastIdRef.current,
        });
        toastIdRef.current = null;
      }
    } else if (playbackStatus === "idle") {
      if (toastIdRef.current != null) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    }
  }, [playbackStatus, playbackError]);

  const handlePlayPreview = useCallback(() => {
    setPlaybackError(null);
    setCurrentStepIndex(0);
    setPlaybackStatus("playing");
    setPreviewMode(true);
  }, [setPlaybackError, setCurrentStepIndex, setPlaybackStatus]);

  const handleStopPreview = useCallback(() => {
    stopNarration();
    setPlaybackStatus("idle");
    setCurrentStepIndex(-1);
    setPreviewMode(false);
  }, [stopNarration, setPlaybackStatus, setCurrentStepIndex]);

  const onComplete = useCallback(() => {
    setPlaybackStatus("complete");
  }, [setPlaybackStatus]);

  const onError = useCallback(
    (message: string) => {
      setPlaybackError(message);
      setPlaybackStatus("error");
    },
    [setPlaybackError, setPlaybackStatus],
  );

  const onStepChange = useCallback(
    (i: number) => setCurrentStepIndex(i),
    [setCurrentStepIndex],
  );

  const onVoiceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setNarrationVoiceURI(event.target.value || null);
  };
  const onRateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNarrationRate(Number(event.target.value));
  };

  const sortedVoices = useMemo(() => {
    return [...narrationVoices].sort((a, b) => {
      const aEn = /^en/i.test(a.lang) ? 0 : 1;
      const bEn = /^en/i.test(b.lang) ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return a.name.localeCompare(b.name);
    });
  }, [narrationVoices]);

  const total = plan.steps.length;
  const safeIndex = Math.max(0, Math.min(currentStepIndex, total - 1));
  const progress =
    currentStepIndex < 0 ? 0 : (currentStepIndex + 1) / total;

  const showLoadDummy = process.env.NODE_ENV === "development";

  const renderStatusLabel: Record<RenderStatus, string> = {
    idle: "",
    pending: "Queuing render…",
    rendering: "Rendering…",
    complete: "",
    error: "Render failed",
  };

  return (
    <div className="relative flex flex-col gap-8 px-6 py-12 md:px-12 md:py-14">
      <header className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sunflower)]/35 px-3 py-1 font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
          <span aria-hidden="true">🎬</span>
          {Math.round(plan.estimatedDuration)}s lesson
        </span>
        <h3 className="font-heading text-4xl font-semibold italic leading-[1.05] tracking-tight text-[color:var(--umber)] md:text-5xl">
          {plan.title}
        </h3>
        {showLoadDummy && (
          <button
            type="button"
            onClick={() => setAnimationPlan(DUMMY_PLAN)}
            className="font-heading text-[11px] italic text-[color:var(--umber)]/50 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
          >
            ↻ load dummy plan (dev)
          </button>
        )}
      </header>

      {playbackError && !previewMode && (
        <p className="rounded-xl border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.3)] px-4 py-3 font-heading italic text-[color:var(--accent)]">
          {playbackError}
        </p>
      )}

      {renderError && (
        <p className="rounded-xl border-l-[3px] border-[color:var(--accent)] bg-[oklch(0.96_0.06_55/0.3)] px-4 py-3 font-heading italic text-[color:var(--accent)]">
          {renderError}
        </p>
      )}

      {/* Canvas frame */}
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
          ) : previewMode && isPlaying ? (
            <AnimationEngine
              plan={plan}
              narrate={narrate}
              isPlaying={isPlaying}
              onStepChange={onStepChange}
              onComplete={onComplete}
              onError={onError}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-3 text-[color:var(--umber)]/50"
              style={{ aspectRatio: "16/9" }}
            >
              <p className="font-heading text-lg italic">
                {renderStatusLabel[renderStatus] || "Click Preview to play."}
              </p>
              {plan.manimCode && (
                <p className="font-heading text-sm italic text-[color:var(--umber)]/40">
                  Or Render HD for a high-quality video.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-4">
        <div className="flex items-center justify-center gap-4">
          {/* Preview controls (browser manim-web) */}
          {!videoUrl && (
            <>
              <Button
                type="button"
                variant="default"
                onClick={handlePlayPreview}
                disabled={isPlaying}
                className="font-heading text-base italic"
              >
                ▶ Preview
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleStopPreview}
                disabled={!isPlaying}
                className="font-heading text-base italic"
              >
                ■ Stop
              </Button>
            </>
          )}

          {/* Render button */}
          {plan.manimCode && !videoUrl && renderStatus !== "pending" && renderStatus !== "rendering" && (
            <Button
              type="button"
              variant="outline"
              onClick={startRender}
              className="font-heading text-base italic"
            >
              ✦ Render HD
            </Button>
          )}

          {renderStatus === "pending" && (
            <span className="font-heading text-sm italic text-[color:var(--umber)]/60">
              ⏳ Queuing render…
            </span>
          )}
          {renderStatus === "rendering" && (
            <span className="font-heading text-sm italic text-[color:var(--umber)]/60">
              ⏳ Rendering your animation…
            </span>
          )}
          {renderStatus === "error" && (
            <Button
              type="button"
              variant="outline"
              onClick={startRender}
              className="font-heading text-sm italic"
            >
              ↻ Retry render
            </Button>
          )}
        </div>

        {/* Progress bar (preview mode) */}
        {!videoUrl && previewMode && (
          <div className="flex flex-col gap-2">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--rule)]/40">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--sunflower-deep)] transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs text-[color:var(--umber)]/65">
              <span className="font-heading italic">
                {currentStepIndex < 0
                  ? "Ready when you are."
                  : `"${
                      plan.steps[safeIndex]?.narration ?? ""
                    }"`}
              </span>
              <span className="font-mono tabular-nums">
                {currentStepIndex < 0
                  ? `0 / ${total}`
                  : `${safeIndex + 1} / ${total}`}
              </span>
            </div>
          </div>
        )}

        {/* Voice + rate controls (preview mode only) */}
        {!videoUrl && (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 font-heading text-sm italic text-[color:var(--umber)]/75">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--umber)]/55">
                voice
              </span>
              <select
                value={narrationVoiceURI ?? ""}
                onChange={onVoiceChange}
                disabled={!narrationSupported || sortedVoices.length === 0}
                className="rounded-full border border-[color:var(--rule)] bg-[var(--paper)] px-3 py-1.5 font-heading text-sm italic text-[color:var(--umber)] focus:outline-none focus:ring-2 focus:ring-[color:var(--sunflower-deep)]/40"
              >
                {sortedVoices.length === 0 && (
                  <option value="">(loading voices…)</option>
                )}
                {sortedVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} — {v.lang}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3 font-heading text-sm italic text-[color:var(--umber)]/75">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--umber)]/55">
                pace
              </span>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={narrationRate}
                onChange={onRateChange}
                className="h-1 w-32 cursor-pointer accent-[color:var(--sunflower-deep)]"
              />
              <span className="font-mono text-xs tabular-nums text-[color:var(--umber)]/60">
                {narrationRate.toFixed(2)}×
              </span>
            </label>
          </div>
        )}

        {/* Source code toggle */}
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

      {/* Step list */}
      <ol className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {plan.steps.map((step, i) => (
          <StepRow
            key={i}
            index={i}
            step={step}
            active={i === currentStepIndex}
          />
        ))}
      </ol>
    </div>
  );
}

function StepRow({
  index,
  step,
  active,
}: {
  index: number;
  step: AnimationStep;
  active: boolean;
}) {
  return (
    <li
      className={`relative grid grid-cols-[auto_1fr] gap-5 rounded-2xl bg-[oklch(0.97_0.04_85/0.6)] p-5 ring-1 transition-all md:p-6 ${
        active
          ? "ring-[color:var(--sunflower-deep)] ring-2 shadow-[0_18px_30px_-18px_oklch(0.3_0.1_55/0.4)]"
          : "ring-[color:var(--rule)]/50"
      }`}
    >
      <span
        aria-hidden="true"
        className={`font-heading text-5xl font-semibold italic leading-none md:text-6xl ${
          active
            ? "text-[color:var(--accent)]"
            : "text-[color:var(--sunflower-deep)]"
        }`}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-3">
        <p className="font-heading text-base font-semibold tracking-tight text-[color:var(--umber)] md:text-lg">
          {step.label}
        </p>
        <p className="rounded-lg border-l-[3px] border-[color:var(--accent)]/60 bg-[oklch(0.94_0.06_82/0.7)] px-4 py-2 font-heading italic leading-relaxed text-[color:var(--umber)]/90">
          <span aria-hidden="true" className="mr-1">
            🗣
          </span>
          &ldquo;{step.narration}&rdquo;
        </p>
      </div>
    </li>
  );
}

function EmptyStage({ isLoading }: { isLoading: boolean }) {
  const setAnimationPlan = useAppStore((s) => s.setAnimationPlan);
  const showLoadDummy = process.env.NODE_ENV === "development";

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
        ×
      </span>
      <span
        aria-hidden="true"
        className="bounce-soft absolute left-[16%] bottom-[18%] font-heading text-5xl font-bold text-[color:var(--accent)]/45"
        style={{ animationDelay: "0.8s" }}
      >
        ½
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
              ∑
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 font-heading text-xl font-bold text-[color:var(--accent)]/70">
              π
            </span>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 font-heading text-xl font-bold text-[color:var(--sunflower-deep)]/70">
              √
            </span>
            <span className="absolute left-0 top-1/2 -translate-y-1/2 font-heading text-xl font-bold text-[color:var(--accent)]/70">
              ∞
            </span>
          </div>
        </div>
        <div className="sway relative flex size-24 items-center justify-center text-6xl">
          🌻
        </div>
      </div>

      <p className="font-heading text-3xl font-semibold italic tracking-tight text-[color:var(--umber)] md:text-4xl">
        {isLoading
          ? "Planting the idea…"
          : "Your animation will bloom here."}
      </p>
      <p className="max-w-md text-base leading-relaxed text-[color:var(--umber)]/65 md:text-lg">
        {isLoading
          ? "Our sunflower is arranging the steps, the visuals, and the narration just for you."
          : "Upload a worksheet problem or describe a concept above, and we\u2019ll plant the idea right on this page."}
      </p>

      {showLoadDummy && !isLoading && (
        <button
          type="button"
          onClick={() => setAnimationPlan(DUMMY_PLAN)}
          className="mt-2 font-heading text-xs italic text-[color:var(--umber)]/50 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
        >
          ↻ load dummy plan (dev)
        </button>
      )}
    </div>
  );
}
