import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PipelineManifest, PipelineTiming, PlanOutput } from "./types";
import type { SceneStates } from "@/lib/store";

const JOB_TTL_MS = 60 * 60 * 1_000; // 1 hour
const MEDIA_ROOT =
  process.env.MANIM_MEDIA_ROOT || join(process.cwd(), ".manim-output");

/* ------------------------------------------------------------------ */
/*  Atomic file write helper                                            */
/* ------------------------------------------------------------------ */

function writeAtomic(path: string, data: string): void {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, path);
}

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
  mkdirSync(join(dir, "scene-ir"), { recursive: true });
  mkdirSync(join(dir, "preflight"), { recursive: true });
  mkdirSync(join(dir, "preflight", "keyframes"), { recursive: true });
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
  writeAtomic(join(jobDir, "manifest.json"), JSON.stringify(manifest, null, 2));
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
  writeAtomic(join(jobDir, "timing.json"), JSON.stringify(timing, null, 2));
}

export function readTiming(jobDir: string): PipelineTiming | null {
  const p = join(jobDir, "timing.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as PipelineTiming;
  } catch {
    return null;
  }
}

export function writePlan(jobDir: string, plan: unknown): void {
  writeAtomic(join(jobDir, "plan.json"), JSON.stringify(plan, null, 2));
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
  writeAtomic(join(jobDir, "concept.txt"), conceptText);
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
/*  Scene states persistence                                            */
/* ------------------------------------------------------------------ */

export function writeSceneStates(jobDir: string, states: SceneStates): void {
  writeAtomic(join(jobDir, "scenes.json"), JSON.stringify(states, null, 2));
}

export function readSceneStates(jobDir: string): SceneStates | null {
  const p = join(jobDir, "scenes.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as SceneStates;
  } catch {
    return null;
  }
}

/**
 * Reconstruct scene states by scanning the clips/ directory for mp4 files.
 * Used as a fallback when scenes.json is missing or corrupt.
 * Returns a SceneStates mapping sceneId → "ready" with clipUrl.
 */
export function scanSceneStates(jobDir: string, jobId: string): SceneStates {
  const clipsDir = join(jobDir, "clips");
  const states: SceneStates = {};
  if (!existsSync(clipsDir)) return states;

  try {
    for (const entry of readdirSync(clipsDir)) {
      if (!entry.endsWith(".mp4")) continue;
      const sceneId = entry.replace(/\.mp4$/, "");
      states[sceneId] = {
        status: "ready",
        clipUrl: `/api/video/${jobId}/${sceneId}`,
      };
    }
  } catch {
    // Directory may not exist or be unreadable
  }

  return states;
}

/**
 * Load scene states for a job. Tries scenes.json first, then falls back
 * to scanning the clips/ directory. scenes.json is the authoritative
 * source for durationSeconds because it is updated after every scene
 * render finishes.
 */
export function loadSceneStates(
  jobDir: string,
  jobId: string,
  manifest: PipelineManifest | null,
  plan: PlanOutput | null,
): SceneStates {
  const fromFile = readSceneStates(jobDir);
  if (fromFile && Object.keys(fromFile).length > 0) return fromFile;

  const fromScan = scanSceneStates(jobDir, jobId);
  if (Object.keys(fromScan).length > 0) return fromScan;

  // Last resort: initialize all plan scenes as pending
  if (plan) {
    const states: SceneStates = {};
    for (const scene of plan.sceneBreakdown) {
      states[scene.sceneId] = { status: "pending" };
    }
    return states;
  }

  return {};
}

/* ------------------------------------------------------------------ */
/*  Plan timing history — adaptive estimates                            */
/* ------------------------------------------------------------------ */

type PlanTimingEntry = {
  provider: string;
  model: string;
  durationMs: number;
  promptTokens?: number;
  timestamp: string;
};

type PlanTimingHistory = {
  entries: PlanTimingEntry[];
};

const TIMING_HISTORY_FILE = join(ensureMediaDir(), "plan-timing-history.json");
const DEFAULT_PLAN_ESTIMATES: Record<string, number> = {
  deepseek: 65000,
  anthropic: 15000,
  openai: 10000,
  kimi: 20000,
};
const TIMING_HISTORY_MAX_ENTRIES = 50;

export function loadPlanTimingHistory(): PlanTimingHistory {
  if (!existsSync(TIMING_HISTORY_FILE)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(TIMING_HISTORY_FILE, "utf-8")) as PlanTimingHistory;
  } catch {
    return { entries: [] };
  }
}

