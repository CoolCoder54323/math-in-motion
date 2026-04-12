"use client";

import { type ChangeEvent } from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { useAppStore, type AnimationPlan } from "@/lib/store";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * ConceptInput — the "Chapter 02" column of the editorial workspace.
 *
 * No card. Follows the same editorial structure as UploadZone:
 *
 *   02  — chapter number, huge and ochre
 *   Or, describe a concept.      (heading)
 *   Tell us what you want to teach and we'll... (description)
 *   [ textarea styled like composition-notebook paper ]
 *   "Not sure where to start? Try fractions, place value, ..." (inline prose
 *     with clickable words — no pill chips)
 *   Generate animation →         (editorial text-link CTA)
 *
 * Delight details:
 *   - Textarea uses the `.ruled-paper` utility to look like a notebook page
 *     with a red margin line and horizontal rules
 *   - Examples live inside a real sentence. Clicking a word pops the prompt
 *     into the textarea. The active word gets a sunflower highlight.
 *   - Helper line and its emoji evolve with the length of the text
 */

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

function getEncouragement(length: number): { emoji: string; text: string } {
  if (length === 0)
    return { emoji: "💭", text: "Start typing — or borrow an example below." };
  if (length < 20)
    return { emoji: "✏️", text: "Keep going. A little more detail goes far." };
  if (length < 80)
    return { emoji: "✨", text: "Nice — plenty to work with here." };
  return { emoji: "🌻", text: "Beautifully put. Ready when you are." };
}

export function ConceptInput() {
  const concept = useAppStore((s) => s.conceptInput);
  const setConcept = useAppStore((s) => s.setConceptInput);
  const extractedLatex = useAppStore((s) => s.extractedLatex);
  const extractedText = useAppStore((s) => s.extractedText);
  const setAnimationPlan = useAppStore((s) => s.setAnimationPlan);
  const loading = useAppStore((s) => s.loading);
  const setLoading = useAppStore((s) => s.setLoading);
  const hydrated = useHydrated();

  const isGenerating = loading === "plan";

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setConcept(event.target.value);
  };

  const onGenerate = async () => {
    const trimmed = concept.trim();
    if (!trimmed && !extractedLatex && !extractedText) return;
    if (isGenerating) return;

    setLoading("plan");
    const toastId = toast.loading("Composing your animation plan…");
    try {
      const res = await fetch("/api/generate-animation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptText: trimmed,
          latexProblem: extractedLatex || extractedText || undefined,
        }),
      });
      const data: {
        success: boolean;
        title?: string;
        estimatedDuration?: number;
        steps?: { label: string; narration: string }[];
        manimCode?: string;
        plan?: AnimationPlan;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Generation failed (${res.status}).`);
      }

      setAnimationPlan({
        title: data.title ?? data.plan?.title ?? "Untitled Lesson",
        estimatedDuration: data.estimatedDuration ?? data.plan?.estimatedDuration ?? 30,
        steps: data.steps ?? data.plan?.steps ?? [],
        manimCode: data.manimCode ?? data.plan?.manimCode ?? "",
      });
      toast.success("Your animation plan has bloomed.", { id: toastId });

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          document
            .querySelector('[aria-label="Animation preview"]')
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Generation failed.";
      toast.error(message, { id: toastId });
    } finally {
      setLoading(null);
    }
  };

  const trimmedLength = concept.trim().length;
  const hasContent = trimmedLength > 0;
  const encouragement = getEncouragement(trimmedLength);

  return (
    <div className="flex flex-col gap-6">
      {/* Chapter number + heading. */}
      <div>
        <div className="flex items-baseline gap-4">
          <span
            aria-hidden="true"
            className="font-heading text-7xl font-semibold italic leading-none text-[color:var(--accent)] md:text-8xl"
          >
            02
          </span>
          <span className="h-[2px] flex-1 bg-[color:var(--rule)]" />
        </div>
        <h2 className="mt-5 font-heading text-4xl font-semibold leading-tight tracking-tight text-[color:var(--umber)] md:text-5xl">
          Or, describe a concept.
        </h2>
        <p className="mt-3 max-w-md text-base leading-relaxed text-[color:var(--umber)]/70 md:text-lg">
          Tell us what you want to teach and we&rsquo;ll animate the intuition
          behind it.
        </p>
      </div>

      {/* Composition-notebook textarea. */}
      <div className="relative">
        <Textarea
          value={concept}
          onChange={onChange}
          placeholder="e.g. 'Show me how to add fractions with unlike denominators' or 'What is the distributive property?'"
          rows={8}
          aria-label="Math concept to animate"
          className="ruled-paper min-h-[224px] resize-none rounded-[8px] border-0 p-0 pt-[0.35rem] pb-[0.35rem] pl-[3.25rem] pr-6 font-heading text-lg leading-7 text-[color:var(--umber)] shadow-[0_12px_30px_-16px_oklch(0.3_0.1_55/0.35)] ring-1 ring-[color:var(--rule)]/60 placeholder:italic placeholder:text-[color:var(--umber)]/45 focus-visible:ring-[color:var(--sunflower-deep)]/70"
        />
        {/* A binder hole in the top-left corner for extra notebook charm. */}
        <span
          aria-hidden="true"
          className="absolute left-[1rem] top-[1rem] block size-3 rounded-full bg-[color:var(--paper-warm)] shadow-[inset_0_1px_2px_oklch(0.3_0.1_55/0.3)]"
        />
        <span
          aria-hidden="true"
          className="absolute left-[1rem] top-[3.25rem] block size-3 rounded-full bg-[color:var(--paper-warm)] shadow-[inset_0_1px_2px_oklch(0.3_0.1_55/0.3)]"
        />
        <span
          aria-hidden="true"
          className="absolute left-[1rem] bottom-[1rem] block size-3 rounded-full bg-[color:var(--paper-warm)] shadow-[inset_0_1px_2px_oklch(0.3_0.1_55/0.3)]"
        />
      </div>

      {/* Encouragement line — the mood emoji evolves with the text. */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-[color:var(--umber)]/70">
        <span className="flex items-center gap-1.5 font-heading italic">
          <span aria-hidden="true" className="text-base not-italic">
            {encouragement.emoji}
          </span>
          {encouragement.text}
        </span>
        <span className="tabular-nums">{concept.length}</span>
      </div>

      {/* Inline prose examples — not pills, actually part of a sentence. */}
      <p className="text-base leading-relaxed text-[color:var(--umber)]/80 md:text-lg">
        Not sure where to start? Try{" "}
        {EXAMPLES.map(({ word, prompt }, i) => {
          const isActive = concept === prompt;
          const isLast = i === EXAMPLES.length - 1;
          const isPenultimate = i === EXAMPLES.length - 2;
          return (
            <span key={word}>
              <button
                type="button"
                onClick={() => setConcept(prompt)}
                className={`prose-link font-heading italic ${
                  isActive ? "is-active" : ""
                }`}
              >
                {word}
              </button>
              {isLast ? "." : isPenultimate ? ", or " : ", "}
            </span>
          );
        })}
      </p>

      {/* Editorial text-link CTA. */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={hydrated ? (!hasContent && !extractedLatex && !extractedText) || isGenerating : true}
        className="text-link mt-2 self-start text-2xl md:text-3xl"
      >
        {isGenerating ? (
          <>
            Generating
            <span aria-hidden="true" className="ml-2 inline-block animate-spin">
              ✶
            </span>
          </>
        ) : (
          <>
            Generate animation
            <span aria-hidden="true" className="text-link-arrow">
              →
            </span>
          </>
        )}
      </button>
    </div>
  );
}
