"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppStore, type AnimationPlan } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { AnimationPreview } from "@/components/AnimationPreview";

const EXAMPLES: Array<{ word: string; prompt: string }> = [
  {
    word: "fractions",
    prompt:
      "Show me how to add fractions with unlike denominators, step by step, using a visual pizza-slice example.",
  },
  {
    word: "place value",
    prompt:
      "Explain place value — ones, tens, and hundreds — for 2nd-grade students with a concrete example.",
  },
  {
    word: "the distributive property",
    prompt:
      "What is the distributive property? Explain it visually with a relatable real-world example.",
  },
  {
    word: "area vs. perimeter",
    prompt:
      "Help students understand the difference between area and perimeter using a rectangular garden example.",
  },
  {
    word: "percentages",
    prompt:
      "Explain how to convert a fraction into a percentage for 5th-grade students in an intuitive way.",
  },
];

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

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="mb-3 flex items-center justify-center gap-2 font-heading text-xs italic text-[color:var(--umber)]/60">
        <span aria-hidden="true">▸</span>a sample animation frame
        <span aria-hidden="true">◂</span>
      </div>

      <div className="relative rotate-[-1.5deg] rounded-2xl bg-[color:var(--card)] p-5 shadow-[0_30px_60px_-30px_oklch(0.3_0.1_55/0.45),0_10px_20px_-10px_oklch(0.3_0.1_55/0.2)] ring-1 ring-[color:var(--rule)]/50">
        <div className="flex items-center justify-between font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/60">
          <span>Frame 07 / 24</span>
          <span className="inline-flex items-center gap-1">
            <span className="soft-pulse inline-block size-1.5 rounded-full bg-[color:var(--accent)]" />
            0:18
          </span>
        </div>

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

            <g transform="translate(95 145)">
              <circle r="62" fill="url(#crust)" stroke="oklch(0.45 0.12 45)" strokeWidth="3" />
              <path d="M0 0 L62 0 A62 62 0 0 1 -62 0 Z" fill="oklch(0.7 0.19 40)" stroke="oklch(0.38 0.12 35)" strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx="-20" cy="15" r="5" fill="oklch(0.55 0.18 25)" />
              <circle cx="20" cy="10" r="5" fill="oklch(0.55 0.18 25)" />
              <circle cx="0" cy="30" r="5" fill="oklch(0.55 0.18 25)" />
              <text y="95" textAnchor="middle" className="font-heading" fontSize="26" fontStyle="italic" fill="oklch(0.3 0.08 55)">½</text>
            </g>

            <text x="200" y="160" textAnchor="middle" className="font-heading" fontSize="44" fontWeight="600" fill="oklch(0.6 0.18 50)">+</text>

            <g transform="translate(305 145)">
              <circle r="62" fill="url(#crust)" stroke="oklch(0.45 0.12 45)" strokeWidth="3" />
              <path d="M0 0 L62 0 A62 62 0 0 1 0 62 Z" fill="oklch(0.7 0.19 40)" stroke="oklch(0.38 0.12 35)" strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx="18" cy="18" r="5" fill="oklch(0.55 0.18 25)" />
              <circle cx="30" cy="8" r="4" fill="oklch(0.55 0.18 25)" />
              <text y="95" textAnchor="middle" className="font-heading" fontSize="26" fontStyle="italic" fill="oklch(0.3 0.08 55)">¼</text>
            </g>

            <path d="M200 50 Q 240 70, 260 95" fill="none" stroke="oklch(0.6 0.2 28 / 0.8)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4" />
            <path d="M255 85 L262 96 L250 98" fill="none" stroke="oklch(0.6 0.2 28 / 0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <text x="150" y="42" className="font-heading" fontSize="16" fontStyle="italic" fill="oklch(0.6 0.2 28)">same-size slices!</text>
          </svg>
        </div>

        <p className="mt-3 font-heading text-sm italic leading-snug text-[color:var(--umber)]/80">
          &ldquo;Cut the half into two, and now both pizzas speak the same language&hellip;&rdquo;
        </p>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[color:var(--rule)]/40">
            <div className="h-full w-[30%] rounded-full bg-[color:var(--sunflower-deep)]" />
          </div>
          <span className="font-heading text-[10px] tabular-nums text-[color:var(--umber)]/55">
            0:18 / 0:56
          </span>
        </div>
      </div>

      <span aria-hidden="true" className="absolute -top-3 left-6 h-5 w-16 rotate-[-8deg] rounded-sm bg-[oklch(0.9_0.15_88/0.65)] shadow-[0_2px_4px_oklch(0.3_0.1_55/0.2)]" />
    </div>
  );
}