export function recordPlanTiming(
  provider: string,
  model: string,
  durationMs: number,
  promptTokens?: number,
): void {
  const history = loadPlanTimingHistory();
  history.entries.push({
    provider,
    model,
    durationMs,
    promptTokens,
    timestamp: new Date().toISOString(),
  });
  if (history.entries.length > TIMING_HISTORY_MAX_ENTRIES) {
    history.entries = history.entries.slice(-TIMING_HISTORY_MAX_ENTRIES);
  }
  try {
    writeAtomic(TIMING_HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch {
    // Non-critical — best-effort persistence
  }
}

export function getPlanEstimate(provider: string, model: string): number {
  const history = loadPlanTimingHistory();
  const recent = history.entries
    .filter((e) => e.provider === provider && e.model === model)
    .slice(-10);

  if (recent.length > 0) {
    const avg = recent.reduce((sum, e) => sum + e.durationMs, 0) / recent.length;
    return Math.round(avg * 1.2);
  }

  return DEFAULT_PLAN_ESTIMATES[provider] ?? 30000;
}

export function deleteJobDir(jobId: string): boolean {
  const dir = getJobDir(jobId);
  if (!dir) return false;
  try {
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Startup recovery: scan for orphaned running jobs                    */
/* ------------------------------------------------------------------ */

export type RecoveryResult = {
  jobId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
};

export function recoverOrphanedJobs(): RecoveryResult[] {
  const results: RecoveryResult[] = [];
  const jobsRoot = join(ensureMediaDir(), "jobs");
  if (!existsSync(jobsRoot)) return results;

  for (const entry of readdirSync(jobsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const jobId = entry.name;
    const jobDir = join(jobsRoot, jobId);
    const manifest = readManifest(jobDir);
    if (!manifest) continue;

    const orphanedStatuses: string[] = ["running", "generating", "building"];
    if (orphanedStatuses.includes(manifest.status)) {
      const previousStatus = manifest.status;
      manifest.status = "interrupted";
      writeManifest(jobDir, manifest);
      const timing = readTiming(jobDir);
      if (timing) {
        writeTiming(jobDir, {
          ...timing,
          completedAt: Date.now(),
          totalMs: Date.now() - timing.startedAt,
          outcome: "interrupted",
          failedStage: manifest.currentStage,
          error: "Server restart — no active controller",
        });
      }
      results.push({ jobId, previousStatus, newStatus: "interrupted", reason: "Server restart — no active controller" });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Process tracking helpers                                            */
/* ------------------------------------------------------------------ */

const PID_FILE = join(ensureMediaDir(), "active-pids.json");

export type TrackedPid = {
  pid: number;
  jobId: string;
  sceneId: string;
  startedAt: number;
};

export function loadTrackedPids(): TrackedPid[] {
  if (!existsSync(PID_FILE)) return [];
  try {
    return JSON.parse(readFileSync(PID_FILE, "utf-8")) as TrackedPid[];
  } catch {
    return [];
  }
}

export function saveTrackedPids(pids: TrackedPid[]): void {
  writeAtomic(PID_FILE, JSON.stringify(pids, null, 2));
}

export function addTrackedPid(pid: number, jobId: string, sceneId: string): void {
  const pids = loadTrackedPids();
  pids.push({ pid, jobId, sceneId, startedAt: Date.now() });
  saveTrackedPids(pids);
}

export function removeTrackedPid(pid: number): void {
  const pids = loadTrackedPids().filter((p) => p.pid !== pid);
  saveTrackedPids(pids);
}

export function killOrphanedPids(): { killed: number; errors: number } {
  const stats = { killed: 0, errors: 0 };
  const pids = loadTrackedPids();
  if (pids.length === 0) return stats;

  for (const tracked of pids) {
    try {
      process.kill(tracked.pid, 0); // Check if process exists
      process.kill(tracked.pid, "SIGTERM");
      stats.killed++;
    } catch {
      // Process already dead
    }
  }

  saveTrackedPids([]);
  return stats;
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
