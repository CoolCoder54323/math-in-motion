import { execFile } from "node:child_process";
import {
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { PipelineStageHandler } from "../stage";
import type { PipelineEvent, GeneratedScene, RenderOutput } from "../types";
import { getManimKitPython } from "../manim-kit";
import { addTrackedPid, removeTrackedPid } from "../job-manager";

/* ------------------------------------------------------------------ */
/*  Stage 4: Manim Scene Rendering                                      */
/*                                                                      */
/*  Renders each validated scene to MP4 via the Manim CLI.              */
/*  Supports parallel rendering and per-scene retry.                    */
/* ------------------------------------------------------------------ */

const MANIM_RENDER_TIMEOUT_MS = 90_000;
const MAX_PARALLEL_RENDERS = 7;

type RenderInput = {
  scenes: GeneratedScene[];
  quality: "l" | "m" | "h";
};

export type SceneRenderResult =
  | { ok: true; sceneId: string; videoPath: string; durationSeconds: number }
  | { ok: false; sceneId: string; error: string };

/* ------------------------------------------------------------------ */
/*  Render a single scene                                               */
/* ------------------------------------------------------------------ */

function qualityDir(quality: "l" | "m" | "h"): string {
  return quality === "l" ? "480p15" : quality === "m" ? "720p30" : "1080p60";
}

export async function renderScene(
  scene: GeneratedScene,
  jobDir: string,
  quality: "l" | "m" | "h",
  signal?: AbortSignal,
  assets?: string[],
): Promise<SceneRenderResult> {
  const sceneDir = join(jobDir, "scenes", scene.sceneId);
  mkdirSync(sceneDir, { recursive: true });

  const sceneFile = join(sceneDir, "scene.py");
  writeFileSync(sceneFile, scene.pythonCode, "utf-8");
  writeFileSync(join(sceneDir, "manim_kit.py"), getManimKitPython(), "utf-8");

  // Copy assets into the scene directory so ImageMobject / SVGMobject can reference them
  if (assets && assets.length > 0) {
    const assetsDir = join(jobDir, "assets");
    for (const assetName of assets) {
      const src = join(assetsDir, assetName);
      if (existsSync(src)) {
        copyFileSync(src, join(sceneDir, assetName));
      }
    }
  }

  const mediaDir = join(sceneDir, "media");

  const args = [
    "render",
    sceneFile,
    scene.className,
    `-q${quality}`,
    "--media_dir",
    mediaDir,
    "--format",
    "mp4",
    "--disable_caching",
  ];

  return new Promise<SceneRenderResult>((resolve) => {
    const proc = execFile(
      "manim",
      args,
      {
        timeout: MANIM_RENDER_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
      (error, _stdout, stderr) => {
        if (proc.pid) removeTrackedPid(proc.pid);
        if (signal) signal.removeEventListener("abort", onAbort);

        if (error) {
          const stderrHint = stderr?.trim() ? `\n\nSTDERR:\n${stderr.trim()}` : "";
          const errMsg = error.killed || signal?.aborted
            ? `Scene "${scene.sceneId}" ${signal?.aborted ? "aborted" : "timed out"}.`
            : `Scene "${scene.sceneId}" render failed: ${error.message}${stderrHint}`;
          resolve({ ok: false, sceneId: scene.sceneId, error: errMsg });
          return;
        }

        // Find the mp4
        const videosDir = join(mediaDir, "videos");
        let videoPath: string | null = null;

        if (existsSync(videosDir)) {
          for (const subdir of readdirSync(videosDir, { withFileTypes: true })) {
            if (!subdir.isDirectory()) continue;
            const qDir = join(videosDir, subdir.name, qualityDir(quality));
            if (!existsSync(qDir)) continue;
            const mp4Files = readdirSync(qDir).filter((f) => f.endsWith(".mp4"));
            if (mp4Files.length > 0) {
              videoPath = join(qDir, mp4Files[0]);
              break;
            }
          }
        }

        if (!videoPath) {
          resolve({
            ok: false,
            sceneId: scene.sceneId,
            error: `No video file found after rendering scene "${scene.sceneId}".`,
          });
          return;
        }

        // Copy to stable clip path
        const clipPath = join(jobDir, "clips", `${scene.sceneId}.mp4`);
        copyFileSync(videoPath, clipPath);

        // Clean up scene render directory
        try {
          rmSync(sceneDir, { recursive: true, force: true });
        } catch {
          // best effort
        }

        resolve({
          ok: true,
          sceneId: scene.sceneId,
          videoPath: clipPath,
          durationSeconds: 0, // Will be filled by ffprobe in postprocess
        });
      },
    );

    if (proc.pid) {
      addTrackedPid(proc.pid, jobDir.split("/").pop() ?? "unknown", scene.sceneId);
    }

    // Kill manim process when pipeline signal aborts — prevents orphan processes.
    const onAbort = () => {
      try {
        proc.kill("SIGTERM");
      } catch {
        // process may already have exited
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort);
      }
    }

    proc.on("error", (err) => {
      if (proc.pid) removeTrackedPid(proc.pid);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve({
        ok: false,
        sceneId: scene.sceneId,
        error: `Failed to start manim for "${scene.sceneId}": ${err.message}`,
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Parallel rendering with concurrency limit                           */
/* ------------------------------------------------------------------ */

async function renderBatch(
  scenes: GeneratedScene[],
  jobDir: string,
  quality: "l" | "m" | "h",
  onProgress: (completed: number, total: number, sceneId: string, ok: boolean) => void,
  signal?: AbortSignal,
  assets?: string[],
): Promise<SceneRenderResult[]> {
  const results: SceneRenderResult[] = [];
  let completed = 0;

  for (let i = 0; i < scenes.length; i += MAX_PARALLEL_RENDERS) {
    const batch = scenes.slice(i, i + MAX_PARALLEL_RENDERS);
    const batchResults = await Promise.all(
      batch.map((scene) => renderScene(scene, jobDir, quality, signal, assets)),
    );

    for (const result of batchResults) {
      results.push(result);
      completed++;
      onProgress(completed, scenes.length, result.sceneId, result.ok);
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Stage implementation                                                */
/* ------------------------------------------------------------------ */

export const renderStage: PipelineStageHandler<RenderInput, RenderOutput> = {
  name: "render",

  async *execute(input, context): AsyncGenerator<PipelineEvent, RenderOutput, undefined> {
    const { scenes, quality } = input;

    yield {
      type: "stage-progress",
      stage: "render",
      progress: 0,
      message: `Rendering ${scenes.length} scenes at ${qualityDir(quality)} quality\u2026`,
    };

    const progressEvents: PipelineEvent[] = [];

    const results = await renderBatch(
      scenes,
      context.jobDir,
      quality,
      (completed, total, sceneId, ok) => {
        progressEvents.push({
          type: "stage-progress",
          stage: "render",
          progress: completed / total,
          message: ok
            ? `Rendered scene "${sceneId}" (${completed}/${total})`
            : `Scene "${sceneId}" failed (${completed}/${total})`,
        });
      },
      context.signal,
      context.assets,
    );

    for (const event of progressEvents) {
      yield event;
    }

    const clips = results
      .filter((r): r is Extract<SceneRenderResult, { ok: true }> => r.ok)
      .map((r) => ({
        sceneId: r.sceneId,
        videoPath: r.videoPath,
        durationSeconds: r.durationSeconds,
      }));

    const failures = results
      .filter((r): r is Extract<SceneRenderResult, { ok: false }> => !r.ok)
      .map((r) => ({
        sceneId: r.sceneId,
        error: r.error,
      }));

    if (failures.length > 0) {
      console.warn(
        `Render failures:\n${failures.map((f) => `  [${f.sceneId}] ${f.error}`).join("\n")}`,
      );
    }

    yield {
      type: "stage-progress",
      stage: "render",
      progress: 1,
      message: `Rendering complete: ${clips.length}/${scenes.length} scenes succeeded`,
    };

    return { clips, failures };
  },
};
