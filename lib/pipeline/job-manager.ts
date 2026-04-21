import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PipelineManifest, PipelineTiming } from "./types";

const JOB_TTL_MS = 60 * 60 * 1_000; // 1 hour
const MEDIA_ROOT =
  process.env.MANIM_MEDIA_ROOT || join(process.cwd(), ".manim-output");

/* ------------------------------------------------------------------ */
/*  Directory helpers                                                   */
/* ------------------------------------------------------------------ */

export function ensureMediaDir(): string {
  if (!existsSync(MEDIA_ROOT)) mkdirSync(MEDIA_ROOT, { recursive: true });
  return MEDIA_ROOT;
}

export function createJobDir(jobId?: string): { jobId: string; jobDir: string } {
  const id = jobId ?? randomUUID();
  const dir = join(ensureMediaDir(), "jobs", id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "scenes"), { recursive: true });
  mkdirSync(join(dir, "clips"), { recursive: true });
  return { jobId: id, jobDir: dir };
}

export function getJobDir(jobId: string): string | null {
  const dir = join(ensureMediaDir(), "jobs", jobId);
  return existsSync(dir) ? dir : null;
}

/* ------------------------------------------------------------------ */
/*  Manifest persistence                                                */
/* ------------------------------------------------------------------ */

export function writeManifest(jobDir: string, manifest: PipelineManifest): void {
  writeFileSync(join(jobDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export function readManifest(jobDir: string): PipelineManifest | null {
  const p = join(jobDir, "manifest.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as PipelineManifest;
  } catch {
    return null;
  }
}

export function writeTiming(jobDir: string, timing: PipelineTiming): void {
  writeFileSync(join(jobDir, "timing.json"), JSON.stringify(timing, null, 2));
}

export function writePlan(jobDir: string, plan: unknown): void {
  writeFileSync(join(jobDir, "plan.json"), JSON.stringify(plan, null, 2));
}

export function readPlan(jobDir: string): unknown | null {
  const p = join(jobDir, "plan.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function writeConceptText(jobDir: string, conceptText: string): void {
  writeFileSync(join(jobDir, "concept.txt"), conceptText);
}

export function readConceptText(jobDir: string): string | null {
  const p = join(jobDir, "concept.txt");
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Cleanup                                                             */
/* ------------------------------------------------------------------ */

export function cleanupStaleJobs(): void {
  const now = Date.now();
  const jobsRoot = join(ensureMediaDir(), "jobs");
  if (!existsSync(jobsRoot)) return;

  for (const entry of readdirSync(jobsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(jobsRoot, entry.name);
    try {
      const { mtimeMs } = statSync(dirPath);
      if (now - mtimeMs > JOB_TTL_MS) {
        const manifestPath = join(dirPath, "manifest.json");
        if (existsSync(manifestPath)) {
          try {
            const raw = readFileSync(manifestPath, "utf-8");
            const manifest = JSON.parse(raw) as PipelineManifest;
            if (manifest.status === "complete") continue;
          } catch {
            // If we can't read the manifest, proceed with cleanup
          }
        }
        rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // directory may have been removed concurrently
    }
  }

  // Also clean legacy flat mp4 files from old pipeline
  const root = ensureMediaDir();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mp4")) continue;
    try {
      const { mtimeMs } = statSync(join(root, entry.name));
      if (now - mtimeMs > JOB_TTL_MS) {
        rmSync(join(root, entry.name), { force: true });
      }
    } catch {
      // ignore
    }
  }
}
