import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { PipelineManifest, PipelineMode, PipelineStage, SceneEntry } from "./pipeline/types";

const MEDIA_ROOT =
  process.env.MANIM_MEDIA_ROOT || join(process.cwd(), ".manim-output");
const GALLERY_PATH = join(MEDIA_ROOT, "gallery.json");

export type GalleryEntryStatus =
  | "generating"
  | "awaiting-approval"
  | "building"
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
  writeFileSync(GALLERY_PATH, JSON.stringify(entries, null, 2));
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

export function updateGalleryEntry(
  jobId: string,
  patch: Partial<Omit<GalleryEntry, "jobId" | "id">>,
): GalleryEntry | undefined {
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