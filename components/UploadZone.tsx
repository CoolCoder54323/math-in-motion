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

import { useAppStore } from "@/lib/store";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * UploadZone — the "Chapter 01" column of the editorial workspace.
 *
 * No containing Card. The section reads top-to-bottom like a magazine column:
 *
 *   01  — chapter number, huge and ochre
 *   Upload a worksheet problem   (heading)
 *   Snap a photo, or drop one... (description)
 *   [ hand-drawn dashed drop zone with sunflower doodle ]
 *   Analyze problem →            (editorial text-link CTA)
 *
 * Delight details:
 *   - A real SVG "marching ants" dashed border that runs on hover/focus
 *   - A hand-drawn sunflower + bee SVG sits inside the empty drop zone and
 *     sways gently
 *   - Paste-from-clipboard anywhere on the page (⌘V) lands here
 *   - A live thumbnail preview replaces the doodle when a file is selected
 *   - Filename appears written in italic serif, like an editor's caption
 */
export function UploadZone() {
  const file = useAppStore((s) => s.uploadedImage);
  const setFile = useAppStore((s) => s.setUploadedImage);
  const setExtracted = useAppStore((s) => s.setExtracted);
  const loading = useAppStore((s) => s.loading);
  const setLoading = useAppStore((s) => s.setLoading);
  const extractedText = useAppStore((s) => s.extractedText);
  const extractedLatex = useAppStore((s) => s.extractedLatex);
  const hydrated = useHydrated();

  const isAnalyzing = loading === "ocr";

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [justPasted, setJustPasted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Manage object-URL lifecycle for the preview thumbnail.
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Global paste handler so a teacher can screenshot a problem and hit ⌘V
  // anywhere on the page to drop it straight into the zone.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file") {
          const pasted = item.getAsFile();
          if (pasted) {
            setFile(pasted);
            setJustPasted(true);
            window.setTimeout(() => setJustPasted(false), 1400);
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

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const onZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const onAnalyze = async () => {
    if (!file || isAnalyzing) return;
    setLoading("ocr");
    const toastId = toast.loading("Looking at your worksheet…");
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
      toast.success("We understood it — describe the lesson below.", {
        id: toastId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Image analysis failed.";
      toast.error(message, { id: toastId });
    } finally {
      setLoading(null);
    }
  };

  const onClear = () => {
    setFile(null);
    setExtracted(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const active = isDragging || justPasted;

  return (
    <div className="flex flex-col gap-6">
      {/* Chapter number + heading, editorial style. */}
      <div>
        <div className="flex items-baseline gap-4">
          <span
            aria-hidden="true"
            className="font-heading text-7xl font-semibold italic leading-none text-[color:var(--sunflower-deep)] md:text-8xl"
          >
            01
          </span>
          <span className="h-[2px] flex-1 bg-[color:var(--rule)]" />
        </div>
        <h2 className="mt-5 font-heading text-4xl font-semibold leading-tight tracking-tight text-[color:var(--umber)] md:text-5xl">
          Upload a worksheet problem.
        </h2>
        <p className="mt-3 max-w-md text-base leading-relaxed text-[color:var(--umber)]/70 md:text-lg">
          Snap a photo, drop an image, or paste a screenshot — we&rsquo;ll take
          it from there.
        </p>
      </div>

      {/* Drop zone. No card, no shadcn primitive — just a div with a hand-
          drawn SVG dashed border and a doodle inside. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a math problem image"
        onClick={() => inputRef.current?.click()}
        onKeyDown={onZoneKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`ants-border-group group relative cursor-pointer overflow-hidden rounded-[28px] outline-none transition-all duration-300 ${
          active ? "scale-[1.01]" : ""
        }`}
        style={{
          backgroundColor: active
            ? "oklch(0.93 0.12 85 / 0.7)"
            : "oklch(0.94 0.06 82 / 0.55)",
        }}
      >
        {/* Marching-ants SVG border sits on top of the zone and runs on hover. */}
        <svg
          aria-hidden="true"
          className={`ants-border pointer-events-none absolute inset-1.5 h-[calc(100%-12px)] w-[calc(100%-12px)] text-[color:var(--sunflower-deep)] ${
            active ? "is-active" : ""
          }`}
        >
          <rect
            width="100%"
            height="100%"
            rx="22"
            ry="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </svg>

        {/* Hidden native file input. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="sr-only"
          onChange={onInputChange}
        />

        <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 p-10 text-center">
          {file ? (
            // ─── Selected state: thumbnail + caption + remove ───
            <>
              {previewUrl ? (
                <div className="relative overflow-hidden rounded-lg shadow-[0_12px_30px_-10px_oklch(0.3_0.1_55/0.4)] ring-4 ring-[oklch(0.85_0.18_88/0.4)]">
                  <Image
                    src={previewUrl}
                    alt={file.name}
                    width={260}
                    height={180}
                    unoptimized
                    className="h-44 w-auto max-w-full bg-white object-contain"
                  />
                </div>
              ) : (
                <div className="flex size-20 items-center justify-center rounded-full bg-[color:var(--sunflower)]/40 text-4xl">
                  📄
                </div>
              )}
              <figcaption className="flex flex-col items-center gap-1">
                <span className="font-heading text-lg italic text-[color:var(--umber)]">
                  &ldquo;{file.name}&rdquo;
                </span>
                <span className="text-xs text-[color:var(--umber)]/55">
                  {(file.size / 1024).toFixed(1)} KB &middot; click anywhere to
                  replace
                </span>
              </figcaption>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="font-heading text-sm italic text-[color:var(--umber)]/60 underline-offset-4 hover:text-[color:var(--accent)] hover:underline"
              >
                remove
              </button>
            </>
          ) : (
            // ─── Empty state: hand-drawn sunflower doodle + invitation ───
            <>
              <SunflowerDoodle />
              <p className="mt-2 font-heading text-2xl font-medium leading-snug text-[color:var(--umber)] md:text-3xl">
                {active
                  ? justPasted
                    ? "pasted! ✶"
                    : "drop it anywhere on the sun"
                  : "drag a worksheet in here"}
              </p>
              <p className="text-sm text-[color:var(--umber)]/65">
                PNG, JPG — or paste a screenshot with{" "}
                <kbd className="inline-block rounded border border-[color:var(--rule)] bg-[color:var(--paper)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[color:var(--umber)]">
                  ⌘V
                </kbd>
                .
              </p>
            </>
          )}
        </div>
      </div>

      {/* Editorial text-link CTA. Not a pill, not a card button. */}
      <button
        type="button"
        onClick={onAnalyze}
        disabled={hydrated ? !file || isAnalyzing : true}
        className="text-link mt-2 self-start text-2xl md:text-3xl"
      >
        {isAnalyzing ? (
          <>
            Analyzing
            <span aria-hidden="true" className="ml-2 inline-block animate-spin">
              ✶
            </span>
          </>
        ) : (
          <>
            Analyze problem
            <span aria-hidden="true" className="text-link-arrow">
              →
            </span>
          </>
        )}
      </button>

      {/* Extracted snippet — shows up after a successful OCR so the teacher
          can double-check before generating. */}
      {(extractedLatex || extractedText) && !isAnalyzing && (
        <div className="rounded-xl bg-[oklch(0.96_0.04_85/0.7)] p-4 font-mono text-xs leading-relaxed text-[color:var(--umber)]/80 ring-1 ring-[color:var(--rule)]/50">
          <div className="mb-1 font-heading text-[11px] uppercase tracking-[0.28em] text-[color:var(--umber)]/60">
            extracted
          </div>
          <pre className="whitespace-pre-wrap break-words">
            {extractedText || extractedLatex}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * A hand-drawn SVG sunflower + little bee. Pure vector, all warm sunflower
 * colors. Sways gently via the `.sway` utility class on the group. Not
 * imported from an icon set — drawn inline so it feels specific to this app.
 */
function SunflowerDoodle() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 160"
      className="sway size-28 md:size-32"
    >
      {/* petals */}
      <g
        fill="oklch(0.82 0.17 85)"
        stroke="oklch(0.4 0.1 60)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      >
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 360) / 12;
          return (
            <ellipse
              key={i}
              cx="80"
              cy="32"
              rx="10"
              ry="26"
              transform={`rotate(${angle} 80 80)`}
            />
          );
        })}
      </g>
      {/* inner petals (darker, staggered) */}
      <g
        fill="oklch(0.7 0.18 72)"
        stroke="oklch(0.35 0.1 55)"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 360) / 12 + 15;
          return (
            <ellipse
              key={i}
              cx="80"
              cy="46"
              rx="7"
              ry="18"
              transform={`rotate(${angle} 80 80)`}
            />
          );
        })}
      </g>
      {/* seed disk */}
      <circle
        cx="80"
        cy="80"
        r="22"
        fill="oklch(0.35 0.08 55)"
        stroke="oklch(0.22 0.06 50)"
        strokeWidth="2.5"
      />
      {/* seed dots */}
      <g fill="oklch(0.2 0.05 50)">
        <circle cx="74" cy="74" r="1.6" />
        <circle cx="82" cy="72" r="1.6" />
        <circle cx="88" cy="78" r="1.6" />
        <circle cx="85" cy="86" r="1.6" />
        <circle cx="77" cy="88" r="1.6" />
        <circle cx="72" cy="82" r="1.6" />
        <circle cx="80" cy="80" r="1.6" />
      </g>
      {/* stem */}
      <path
        d="M80 102 Q 76 125, 82 150"
        fill="none"
        stroke="oklch(0.45 0.12 135)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* leaf */}
      <path
        d="M80 125 Q 95 115, 108 125 Q 98 135, 80 132 Z"
        fill="oklch(0.6 0.15 135)"
        stroke="oklch(0.35 0.1 135)"
        strokeWidth="2"
      />
    </svg>
  );
}
