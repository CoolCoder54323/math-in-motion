import { NextRequest, NextResponse } from "next/server";
import { listControllers } from "@/lib/pipeline/executor";
import { getGalleryEntries } from "@/lib/gallery";
import {
  ensureMediaDir,
  getJobDir,
  readManifest,
  readPlan,
  readSceneStates,
  readTiming,
  loadPlanTimingHistory,
} from "@/lib/pipeline/job-manager";
import type { PipelineTiming } from "@/lib/pipeline/types";
import type { SceneStates } from "@/lib/store";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

const STATUS_CACHE_TTL_MS = 2_000;

let statusCache:
  | {
      expiresAt: number;
      payload: unknown;
    }
  | null = null;

function isAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const expected = process.env.ADMIN_STATUS_TOKEN;
  if (!expected) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-admin-token");
  const queryToken = request.nextUrl.searchParams.get("token");
  return bearer === expected || headerToken === expected || queryToken === expected;
}

function getDiskUsage(dir: string): { size: number; fileCount: number } {
  if (!existsSync(dir)) return { size: 0, fileCount: 0 };
  let size = 0;
  let fileCount = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) {
        const sub = getDiskUsage(p);
        size += sub.size;
        fileCount += sub.fileCount;
      } else {
        size += s.size;
        fileCount += 1;
      }
    }
  } catch {
    // ignore
  }
  return { size, fileCount };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function countNormalizationWarnings(jobDir: string): number {
  const sceneIrDir = join(jobDir, "scene-ir");
  if (!existsSync(sceneIrDir)) return 0;
  let count = 0;
  try {
    for (const file of readdirSync(sceneIrDir)) {
      if (!file.endsWith(".normalized.json")) continue;
      const parsed = JSON.parse(readFileSync(join(sceneIrDir, file), "utf-8")) as {
        normalizationIssues?: { severity?: string }[];
      };
      count += (parsed.normalizationIssues ?? []).filter((issue) => issue.severity !== "info").length;
    }
  } catch {
    return count;
  }
  return count;
}

type TokenAggregate = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUSD: number;
  sceneCount: number;
};

function zeroTokens(): TokenAggregate {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, estimatedCostUSD: 0, sceneCount: 0 };
}

function addTokens(a: TokenAggregate, b: TokenAggregate): TokenAggregate {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    estimatedCostUSD: a.estimatedCostUSD + b.estimatedCostUSD,
    sceneCount: a.sceneCount + b.sceneCount,
  };
}

function tokensFromSceneStates(states: SceneStates | null): TokenAggregate {
  const agg = zeroTokens();
  if (!states) return agg;
  for (const state of Object.values(states)) {
    agg.sceneCount += 1;
    agg.inputTokens += state.inputTokens ?? 0;
    agg.outputTokens += state.outputTokens ?? 0;
    agg.cachedTokens += state.cachedTokens ?? 0;
    agg.estimatedCostUSD += state.estimatedCostUSD ?? 0;
  }
  return agg;
}

