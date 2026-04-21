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
import { useAppStore } from "@/lib/store";
import type { PipelineStage, ValidationIssue } from "@/lib/pipeline/types";
import { useHydrated } from "@/hooks/useHydrated";
import { useTimedProgress } from "@/hooks/useTimedProgress";

/**
 * PromptComposer — unified input for concept + optional worksheet image.
 *
 * One textarea, one optional image attachment, one button.
 *
 * Flow:
 *   1. Teacher types what they want to teach
 *   2. Optionally attaches a worksheet photo
 *   3. Clicks "Generate lesson plan"
 *   4. If image attached → analyze it first (extract problems) → then pipeline
 *      If no image → pipeline directly from prompt text
 *   5. SSE events from /api/pipeline are piped into the store so the
 *      Workshop can transition through approval → build → done phases.
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
  const loading = useAppStore((s) => s.loading);
  const setLoading = useAppStore((s) => s.setLoading);
  const hydrated = useHydrated();

  // Pipeline state setters
  const setPipelineJobId = useAppStore((s) => s.setPipelineJobId);
  const setLivePlan = useAppStore((s) => s.setLivePlan);
  const setPlanApprovalPending = useAppStore((s) => s.setPlanApprovalPending);
  const setCurrentStage = useAppStore((s) => s.setCurrentStage);
  const updatePipelineStage = useAppStore((s) => s.updatePipelineStage);
  const setSceneState = useAppStore((s) => s.setSceneState);
  const initSceneStatesFromPlan = useAppStore((s) => s.initSceneStatesFromPlan);
  const addLiveClip = useAppStore((s) => s.addLiveClip);
  const setVideoUrl = useAppStore((s) => s.setVideoUrl);
  const setValidationReport = useAppStore((s) => s.setValidationReport);
  const setStreamingTitle = useAppStore((s) => s.setStreamingTitle);
  const resetPipeline = useAppStore((s) => s.resetPipeline);
  const setPipelineMode = useAppStore((s) => s.setPipelineMode);

  const isWorking = loading === "ocr" || loading === "plan" || loading === "pipeline";

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

  // ── Main action: analyze image (if present) then start pipeline ──
  const onGenerate = async () => {
    const trimmed = concept.trim();
    if (!trimmed && !file) return;
    if (isWorking) return;

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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Image analysis failed.";
        toast.error(message);
        setLoading(null);
        setStatusText(null);
        return;
      }
    }

    // Step 2: Start the pipeline via SSE.
    setLoading("pipeline");
    setStatusText("Starting your lesson…");
    resetPipeline();
    setPipelineMode("lesson");

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptText: trimmed || undefined,
          latexProblem,
          mode: "lesson",
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(data.error || `Pipeline failed (${res.status}).`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (event.type) {
            case "pipeline-started":
              setPipelineJobId(event.jobId as string);
              setStatusText("Generating lesson plan…");
              break;

            case "stage-start":
              setCurrentStage(event.stage as PipelineStage);
              updatePipelineStage(event.stage as PipelineStage, { status: "running", progress: 0, message: "" });
              setStatusText(
                event.stage === "plan" ? "Planning your lesson…"
                  : event.stage === "codegen" ? "Writing animation code…"
                  : event.stage === "validate" ? "Validating scenes…"
                  : event.stage === "render" ? "Rendering animation…"
                  : event.stage === "postprocess" ? "Post-processing…"
                  : event.stage === "compose" ? "Composing final video…"
                  : "Working…",
              );
              break;

            case "stage-progress":
              updatePipelineStage(event.stage as PipelineStage, {
                progress: event.progress as number,
                message: event.message as string,
              });
              break;

            case "stage-complete":
              updatePipelineStage(event.stage as PipelineStage, {
                status: (event.result as { status: string })?.status === "skipped" ? "skipped" : "success",
                progress: 100,
              });
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
              setLivePlan(planOutput);
              initSceneStatesFromPlan(planOutput);
              setStreamingTitle(planOutput.title);
              setPlanApprovalPending(event.type === "plan-awaiting-approval");
              setStatusText("Review your lesson plan");
              // We keep loading="pipeline" so the Workshop phase logic works
              break;
            }

            case "scene-generating":
              setSceneState(event.sceneId as string, { status: "generating" });
              break;

            case "scene-ready": {
              setSceneState(event.sceneId as string, {
                status: "ready",
                clipUrl: event.clipUrl as string,
                durationSeconds: event.durationSeconds as number,
              });
              addLiveClip({
                sceneId: event.sceneId as string,
                clipUrl: event.clipUrl as string,
              });
              break;
            }

            case "scene-failed":
              setSceneState(event.sceneId as string, {
                status: "failed",
                error: event.error as string,
              });
              break;

            case "scene-regenerating":
              setSceneState(event.sceneId as string, { status: "regenerating" });
              break;

            case "scene-rendered":
              // scene-rendered is a subset of scene-ready info; skip if we already have it
              break;

            case "validation-report":
              setValidationReport({
                scenes: event.scenes as number,
                passed: event.passed as number,
                issues: (event.issues as ValidationIssue[]) ?? [],
              });
              break;

            case "pipeline-complete": {
              const manifest = event.manifest as Record<string, unknown>;
              const artifact = manifest.finalArtifact as Record<string, unknown> | undefined;
              if (artifact && artifact.path) {
                const videoUrl = `/api/video/${manifest.jobId}/final.mp4`;
                setVideoUrl(videoUrl);
              }
              setLoading(null);
              setStatusText(null);
              toast.success("Your lesson is ready!");
              break;
            }

            case "pipeline-error":
              setLoading(null);
              setStatusText(null);
              toast.error((event.error as string) || "Pipeline failed.");
              break;
          }
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Pipeline failed.";
      toast.error(message);
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

  const planProgress = useTimedProgress(loading === "plan", 37_000);
  const pipelineProgress = useTimedProgress(loading === "pipeline", 300_000);
  const activeProgress = loading === "plan" ? planProgress : loading === "pipeline" ? pipelineProgress : 0;

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

      {/* Single generate button / progress bar */}
      {isWorking ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="progress-bar-track relative mt-2.5 h-3 w-full overflow-visible rounded-full bg-[oklch(0.94_0.03_80)]">
            <div
              className="progress-bar-fill h-full rounded-full transition-[width] duration-600 ease-out"
              style={{ width: `${activeProgress}%` }}
            >
              <span className="progress-bar-marker" aria-hidden="true">✎</span>
            </div>
          </div>
          <p className="font-heading text-sm italic text-[color:var(--umber)]/55">
            {statusText || "Generating"}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={hydrated ? !hasContent : true}
          className="mt-2 inline-flex items-center gap-2 self-start rounded-full bg-[color:var(--sunflower-deep)] px-[22px] py-[10px] font-heading text-[15px] font-semibold text-[oklch(0.22_0.07_55)] shadow-[0_4px_16px_-4px_oklch(0.7_0.18_75/0.4)] transition-all duration-200 hover:bg-[oklch(0.65_0.19_75)] hover:-translate-y-[1px] hover:shadow-[0_6px_20px_-4px_oklch(0.7_0.18_75/0.5)] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
        >
          <span aria-hidden="true">✦</span> Generate lesson plan
        </button>
      )}
    </div>
  );
}
