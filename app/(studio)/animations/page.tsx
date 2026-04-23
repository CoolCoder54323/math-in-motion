"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GalleryEntryStatus = "generating" | "awaiting-approval" | "building" | "complete" | "failed";

type GalleryEntry = {
  id: string;
  jobId: string;
  title: string;
  conceptText: string;
  mode: "lesson" | "viz";
  durationSeconds: number;
  sceneCount: number;
  sceneBreakdown: { sceneId: string; description: string; mathContent: string; estimatedSeconds: number }[];
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: number;
  status: GalleryEntryStatus;
  currentStage: string | null;
  failedSceneCount?: number;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: GalleryEntryStatus, currentStage: string | null) {
  const map: Record<GalleryEntryStatus, { label: string; bg: string; text: string; pulse: boolean }> = {
    generating: { label: currentStage === "plan" ? "Generating plan" : "Generating", bg: "bg-[oklch(0.88_0.18_88/0.4)]", text: "text-[oklch(0.5_0.14_78)]", pulse: true },
    "awaiting-approval": { label: "Ready to review", bg: "bg-[oklch(0.88_0.14_85/0.4)]", text: "text-[color:var(--sunflower-deep)]", pulse: true },
    building: { label: currentStage === "render" ? "Rendering" : currentStage === "codegen" ? "Writing code" : currentStage === "validate" ? "Validating" : currentStage === "postprocess" ? "Post-processing" : "Building", bg: "bg-[oklch(0.85_0.1_210/0.3)]", text: "text-[oklch(0.5_0.15_240)]", pulse: true },
    complete: { label: "Complete", bg: "bg-oklch(0.62_0.194_149)/25", text: "text-oklch(0.5_0.15_149)", pulse: false },
    failed: { label: "Failed", bg: "bg-[oklch(0.96_0.06_55/0.35)]", text: "text-[color:var(--accent)]", pulse: false },
  };
  const m = map[status] || map.generating;
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-heading text-[10px] font-semibold uppercase tracking-[0.18em] ${m.bg} ${m.text} ring-1 ring-current/20`}>
      <span className={`block size-1.5 rounded-full ${m.pulse ? "soft-pulse bg-current" : "bg-current"}`} />
      {m.label}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animation card                                                      */
/* ------------------------------------------------------------------ */

function AnimationCard({
  entry,
  onClick,
  delay,
  isViewed,
}: {
  entry: GalleryEntry;
  onClick: (entry: GalleryEntry) => void;
  delay: number;
  isViewed: boolean;
}) {
  const isDone = entry.status === "complete";
  const isAwaiting = entry.status === "awaiting-approval";
  const isBuilding = entry.status === "building" || entry.status === "generating";
  const isFailed = entry.status === "failed";

  return (
    <div
      className="rise-in flex flex-col h-full overflow-hidden rounded-xl border border-[oklch(1_0_0/0.08)] bg-[oklch(0.2_0.03_62)] transition-all duration-250 hover:-translate-y-0.5 hover:border-[oklch(1_0_0/0.16)] hover:shadow-[0_16px_40px_-12px_oklch(0_0_0/0.5)]"
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onClick(entry)}
    >
      {/* Thumbnail / status area */}
      <div className="group relative aspect-video overflow-hidden">
        {isDone && (entry.thumbnailUrl || entry.videoUrl) ? (
          <>
            {entry.thumbnailUrl ? (
              <img
                src={entry.thumbnailUrl}
                alt={entry.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <video
                src={entry.videoUrl}
                preload="metadata"
                muted
                playsInline
                className="h-full w-full object-cover"
                onMouseOver={(e) => (e.target as HTMLVideoElement).play()?.catch(() => {})}
                onMouseOut={(e) => {
                  const v = e.target as HTMLVideoElement;
                  v.pause();
                  v.currentTime = 0;
                }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-[oklch(0.08_0.02_55/0.45)] opacity-0 transition-opacity group-hover:opacity-100">
              <div className="flex size-10 items-center justify-center rounded-full bg-[oklch(1_0_0/0.92)] pl-[3px] text-sm opacity-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-100 group-hover:opacity-100" style={{ transform: "scale(0.7)" }}>
                ▶
              </div>
            </div>
            <div className="absolute bottom-1.5 right-2 rounded bg-[oklch(0.08_0.02_55/0.8)] px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-wide text-[oklch(0.94_0.02_85/0.8)]">
              {formatDuration(entry.durationSeconds)}
            </div>
          </>
        ) : isAwaiting ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[oklch(0.15_0.03_60)]">
            <span className="text-3xl">✎</span>
            <span className="font-heading text-sm italic text-[oklch(0.94_0.02_85)]">Plan ready — review &amp; approve</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--sunflower-deep)]/20 px-3 py-1 font-heading text-[11px] font-semibold text-[color:var(--sunflower-deep)]">
              ← Resume
            </span>
          </div>
        ) : isBuilding ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[oklch(0.15_0.03_60)]">
            <div className="sway text-3xl">✦</div>
            <span className="font-heading text-sm italic text-[oklch(0.94_0.02_85)]">
              {entry.status === "generating" ? "Generating…" : "Building…"}
            </span>
          </div>
        ) : isFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[oklch(0.15_0.03_60)]">
            <span className="text-3xl">⚠</span>
            <span className="font-heading text-sm italic text-[oklch(0.65_0.2_25)]">Failed</span>
          </div>
        ) : null}
        <div className="absolute top-1.5 left-2 rounded-full bg-[oklch(0.08_0.02_55/0.7)] px-2 py-0.5 font-heading text-[9px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.94_0.02_85/0.8)]">
          {entry.mode === "viz" ? "quick viz" : "lesson"}
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-rows-[auto_1fr_auto] gap-1.5 p-3.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-heading text-sm font-medium italic tracking-tight text-[oklch(0.94_0.02_85)] leading-tight line-clamp-2 min-h-[2lh]">
            {entry.title}
          </div>
        </div>
        <div className="h-px w-full bg-[oklch(1_0_0/0.08)] my-0.5"></div>
        <div className="font-sans text-[11px] leading-snug text-[oklch(0.6_0.04_75)] line-clamp-2 min-h-[2lh]">
          {entry.conceptText}
        </div>
        <div className="flex flex-nowrap items-center gap-2">
          {!(isDone && isViewed) && statusBadge(entry.status, entry.currentStage)}
          {entry.status === "building" && entry.failedSceneCount && entry.failedSceneCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.96_0.06_55/0.35)] px-2 py-0.5 font-heading text-[10px] font-semibold text-[color:var(--accent)]">
              <span className="block size-1.5 rounded-full bg-[color:var(--accent)]" />
              {entry.failedSceneCount} {entry.failedSceneCount === 1 ? "scene" : "scenes"} need attention
            </span>
          )}
          <span className="min-w-0 truncate font-sans text-[10px] text-[oklch(0.42_0.03_70)]">
            {entry.sceneCount > 0 ? `${entry.sceneCount} ${entry.sceneCount === 1 ? "scene" : "scenes"}` : ""} · {formatDate(entry.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal player                                                        */
/* ------------------------------------------------------------------ */

function Modal({
  entry,
  onClose,
  onDeleted,
}: {
  entry: GalleryEntry | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!entry) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: entry.jobId }),
      });
      onClose();
      onDeleted();
    } catch {
      // Silently fail — the entry may already be gone
      onClose();
      onDeleted();
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (entry && videoRef.current) {
      videoRef.current.load();
    }
  }, [entry]);

  if (!entry) return null;

  const canResume = entry.status === "awaiting-approval" || entry.status === "building" || entry.status === "generating";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[oklch(0.06_0.02_55/0.88)] p-6 backdrop-blur-[10px]"
      style={{ animation: "fade-in 0.25s ease" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[18px] border border-[oklch(1_0_0/0.16)] bg-[oklch(0.17_0.03_60)] shadow-[0_32px_80px_-16px_oklch(0_0_0/0.7)]"
        style={{ animation: "slide-up 0.35s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Video / status area */}
        <div className="relative aspect-video w-full flex-shrink-0 bg-[oklch(0.08_0.02_55)]">
          {entry.status === "complete" && entry.videoUrl ? (
            <video
              ref={videoRef}
              src={entry.videoUrl}
              controls
              autoPlay
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              {statusBadge(entry.status, entry.currentStage)}
              <p className="font-heading text-lg italic text-[oklch(0.94_0.02_85)]">
                {entry.status === "awaiting-approval" ? "Plan ready for review" :
                 entry.status === "building" ? "Building animation…" :
                 entry.status === "generating" ? "Generating…" :
                 "Something went wrong"}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute right-3.5 top-3.5 flex size-8 items-center justify-center rounded-full border-none bg-[oklch(1_0_0/0.1)] text-base text-[oklch(0.94_0.02_85)] transition-colors hover:bg-[oklch(1_0_0/0.18)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 overflow-y-auto p-6">
          <div>
            <div className="font-heading text-2xl font-semibold italic tracking-tight text-[oklch(0.94_0.02_85)] leading-tight">
              {entry.title}
            </div>
            <div className="mt-1 font-sans text-xs text-[oklch(0.42_0.03_70)]">
              {entry.durationSeconds > 0 ? `${formatDuration(entry.durationSeconds)} · ` : ""}{entry.sceneCount} {entry.sceneCount === 1 ? "scene" : "scenes"} · {entry.mode === "viz" ? "Quick Viz" : "Full Lesson"}
            </div>
          </div>

          {entry.conceptText && (
            <div className="font-sans text-[13px] leading-relaxed text-[oklch(0.6_0.04_75)]">
              {entry.conceptText}
            </div>
          )}

          {entry.sceneBreakdown.length > 0 && (
            <div>
              <div className="mb-2 font-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-[oklch(0.42_0.03_70)]">Scenes</div>
              <div className="flex flex-wrap gap-2">
                {entry.sceneBreakdown.map((sc, i) => (
                  <span
                    key={sc.sceneId}
                    className="rounded-full border border-[oklch(1_0_0/0.08)] px-3 py-1 font-heading text-[11px] italic text-[oklch(0.6_0.04_75)]"
                  >
                    {String(i + 1).padStart(2, "0")} · {sc.description.length > 30 ? sc.description.slice(0, 30) + "…" : sc.description}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {canResume && (
              <button
                onClick={() => {
                  router.push(`/workshop?jobId=${entry.jobId}`);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sunflower-deep)] px-5 py-2 font-heading text-[13px] font-semibold text-[oklch(0.22_0.07_55)] transition-colors hover:bg-[oklch(0.65_0.19_75)]"
              >
                {entry.status === "awaiting-approval" ? "Review & Approve" : "Continue Building"} →
              </button>
            )}
            {entry.status === "complete" && entry.videoUrl && (
              <a
                href={entry.videoUrl}
                download={`${entry.title.replace(/[^a-zA-Z0-9]+/g, "-")}.mp4`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(1_0_0/0.16)] bg-transparent px-5 py-2 font-heading text-[13px] text-[oklch(0.6_0.04_75)] transition-colors hover:border-[oklch(1_0_0/0.3)] hover:text-[oklch(0.94_0.02_85)]"
              >
                ↓ Download MP4
              </a>
            )}
            <div className="flex-1" />
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="font-sans text-xs text-[oklch(0.65_0.2_25)]">Delete this animation?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full bg-[oklch(0.96_0.06_55/0.2)] px-3.5 py-1.5 font-heading text-[11px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.65_0.2_25)] transition-colors hover:bg-[oklch(0.96_0.06_55/0.35)] disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-[oklch(1_0_0/0.08)] bg-transparent px-3.5 py-1.5 font-heading text-[11px] uppercase tracking-[0.12em] text-[oklch(0.42_0.03_70)] transition-colors hover:border-[oklch(1_0_0/0.16)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-full border border-[oklch(1_0_0/0.06)] bg-transparent px-3.5 py-1.5 font-heading text-[10px] uppercase tracking-[0.12em] text-[oklch(0.35_0.02_70)] transition-colors hover:border-[oklch(0.65_0.2_25)] hover:text-[oklch(0.65_0.2_25)]"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function AnimationsPage() {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"all" | "lesson" | "viz">("all");
  const [modal, setModal] = useState<GalleryEntry | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("math-in-motion:viewed-entries");
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });

  const markViewed = useCallback((jobId: string) => {
    setViewedIds((prev) => {
      if (prev.has(jobId)) return prev;
      const next = new Set(prev);
      next.add(jobId);
      try {
        localStorage.setItem("math-in-motion:viewed-entries", JSON.stringify(Array.from(next)));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const fetchGallery = useCallback(async () => {
    try {
      const res = await fetch("/api/gallery");
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch {
      // Gallery not available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Auto-refresh to pick up status changes for in-progress entries
  useEffect(() => {
    const hasInProgress = entries.some(e => e.status !== "complete" && e.status !== "failed");
    if (!hasInProgress) return;
    const interval = setInterval(fetchGallery, 5000);
    return () => clearInterval(interval);
  }, [entries, fetchGallery]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch = !q || e.title.toLowerCase().includes(q) || e.conceptText.toLowerCase().includes(q);
      const matchMode = mode === "all" || e.mode === mode;
      return matchSearch && matchMode;
    });
  }, [entries, search, mode]);

  const handleSelect = useCallback((entry: GalleryEntry) => {
    const inProgress = entry.status === "generating" || entry.status === "awaiting-approval" || entry.status === "building";
    if (inProgress) {
      window.location.href = `/workshop?jobId=${entry.jobId}`;
    } else {
      markViewed(entry.jobId);
      setModal(entry);
    }
  }, [markViewed]);

  // Sort: in-progress first, then by date
  const sorted = useMemo(() => {
    const inProgress = filtered.filter(e => e.status !== "complete" && e.status !== "failed");
    const completed = filtered.filter(e => e.status === "complete");
    const failed = filtered.filter(e => e.status === "failed");
    return [...inProgress, ...completed, ...failed];
  }, [filtered]);

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col overflow-hidden bg-[oklch(0.12_0.025_60)] text-[oklch(0.94_0.02_85)]">
      {/* Filter bar */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-[oklch(1_0_0/0.08)] bg-[oklch(0.14_0.025_60/0.8)] px-8 py-4">
        {/* Search */}
        <div className="relative max-w-[380px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[oklch(0.42_0.03_70)]">⌕</span>
          <input
            className="w-full rounded-full border border-[oklch(1_0_0/0.08)] bg-[oklch(0.17_0.03_60)] py-1.5 pl-9 pr-3.5 font-sans text-[13px] text-[oklch(0.94_0.02_85)] outline-none transition-colors placeholder:text-[oklch(0.42_0.03_70)] focus:border-[oklch(0.68_0.18_78)]"
            placeholder="Search animations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Mode filter */}
        {(["all", "lesson", "viz"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full border px-3.5 py-1.5 font-heading text-[11px] tracking-[0.12em] uppercase transition-colors ${
              mode === m
                ? "border-[oklch(0.82_0.17_85/0.5)] bg-[oklch(0.82_0.17_85/0.15)] text-[oklch(0.82_0.17_85)]"
                : "border-[oklch(1_0_0/0.08)] bg-transparent text-[oklch(0.6_0.04_75)] hover:border-[oklch(1_0_0/0.16)] hover:text-[oklch(0.94_0.02_85)]"
            }`}
          >
            {m === "all" ? "All" : m === "lesson" ? "Lessons" : "Quick Viz"}
          </button>
        ))}
      </div>

      {/* Gallery scroll */}
      <div className="flex-1 overflow-y-auto px-8 py-7">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="sway text-4xl">✦</div>
            <div className="font-heading text-lg italic text-[oklch(0.6_0.04_75)]">
              Loading your animations…
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="text-[40px] opacity-30">🎬</div>
            <div className="font-heading text-lg italic text-[oklch(0.6_0.04_75)]">
              No animations yet
            </div>
            <div className="font-sans text-sm text-[oklch(0.42_0.03_70)]">
              Animations you generate will appear here — even while they&apos;re building.
            </div>
            <a
              href="/workshop"
              className="mt-2 rounded-full border-none bg-[oklch(0.68_0.18_78)] px-5 py-2 font-heading text-[13px] font-semibold text-[oklch(0.18_0.05_60)] transition-transform hover:bg-[oklch(0.73_0.18_80)] hover:-translate-y-0.5"
            >
              Create your first animation
            </a>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="text-[40px] opacity-30">∅</div>
            <div className="font-heading text-lg italic text-[oklch(0.6_0.04_75)]">
              No animations match your search
            </div>
            <button
              onClick={() => { setSearch(""); setMode("all"); }}
              className="rounded-full border border-[oklch(1_0_0/0.16)] bg-transparent px-5 py-1.5 font-heading text-[13px] text-[oklch(0.6_0.04_75)]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
            {sorted.map((entry, i) => (
              <AnimationCard
                key={entry.jobId}
                entry={entry}
                onClick={handleSelect}
                delay={i * 40}
                isViewed={viewedIds.has(entry.jobId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && <Modal entry={modal} onClose={() => setModal(null)} onDeleted={fetchGallery} />}
    </div>
  );
}