function tokensFromTiming(timing: PipelineTiming | null): TokenAggregate {
  const agg = zeroTokens();
  if (!timing) return agg;
  agg.estimatedCostUSD = timing.totalEstimatedCostUSD ?? 0;
  for (const stage of timing.stages ?? []) {
    const tu = stage.tokenUsage;
    if (tu) {
      agg.inputTokens += tu.inputTokens ?? 0;
      agg.outputTokens += tu.outputTokens ?? 0;
      agg.cachedTokens += tu.cachedTokens ?? 0;
    }
    for (const st of stage.sceneTimings ?? []) {
      const sTu = st.tokenUsage;
      if (sTu) {
        agg.sceneCount += 1;
      }
    }
  }
  return agg;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = Date.now();
  if (statusCache && statusCache.expiresAt > now) {
    return NextResponse.json(statusCache.payload);
  }

  const active = listControllers().map(({ jobId, controller }) => ({
    jobId,
    currentStage: controller.ctx.manifest.currentStage ?? null,
    status: controller.ctx.manifest.status,
    autoContinue: controller.autoContinue,
    subscriberCount: controller.subscribers.length,
    regenerateQueueLength: controller.regenerateQueue.length,
    regenerateInFlight: Array.from(controller.regenerateInFlight),
    sceneStateCount: Object.keys(controller.sceneStates).length,
    hasCurrentSceneAbort: controller.currentSceneAbort !== null,
    hasPausePromise: controller.pausePromise !== null,
    hasApprovalPromise: controller.approvePlan !== null,
    lastApprovalHeartbeat: controller.lastApprovalHeartbeat,
  }));

  const gallery = getGalleryEntries().map((e) => ({
    jobId: e.jobId,
    title: e.title,
    status: e.status,
    currentStage: e.currentStage,
    mode: e.mode,
    sceneCount: e.sceneCount,
    durationSeconds: e.durationSeconds,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));

  const mediaRoot = ensureMediaDir();
  const jobsRoot = join(mediaRoot, "jobs");

  const jobDirs: {
    jobId: string;
    exists: boolean;
    manifestStatus: string | null;
    planTitle: string | null;
    sceneStateCount: number;
    clipsCount: number;
    diskUsage: string;
    tokens: TokenAggregate;
    timing: {
      outcome: PipelineTiming["outcome"];
      totalMs: number;
      failedStage?: PipelineTiming["failedStage"];
      failureLayer?: PipelineTiming["failureLayer"];
      failureCode?: PipelineTiming["failureCode"];
    } | null;
    normalizationWarnings: number;
  }[] = [];

  let totalTokens = zeroTokens();
  const providerBreakdown: Record<string, TokenAggregate> = {};

  if (existsSync(jobsRoot)) {
    for (const jobId of readdirSync(jobsRoot)) {
      const jobDir = getJobDir(jobId);
      if (!jobDir) continue;
      const manifest = readManifest(jobDir);
      const plan = readPlan(jobDir);
      const states = readSceneStates(jobDir);
      const timing = readTiming(jobDir);

      const clipsDir = join(jobDir, "clips");
      let clipsCount = 0;
      if (existsSync(clipsDir)) {
        try {
          clipsCount = readdirSync(clipsDir).filter((f) => f.endsWith(".mp4")).length;
        } catch {}
      }

      // Prefer timing.json aggregate, fallback to scene states
      let tokens = tokensFromTiming(timing);
      if (tokens.estimatedCostUSD === 0 && tokens.inputTokens === 0) {
        tokens = tokensFromSceneStates(states);
      }

      totalTokens = addTokens(totalTokens, tokens);

      // Provider breakdown from timing
      if (timing) {
        for (const stage of timing.stages ?? []) {
          const tu = stage.tokenUsage;
          if (tu) {
            const key = stage.llmProvider && stage.llmModel
              ? `${stage.llmProvider}/${stage.llmModel}`
              : "unknown";
            if (!providerBreakdown[key]) providerBreakdown[key] = zeroTokens();
            providerBreakdown[key].inputTokens += tu.inputTokens ?? 0;
            providerBreakdown[key].outputTokens += tu.outputTokens ?? 0;
            providerBreakdown[key].cachedTokens += tu.cachedTokens ?? 0;
            providerBreakdown[key].estimatedCostUSD += tu.estimatedCostUSD ?? 0;
            providerBreakdown[key].sceneCount += stage.sceneTimings?.length ?? 1;
          }
        }
      }

      jobDirs.push({
        jobId,
        exists: true,
        manifestStatus: manifest?.status ?? null,
        planTitle: (plan as { title?: string } | null)?.title ?? null,
        sceneStateCount: states ? Object.keys(states).length : 0,
        clipsCount,
        diskUsage: formatBytes(getDiskUsage(jobDir).size),
        tokens,
        normalizationWarnings: countNormalizationWarnings(jobDir),
        timing: timing
          ? {
              outcome: timing.outcome,
              totalMs: timing.totalMs,
              failedStage: timing.failedStage,
              failureLayer: timing.failureLayer,
              failureCode: timing.failureCode,
            }
          : null,
      });
    }
  }

  const totalDisk = getDiskUsage(mediaRoot);
  const timingHistory = loadPlanTimingHistory();

  const payload = {
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
    activeControllers: active,
    gallery,
    jobDirectories: jobDirs,
    tokens: {
      total: totalTokens,
      providerBreakdown,
    },
    disk: {
      mediaRoot,
      totalSize: formatBytes(totalDisk.size),
      totalFiles: totalDisk.fileCount,
    },
    timingHistory: {
      entries: timingHistory.entries.length,
      last10: timingHistory.entries.slice(-10),
    },
  };

  statusCache = {
    expiresAt: now + STATUS_CACHE_TTL_MS,
    payload,
  };

  return NextResponse.json(payload);
}
