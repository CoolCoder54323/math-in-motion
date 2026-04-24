import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import type { PipelineManifest, PipelineMode, PipelineStage, SceneEntry } from "./pipeline/types";
import { readManifest } from "./pipeline/job-manager";

const MEDIA_ROOT =
  process.env.MANIM_MEDIA_ROOT || join(process.cwd(), ".manim-output");
const GALLERY_PATH = join(MEDIA_ROOT, "gallery.json");

export type GalleryEntryStatus =
  | "generating"
  | "awaiting-approval"
  | "building"
  | "paused"
  | "complete"
  | "failed";

export type GalleryEntry = {
  id: string;
  jobId: string;
  title: string;
  conceptText: string;
  mode: PipelineMode;
  durationSeconds: number;
  sceneCount: number;
  sceneBreakdown: SceneEntry[];
  videoUrl: string;
  createdAt: number;
  status: GalleryEntryStatus;
  currentStage: PipelineStage | null;
  updatedAt: number;
};

function readGalleryFile(): GalleryEntry[] {
  if (!existsSync(GALLERY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(GALLERY_PATH, "utf-8")) as GalleryEntry[];
  } catch {
    return [];
  }
}

function writeGalleryFile(entries: GalleryEntry[]): void {
  const tmpPath = `${GALLERY_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2));
  renameSync(tmpPath, GALLERY_PATH);
}

export function getGalleryEntries(): GalleryEntry[] {
  return readGalleryFile().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getGalleryEntry(jobId: string): GalleryEntry | undefined {
  return readGalleryFile().find((e) => e.jobId === jobId);
}

export function initGalleryEntry(
  jobId: string,
  mode: PipelineMode,
  conceptText?: string,
): GalleryEntry {
  const now = Date.now();
  const entry: GalleryEntry = {
    id: jobId,
    jobId,
    title: conceptText ? conceptText.slice(0, 60) : "Untitled",
    conceptText: conceptText ?? "",
    mode,
    durationSeconds: 0,
    sceneCount: 0,
    sceneBreakdown: [],
    videoUrl: `/api/video/${jobId}`,
    createdAt: now,
    status: "generating",
    currentStage: "plan",
    updatedAt: now,
  };

  const entries = readGalleryFile();
  const existingIdx = entries.findIndex((e) => e.jobId === jobId);
  if (existingIdx >= 0) {
    entries[existingIdx] = entry;
  } else {
    entries.push(entry);
  }
  writeGalleryFile(entries);
  return entry;
}

export async function updateGalleryEntry(
  jobId: string,
  patch: Partial<Omit<GalleryEntry, "jobId" | "id">>,
): Promise<GalleryEntry | undefined> {
  const entries = readGalleryFile();
  const idx = entries.findIndex((e) => e.jobId === jobId);
  if (idx < 0) return undefined;
  entries[idx] = { ...entries[idx], ...patch, updatedAt: Date.now() };
  writeGalleryFile(entries);
  return entries[idx];
}

export function saveToGallery(
  jobId: string,
  manifest: PipelineManifest,
  conceptText?: string,
): GalleryEntry {
  const meta = (manifest.finalArtifact?.metadata ?? {}) as Record<string, unknown>;
  const now = Date.now();
  const entry: GalleryEntry = {
    id: jobId,
    jobId,
    title: (meta.title as string) ?? "Untitled",
    conceptText: conceptText ?? "",
    mode: manifest.mode,
    durationSeconds: (meta.durationSeconds as number) ?? 0,
    sceneCount: (meta.sceneBreakdown as SceneEntry[])?.length ?? 0,
    sceneBreakdown: (meta.sceneBreakdown as SceneEntry[]) ?? [],
    videoUrl: `/api/video/${jobId}`,
    createdAt: now,
    status: "complete",
    currentStage: null,
    updatedAt: now,
  };

  const entries = readGalleryFile();
  const existingIdx = entries.findIndex((e) => e.jobId === jobId);
  if (existingIdx >= 0) {
    entry.createdAt = entries[existingIdx].createdAt;
    entries[existingIdx] = entry;
  } else {
    entries.push(entry);
  }
  writeGalleryFile(entries);
  return entry;
}

export function deleteGalleryEntry(jobId: string): boolean {
  const entries = readGalleryFile();
  const idx = entries.findIndex((e) => e.jobId === jobId);
  if (idx < 0) return false;
  entries.splice(idx, 1);
  writeGalleryFile(entries);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Manifest-derived sync                                               */
/* ------------------------------------------------------------------ */

function manifestToGalleryEntry(manifest: PipelineManifest, jobDir: string): GalleryEntry | null {
  const meta = (manifest.finalArtifact?.metadata ?? {}) as Record<string, unknown>;
  const planPath = join(jobDir, "plan.json");
  let title = (meta.title as string) ?? "Untitled";
  let sceneBreakdown: SceneEntry[] = (meta.sceneBreakdown as SceneEntry[]) ?? [];

  try {
    if (existsSync(planPath)) {
      const plan = JSON.parse(readFileSync(planPath, "utf-8")) as { title?: string; sceneBreakdown?: SceneEntry[] };
      if (plan.title) title = plan.title;
      if (plan.sceneBreakdown) sceneBreakdown = plan.sceneBreakdown;
    }
  } catch {
    // ignore
  }

  const statusMap: Record<string, GalleryEntryStatus> = {
    complete: "complete",
    failed: "failed",
    interrupted: "failed",
    paused: "paused",
    "awaiting-approval": "awaiting-approval",
    "awaiting-confirmation": "awaiting-approval",
    running: "generating",
    generating: "generating",
    building: "building",
  };

  return {
    id: manifest.jobId,
    jobId: manifest.jobId,
    title,
    conceptText: "",
    mode: manifest.mode,
    durationSeconds: (meta.durationSeconds as number) ?? 0,
    sceneCount: sceneBreakdown.length,
    sceneBreakdown,
    videoUrl: `/api/video/${manifest.jobId}`,
    createdAt: manifest.createdAt,
    status: statusMap[manifest.status] ?? "generating",
    currentStage: manifest.currentStage ?? (manifest.stages.length > 0 ? manifest.stages[manifest.stages.length - 1].stage : null),
    updatedAt: Date.now(),
  };
}

export function syncGalleryFromManifests(): number {
  const jobsRoot = join(MEDIA_ROOT, "jobs");
  if (!existsSync(jobsRoot)) return 0;

  const entries = readGalleryFile();
  let changed = 0;

  for (const entry of readdirSync(jobsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const jobDir = join(jobsRoot, entry.name);
    const manifest = readManifest(jobDir);
    if (!manifest) continue;

    const rebuilt = manifestToGalleryEntry(manifest, jobDir);
    if (!rebuilt) continue;

    const idx = entries.findIndex((e) => e.jobId === rebuilt.jobId);
    if (idx >= 0) {
      // Only sync if gallery status is stale (e.g. running but manifest says interrupted)
      const current = entries[idx];
      const shouldSync =
        current.status === "generating" && rebuilt.status !== "generating" ||
        current.status === "building" && rebuilt.status !== "building" ||
        rebuilt.status === "complete" && current.status !== "complete";

      if (shouldSync) {
        entries[idx] = { ...current, ...rebuilt, updatedAt: Date.now() };
        changed++;
      }
    }
  }

  if (changed > 0) {
    writeGalleryFile(entries);
  }

  return changed;
}
