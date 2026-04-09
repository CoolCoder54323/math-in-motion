"use client";

import { useAppStore } from "@/lib/store";

/**
 * AnimationPreview — the "stage" below the two input columns.
 *
 * When there is no plan in the store, this renders the original editorial
 * empty state (sketchbook frame, bouncing glyphs, orbiting sunflower).
 * Once the LLM returns a plan, it swaps to a warm, readable breakdown of
 * the generated lesson: title, duration pill, and a numbered list of steps
 * showing the on-screen description, a visual hint, and the narration line.
 */
export function AnimationPreview() {
  const plan = useAppStore((s) => s.animationPlan);
  const isLoading = useAppStore((s) => s.loading === "plan");

  return (
    <figure className="relative">
      {/* Hand-drawn sketchbook frame. */}
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

      {plan ? (
        <PlanView
          title={plan.title}
          estimatedDuration={plan.estimatedDuration}
          steps={plan.steps}
        />
      ) : (
        <EmptyStage isLoading={isLoading} />
      )}

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

function PlanView({
  title,
  estimatedDuration,
  steps,
}: {
  title: string;
  estimatedDuration: number;
  steps: { description: string; visualHint: string; narration: string }[];
}) {
  return (
    <div className="relative flex flex-col gap-8 px-8 py-14 md:px-16 md:py-16">
      <header className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--sunflower)]/35 px-3 py-1 font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/75 ring-1 ring-[color:var(--sunflower-deep)]/40">
          <span aria-hidden="true">🎬</span>
          {Math.round(estimatedDuration)}s lesson
        </span>
        <h3 className="font-heading text-4xl font-semibold italic leading-[1.05] tracking-tight text-[color:var(--umber)] md:text-5xl">
          {title}
        </h3>
      </header>

      <ol className="flex flex-col gap-6">
        {steps.map((step, i) => (
          <li
            key={i}
            className="relative grid grid-cols-[auto_1fr] gap-5 rounded-2xl bg-[oklch(0.97_0.04_85/0.6)] p-5 ring-1 ring-[color:var(--rule)]/50 md:p-6"
          >
            <span
              aria-hidden="true"
              className="font-heading text-5xl font-semibold italic leading-none text-[color:var(--sunflower-deep)] md:text-6xl"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-3">
              <p className="text-base leading-relaxed text-[color:var(--umber)] md:text-lg">
                {step.description}
              </p>
              <p className="flex items-start gap-2 font-heading text-sm italic text-[color:var(--umber)]/70">
                <span aria-hidden="true" className="not-italic">
                  ✶
                </span>
                <span>
                  <span className="font-semibold uppercase tracking-[0.2em] text-[color:var(--umber)]/50">
                    visual&nbsp;
                  </span>
                  {step.visualHint}
                </span>
              </p>
              <p className="rounded-lg border-l-[3px] border-[color:var(--accent)]/60 bg-[oklch(0.94_0.06_82/0.7)] px-4 py-2 font-heading italic leading-relaxed text-[color:var(--umber)]/90">
                <span aria-hidden="true" className="mr-1">
                  🗣
                </span>
                &ldquo;{step.narration}&rdquo;
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyStage({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="relative flex min-h-[360px] flex-col items-center justify-center gap-5 px-8 py-20 text-center">
      {/* Corner glyphs — the "floating elements" the user liked. */}
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
    </div>
  );
}
