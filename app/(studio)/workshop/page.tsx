import { AnimationPreview } from "@/components/AnimationPreview";
import { PromptComposer } from "@/components/PromptComposer";

/**
 * Home — Math Animation Studio
 *
 * This page is laid out as a single "sheet of sunflower paper" rather than a
 * grid of cards. Editorial cues do the structural work:
 *   - A display headline with a hand-drawn squiggle and a drifting sparkle
 *   - Two columns separated by a wavy vertical hand-drawn divider
 *   - Horizontal editorial rules with a centered label to section the preview
 *   - Floating warm-toned math glyphs drifting behind the content
 *
 * Server Component — the interactive parts live inside the three child
 * components, each of which marks itself `"use client"`.
 */

// Drifting math glyphs — the atmospheric background. Each entry carries its
// own position, size, warm hue, delay, and one of three drift variants so
// nothing ever feels synchronized.
const FLOATING_GLYPHS: Array<{
  char: string;
  className: string;
  delay: string;
  variant: "drift-a" | "drift-b" | "drift-c";
}> = [
  {
    char: "+",
    className: "left-[5%] top-[12%] text-8xl text-[oklch(0.78_0.17_80/0.22)]",
    delay: "0s",
    variant: "drift-a",
  },
  {
    char: "÷",
    className: "right-[7%] top-[9%] text-7xl text-[oklch(0.62_0.18_45/0.22)]",
    delay: "1.2s",
    variant: "drift-b",
  },
  {
    char: "×",
    className: "left-[9%] top-[58%] text-6xl text-[oklch(0.78_0.17_80/0.22)]",
    delay: "2.4s",
    variant: "drift-c",
  },
  {
    char: "π",
    className: "right-[11%] top-[50%] text-7xl text-[oklch(0.78_0.17_80/0.22)]",
    delay: "0.6s",
    variant: "drift-a",
  },
  {
    char: "√",
    className: "left-[48%] top-[4%] text-6xl text-[oklch(0.62_0.18_45/0.22)]",
    delay: "1.8s",
    variant: "drift-b",
  },
  {
    char: "∑",
    className:
      "right-[22%] bottom-[10%] text-7xl text-[oklch(0.78_0.17_80/0.22)]",
    delay: "3s",
    variant: "drift-c",
  },
  {
    char: "−",
    className:
      "left-[20%] bottom-[14%] text-8xl text-[oklch(0.62_0.18_45/0.22)]",
    delay: "2s",
    variant: "drift-a",
  },
  {
    char: "½",
    className: "right-[42%] top-[1%] text-5xl text-[oklch(0.78_0.17_80/0.22)]",
    delay: "1s",
    variant: "drift-c",
  },
  {
    char: "🌻",
    className: "left-[3%] top-[40%] text-4xl opacity-60",
    delay: "1.4s",
    variant: "drift-b",
  },
  {
    char: "🌻",
    className: "right-[4%] bottom-[30%] text-3xl opacity-50",
    delay: "2.6s",
    variant: "drift-a",
  },
];

/**
 * Reusable editorial divider: a long hand-drawn horizontal rule with a small
 * label in the middle ("✶ CREATE ✶", "✶ PREVIEW ✶"). The two flanking SVG
 * strokes are ever so slightly wobbly for a handmade feel.
 */
function SectionRule({ label }: { label: string }) {
  return (
    <div
      role="separator"
      aria-label={label}
      className="relative flex items-center justify-center gap-4 py-8"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 400 12"
        preserveAspectRatio="none"
        className="h-3 flex-1 text-[color:var(--rule)]"
      >
        <path
          d="M2 6 Q 50 2, 100 6 T 200 6 T 300 6 T 398 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="flex items-center gap-2 whitespace-nowrap font-heading text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--umber)]/70">
        <span aria-hidden="true" className="text-[color:var(--sunflower-deep)]">
          ✶
        </span>
        {label}
        <span aria-hidden="true" className="text-[color:var(--sunflower-deep)]">
          ✶
        </span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 400 12"
        preserveAspectRatio="none"
        className="h-3 flex-1 text-[color:var(--rule)]"
      >
        <path
          d="M2 6 Q 100 10, 200 6 T 300 6 T 398 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * HeroPreview — a stylized "still frame" from a sample animation. Meant to
 * show the teacher immediately what the tool produces: a warm, narrated card
 * teaching a single idea (here, ½ + ¼ via pizza slices). Slightly tilted
 * and shadowed so it feels like a polaroid pinned to the page.
 */