function LandingPromptComposer() {
  const router = useRouter();
  const { user } = useAuth();
  const setAnimationPlan = useAppStore((s) => s.setAnimationPlan);
  const setLoading = useAppStore((s) => s.setLoading);

  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const onGenerate = async () => {
    if (!selectedPrompt) return;
    setIsWorking(true);

    const toastId = toast.loading("Composing your animation…");

    try {
      const res = await fetch("/api/generate-animation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptText: selectedPrompt }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(data.error || `Generation failed (${res.status}).`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: AnimationPlan | null = null;
      let streamError: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const line = raw.trim();
          if (!line.startsWith("data: ")) continue;

          const event = JSON.parse(line.slice(6));

          switch (event.type) {
            case "result":
              result = {
                title: event.title ?? "Untitled Lesson",
                estimatedDuration: event.estimatedDuration ?? 30,
                steps: event.steps ?? [],
                manimCode: event.manimCode ?? "",
              };
              break;
            case "error":
              streamError = event.error ?? "Unknown stream error";
              break;
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!result) throw new Error("Stream ended without a result.");

      setAnimationPlan(result);
      toast.success("Your animation is ready. Sign in to save it!", { id: toastId });

      window.requestAnimationFrame(() => {
        document.querySelector('[aria-label="Animation preview"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      toast.error(message, { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="font-heading text-4xl font-semibold leading-tight tracking-tight text-[color:var(--umber)] md:text-5xl">
          Try it now
        </h2>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-[color:var(--umber)]/70 md:text-lg">
          Pick a prompt below to see a sample animation. Sign in for full access — custom prompts, worksheet uploads, and more.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(({ word, prompt }) => {
          const isActive = selectedPrompt === prompt;
          return (
            <button
              key={word}
              type="button"
              onClick={() => setSelectedPrompt(prompt)}
              className={`rounded-full px-4 py-2 font-heading text-sm transition-colors ${
                isActive
                  ? "bg-[color:var(--sunflower-deep)] text-white"
                  : "border border-[color:var(--rule)]/40 text-[color:var(--umber)]/70 hover:bg-[color:var(--sunflower)]/20"
              }`}
            >
              {word}
            </button>
          );
        })}
      </div>

      {selectedPrompt && (
        <div className="rounded-xl bg-[oklch(0.97_0.04_85/0.6)] p-4 ring-1 ring-[color:var(--rule)]/40">
          <p className="font-heading text-sm italic leading-relaxed text-[color:var(--umber)]/80">
            &ldquo;{selectedPrompt}&rdquo;
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={!selectedPrompt || isWorking}
        className="text-link mt-2 self-start text-2xl md:text-3xl disabled:opacity-40"
      >
        {isWorking ? (
          <>
            Generating<span aria-hidden="true" className="ml-2 inline-block animate-spin">✶</span>
          </>
        ) : (
          <>
            Generate animation<span aria-hidden="true" className="text-link-arrow"> →</span>
          </>
        )}
      </button>

      {!user && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--sunflower-deep)]/30 bg-[color:var(--sunflower)]/10 px-5 py-4">
          <span className="font-heading text-sm text-[color:var(--umber)]/80">
            Want to create your own?
          </span>
          <Link
            href="/login"
            className="font-heading text-sm font-semibold text-[color:var(--sunflower-deep)] underline-offset-4 hover:underline"
          >
            Sign in for full access →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="bg-paper-grain relative flex-1">
      <div aria-hidden="true" className="bg-sunbeams pointer-events-none absolute inset-0" />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-64 -top-32 size-[42rem] rounded-full bg-[oklch(0.88_0.14_88/0.28)] blur-[140px]" />
        <div className="absolute -right-56 top-1/3 size-[46rem] rounded-full bg-[oklch(0.75_0.15_45/0.14)] blur-[160px]" />
        <div className="absolute left-1/4 -bottom-80 size-[56rem] rounded-full bg-[oklch(0.9_0.13_75/0.22)] blur-[180px]" />
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
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

      <div className="relative mx-auto max-w-6xl px-6 py-16 md:px-12 md:py-24">
        <header className="rise-in mb-16 grid items-center gap-12 md:mb-24 md:grid-cols-[1.05fr_1fr] md:gap-14">
          <div>
            <div className="mb-5 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--umber)]/70">
              <span aria-hidden="true" className="text-base">☼</span>
              <span className="soft-pulse inline-block size-1.5 rounded-full bg-[color:var(--sunflower-deep)]" />
              A studio for K–8 teachers
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
                <span aria-hidden="true">🎬</span> 30–60 second clips
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">🗣</span> narrated, grade-appropriate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">📚</span> classroom-ready
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-[color:var(--sunflower-deep)] px-5 py-2.5 font-heading text-sm font-semibold text-white transition-colors hover:bg-[color:var(--sunflower-deep)]/90"
              >
                Get Started Free
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-[color:var(--rule)]/40 px-5 py-2.5 font-heading text-sm font-semibold text-[color:var(--umber)] transition-colors hover:bg-[color:var(--sunflower)]/20"
              >
                View Pricing
              </Link>
            </div>
          </div>

          <HeroPreview />
        </header>

        <SectionRule label="Try It" />

        <section
          aria-label="Try a sample animation"
          className="rise-in py-10"
          style={{ animationDelay: "120ms" }}
        >
          <LandingPromptComposer />
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

        <p className="mt-2 text-center font-heading text-sm italic text-[color:var(--umber)]/60">
          Made to make hard math feel a little less hard.
        </p>
      </div>
    </main>
  );
}
