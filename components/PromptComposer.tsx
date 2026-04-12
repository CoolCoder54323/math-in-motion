"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { useAppStore, type AnimationPlan } from "@/lib/store";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * PromptComposer — unified input for concept + optional worksheet image.
 *
 * Replaces the old two-column UploadZone + ConceptInput layout.
 * One textarea, one optional image attachment, one button.
 *
 * Flow:
 *   1. Teacher types what they want to teach
 *   2. Optionally attaches a worksheet photo
 *   3. Clicks "Generate animation →"
 *   4. If image attached → analyze it first (extract problems) → then generate
 *      If no image → generate directly from prompt text
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

export function PromptComposer() {
  const concept = useAppStore((s) => s.conceptInput);
  const setConcept = useAppStore((s) => s.setConceptInput);
  const file = useAppStore((s) => s.uploadedImage);
  const setFile = useAppStore((s) => s.setUploadedImage);
  const setExtracted = useAppStore((s) => s.setExtracted);
  const setAnimationPlan = useAppStore((s) => s.setAnimationPlan);
  const loading = useAppStore((s) => s.loading);
  const setLoading = useAppStore((s) => s.setLoading);
  const hydrated = useHydrated();

  const isWorking = loading === "ocr" || loading === "plan";

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Manage preview URL lifecycle.
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Global paste handler — ⌘V anywhere drops an image in.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file") {
          const pasted = item.getAsFile();
          if (pasted) {
            setFile(pasted);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [setFile]);

  const handleFile = (selected: File | undefined | null) => {
    if (!selected) return;
    setFile(selected);
    setExtracted(null, null);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const onClearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setExtracted(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setConcept(event.target.value);
  };

  // ── Main action: analyze image (if present) then generate animation ──
  const onGenerate = async () => {
    const trimmed = concept.trim();
    if (!trimmed && !file) return;
    if (isWorking) return;

    const toastId = toast.loading(
      file ? "Analyzing your worksheet…" : "Composing your animation…",
    );

    let latexProblem: string | undefined;

    // Step 1: If image attached, analyze it first.
    if (file) {
      setLoading("ocr");
      setStatusText("Reading your worksheet…");
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          body,
        });
        const data: {
          success: boolean;
          latex?: string;
          text?: string;
          error?: string;
        } = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(
            data.error || `Image analysis failed (${res.status}).`,
          );
        }

        setExtracted(data.latex ?? null, data.text ?? null);
        latexProblem = data.latex || data.text || undefined;
        toast.loading("Worksheet understood — generating animation…", {
          id: toastId,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Image analysis failed.";
        toast.error(message, { id: toastId });
        setLoading(null);
        setStatusText(null);
        return;
      }
    }

    // Step 2: Generate the animation.
    setLoading("plan");
    setStatusText("Composing your animation…");
    try {
      const res = await fetch("/api/generate-animation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptText: trimmed || undefined,
          latexProblem,
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
        estimatedDuration:
          data.estimatedDuration ?? data.plan?.estimatedDuration ?? 30,
        steps: data.steps ?? data.plan?.steps ?? [],
        manimCode: data.manimCode ?? data.plan?.manimCode ?? "",
      });
      toast.success("Your animation is ready.", { id: toastId });

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
      setStatusText(null);
    }
  };

  // ── Drop zone handlers (for the attachment area) ──
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };
  const onZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const trimmedLength = concept.trim().length;
  const hasContent = trimmedLength > 0 || !!file;
  const encouragement = getEncouragement(trimmedLength);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Heading */}
      <div>
        <h2 className="font-heading text-4xl font-semibold leading-tight tracking-tight text-[color:var(--umber)] md:text-5xl">
          What do you want to teach?
        </h2>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-[color:var(--umber)]/70 md:text-lg">
          Describe the concept, attach a worksheet photo, or both — we&rsquo;ll
          animate the intuition behind it.
        </p>
      </div>

      {/* Composition-notebook textarea */}
      <div className="relative">
        <Textarea
          value={concept}
          onChange={onChange}
          placeholder="e.g. 'Show me how to add fractions with unlike denominators' or 'What is the distributive property?'"
          rows={6}
          aria-label="Math concept to animate"
          className="ruled-paper min-h-[168px] resize-none rounded-[8px] border-0 p-0 pt-[0.35rem] pb-[0.35rem] pl-[3.25rem] pr-6 font-heading text-lg leading-7 text-[color:var(--umber)] shadow-[0_12px_30px_-16px_oklch(0.3_0.1_55/0.35)] ring-1 ring-[color:var(--rule)]/60 placeholder:italic placeholder:text-[color:var(--umber)]/45 focus-visible:ring-[color:var(--sunflower-deep)]/70"
        />
        {/* Binder holes */}
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

      {/* Encouragement line */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-[color:var(--umber)]/70">
        <span className="flex items-center gap-1.5 font-heading italic">
          <span aria-hidden="true" className="text-base not-italic">
            {encouragement.emoji}
          </span>
          {encouragement.text}
        </span>
        <span className="tabular-nums">{concept.length}</span>
      </div>

      {/* ── Worksheet attachment ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-[color:var(--rule)]/40" />
          <span className="font-heading text-[11px] uppercase tracking-[0.3em] text-[color:var(--umber)]/50">
            optional worksheet
          </span>
          <span className="h-px flex-1 bg-[color:var(--rule)]/40" />
        </div>

        {file ? (
          /* ── Attached state: compact thumbnail strip ── */
          <div className="flex items-center gap-4 rounded-2xl bg-[oklch(0.94_0.06_82/0.55)] px-5 py-4 ring-1 ring-[color:var(--rule)]/40">
            {previewUrl ? (
              <div className="shrink-0 overflow-hidden rounded-lg shadow-md ring-2 ring-[oklch(0.85_0.18_88/0.4)]">
                <Image
                  src={previewUrl}
                  alt={file.name}
                  width={80}
                  height={56}
                  unoptimized
                  className="h-14 w-auto max-w-[80px] bg-white object-contain"
                />
              </div>
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--sunflower)]/40 text-xl">
                📄
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="block truncate font-heading text-sm italic text-[color:var(--umber)]">
                {file.name}
              </span>
              <span className="text-xs text-[color:var(--umber)]/55">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={onClearImage}
              className="font-heading text-sm italic text-[color:var(--umber)]/60 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
            >
              remove
            </button>
          </div>
        ) : (
          /* ── Empty state: compact drop zone ── */
          <div
            role="button"
            tabIndex={0}
            aria-label="Attach a worksheet image"
            onClick={() => inputRef.current?.click()}
            onKeyDown={onZoneKeyDown}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`ants-border-group group relative cursor-pointer overflow-hidden rounded-2xl outline-none transition-all duration-300 ${
              isDragging ? "scale-[1.01]" : ""
            }`}
            style={{
              backgroundColor: isDragging
                ? "oklch(0.93 0.12 85 / 0.7)"
                : "oklch(0.94 0.06 82 / 0.45)",
            }}
          >
            <svg
              aria-hidden="true"
              className={`ants-border pointer-events-none absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] text-[color:var(--sunflower-deep)] ${
                isDragging ? "is-active" : ""
              }`}
            >
              <rect
                width="100%"
                height="100%"
                rx="14"
                ry="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              />
            </svg>

            <div className="flex items-center justify-center gap-3 px-6 py-6 text-center">
              <span aria-hidden="true" className="text-2xl">
                📎
              </span>
              <span className="font-heading text-base text-[color:var(--umber)]/70 md:text-lg">
                {isDragging
                  ? "Drop it here"
                  : "Attach a worksheet photo"}
              </span>
              <span className="text-xs text-[color:var(--umber)]/50">
                PNG, JPG or{" "}
                <kbd className="inline-block rounded border border-[color:var(--rule)] bg-[color:var(--paper)] px-1 py-0.5 font-mono text-[10px] font-semibold text-[color:var(--umber)]">
                  ⌘V
                </kbd>
              </span>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="sr-only"
          onChange={onInputChange}
        />
      </div>

      {/* Inline prose examples */}
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

      {/* Single generate button */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={hydrated ? !hasContent || isWorking : true}
        className="text-link mt-2 self-start text-2xl md:text-3xl"
      >
        {isWorking ? (
          <>
            {statusText || "Generating"}
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