function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Little hand-drawn "play" caption above the card. */}
      <div className="mb-3 flex items-center justify-center gap-2 font-heading text-xs italic text-[color:var(--umber)]/60">
        <span aria-hidden="true">▸</span>a sample animation frame
        <span aria-hidden="true">◂</span>
      </div>

      <div className="relative rotate-[-1.5deg] rounded-2xl bg-[color:var(--card)] p-5 shadow-[0_30px_60px_-30px_oklch(0.3_0.1_55/0.45),0_10px_20px_-10px_oklch(0.3_0.1_55/0.2)] ring-1 ring-[color:var(--rule)]/50">
        {/* Top caption bar — mimics a video title slate. */}
        <div className="flex items-center justify-between font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/60">
          <span>Frame 07 / 24</span>
          <span className="inline-flex items-center gap-1">
            <span className="soft-pulse inline-block size-1.5 rounded-full bg-[color:var(--accent)]" />
            0:18
          </span>
        </div>

        {/* The "video" itself — an SVG scene of pizza fractions. */}
        <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-[oklch(0.98_0.03_85)] ring-1 ring-[color:var(--rule)]/40">
          <svg
            viewBox="0 0 400 300"
            className="h-full w-full"
            aria-label="Sample frame: adding one half and one quarter shown as pizza slices"
          >
            <defs>
              <radialGradient id="crust" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="oklch(0.88 0.12 75)" />
                <stop offset="100%" stopColor="oklch(0.68 0.16 55)" />
              </radialGradient>
            </defs>

            {/* Left pizza — 1/2 */}
            <g transform="translate(95 145)">
              <circle
                r="62"
                fill="url(#crust)"
                stroke="oklch(0.45 0.12 45)"
                strokeWidth="3"
              />
              <path
                d="M0 0 L62 0 A62 62 0 0 1 -62 0 Z"
                fill="oklch(0.7 0.19 40)"
                stroke="oklch(0.38 0.12 35)"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {/* pepperoni */}
              <circle cx="-20" cy="15" r="5" fill="oklch(0.55 0.18 25)" />
              <circle cx="20" cy="10" r="5" fill="oklch(0.55 0.18 25)" />
              <circle cx="0" cy="30" r="5" fill="oklch(0.55 0.18 25)" />
              <text
                y="95"
                textAnchor="middle"
                className="font-heading"
                fontSize="26"
                fontStyle="italic"
                fill="oklch(0.3 0.08 55)"
              >
                ½
              </text>
            </g>

            {/* Plus sign */}
            <text
              x="200"
              y="160"
              textAnchor="middle"
              className="font-heading"
              fontSize="44"
              fontWeight="600"
              fill="oklch(0.6 0.18 50)"
            >
              +
            </text>

            {/* Right pizza — 1/4 */}
            <g transform="translate(305 145)">
              <circle
                r="62"
                fill="url(#crust)"
                stroke="oklch(0.45 0.12 45)"
                strokeWidth="3"
              />
              <path
                d="M0 0 L62 0 A62 62 0 0 1 0 62 Z"
                fill="oklch(0.7 0.19 40)"
                stroke="oklch(0.38 0.12 35)"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <circle cx="18" cy="18" r="5" fill="oklch(0.55 0.18 25)" />
              <circle cx="30" cy="8" r="4" fill="oklch(0.55 0.18 25)" />
              <text
                y="95"
                textAnchor="middle"
                className="font-heading"
                fontSize="26"
                fontStyle="italic"
                fill="oklch(0.3 0.08 55)"
              >
                ¼
              </text>
            </g>

            {/* Hand-drawn annotation arrow */}
            <path
              d="M200 50 Q 240 70, 260 95"
              fill="none"
              stroke="oklch(0.6 0.2 28 / 0.8)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="4 4"
            />
            <path
              d="M255 85 L262 96 L250 98"
              fill="none"
              stroke="oklch(0.6 0.2 28 / 0.8)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text
              x="150"
              y="42"
              className="font-heading"
              fontSize="16"
              fontStyle="italic"
              fill="oklch(0.6 0.2 28)"
            >
              same-size slices!
            </text>
          </svg>
        </div>

        {/* Caption below — the narration line for this frame. */}
        <p className="mt-3 font-heading text-sm italic leading-snug text-[color:var(--umber)]/80">
          &ldquo;Cut the half into two, and now both pizzas speak the same
          language&hellip;&rdquo;
        </p>

        {/* Fake progress scrubber. */}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[color:var(--rule)]/40">
            <div className="h-full w-[30%] rounded-full bg-[color:var(--sunflower-deep)]" />
          </div>
          <span className="font-heading text-[10px] tabular-nums text-[color:var(--umber)]/55">
            0:18 / 0:56
          </span>
        </div>
      </div>

      {/* Decorative tape at the top corner. */}
      <span
        aria-hidden="true"
        className="absolute -top-3 left-6 h-5 w-16 rotate-[-8deg] rounded-sm bg-[oklch(0.9_0.15_88/0.65)] shadow-[0_2px_4px_oklch(0.3_0.1_55/0.2)]"
      />
    </div>
  );
}

export default function Home() {
  return (
    <main className="bg-paper-grain relative flex-1">
      {/* ── Background layer 1: diagonal sunbeams ───────────────────────── */}
      <div
        aria-hidden="true"
        className="bg-sunbeams pointer-events-none absolute inset-0"
      />

      {/* ── Background layer 2: warm blurred color pools ────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-64 -top-32 size-[42rem] rounded-full bg-[oklch(0.88_0.14_88/0.28)] blur-[140px]" />
        <div className="absolute -right-56 top-1/3 size-[46rem] rounded-full bg-[oklch(0.75_0.15_45/0.14)] blur-[160px]" />
        <div className="absolute left-1/4 -bottom-80 size-[56rem] rounded-full bg-[oklch(0.9_0.13_75/0.22)] blur-[180px]" />
      </div>

      {/* ── Background layer 3: drifting math glyphs ────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {FLOATING_GLYPHS.map(({ char, className, delay, variant }, i) => (
          <span
            key={i}
            className={`math-glyph ${variant} ${className}`}
            style={{ animationDelay: delay }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* ── Foreground content ──────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-6xl px-6 py-16 md:px-12 md:py-24">
        {/* ── Hero: pitch on the left, sample preview on the right ──────── */}
        <header className="rise-in mb-16 grid items-center gap-12 md:mb-24 md:grid-cols-[1.05fr_1fr] md:gap-14">
          <div>
            <div className="mb-5 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--umber)]/70">
              <span aria-hidden="true" className="text-base">
                ☼
              </span>
              <span className="soft-pulse inline-block size-1.5 rounded-full bg-[color:var(--sunflower-deep)]" />
              A studio for K&ndash;8 teachers
            </div>

            <h1 className="font-heading text-5xl font-semibold leading-[0.98] tracking-tight text-[color:var(--umber)] md:text-6xl lg:text-7xl">
              <span className="text-red-600">Math In Motion</span>
              <br />
              into a{" "}
              <span className="relative inline-block italic">
                tiny movie
                <svg
                  aria-hidden="true"
                  viewBox="0 0 400 22"
                  preserveAspectRatio="none"
                  className="absolute -bottom-3 left-0 h-4 w-full text-[color:var(--sunflower-deep)]"
                >
                  <path
                    d="M4 14 Q 50 2, 100 12 T 200 10 T 300 11 T 396 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              .
            </h1>

            <p className="mt-8 max-w-xl text-base leading-relaxed text-[color:var(--umber)]/75 md:text-lg">
              Upload a worksheet, snap a photo, or just describe the concept —
              Math Animation Studio generates a short, narrated animation that
              walks your students through the intuition, step by step.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-heading text-sm italic text-[color:var(--umber)]/65">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">🎬</span> 30&ndash;60 second clips
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">🗣</span> narrated, grade-appropriate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">📚</span> classroom-ready
              </span>
            </div>
          </div>

          {/* Hero preview slot — a sample of what the tool produces, framed
              like an index-card still from an animation. */}
          <HeroPreview />
        </header>

        <SectionRule label="Create" />

        {/* ── Unified prompt composer ──────────────────────────────────── */}
        <section
          aria-label="Create an animation"
          className="rise-in py-10"
          style={{ animationDelay: "120ms" }}
        >
          <PromptComposer />
        </section>

        <SectionRule label="Preview" />

        <section
          aria-label="Animation preview"
          className="rise-in py-12"
          style={{ animationDelay: "360ms" }}
        >
          <AnimationPreview />
        </section>

        <SectionRule label="" />

        {/* Editorial colophon. */}
        <p className="mt-2 text-center font-heading text-sm italic text-[color:var(--umber)]/60">
          Made to make hard math feel a little less hard.
        </p>
      </div>
    </main>
  );
}
