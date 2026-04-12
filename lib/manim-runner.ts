import { execFile } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, readdirSync, } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MANIM_RENDER_TIMEOUT_MS = 90_000;
const JOB_TTL_MS = 60 * 60 * 1_000; // 1 hour
const MEDIA_ROOT = process.env.MANIM_MEDIA_ROOT || join(process.cwd(), ".manim-output");

export type RenderResult =
  | { ok: true; videoPath: string; duration: number }
  | { ok: false; error: string; stderr?: string };

export function ensureMediaDir(): string {
  if (!existsSync(MEDIA_ROOT)) mkdirSync(MEDIA_ROOT, { recursive: true });
  return MEDIA_ROOT;
}

export function createJobDir(): string {
  const dir = join(ensureMediaDir(), randomUUID());
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupStaleJobs(): void {
  const now = Date.now();
  const root = ensureMediaDir();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(root, entry.name);
    try {
      const { mtimeMs } = statSync(dirPath);
      if (now - mtimeMs > JOB_TTL_MS) {
        rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // ignore — directory may have been removed concurrently
    }
  }
}

export async function renderManimScene(
  pythonCode: string,
  options?: { quality?: "l" | "m" | "h"; jobId?: string },
): Promise<RenderResult> {
  const jobId = options?.jobId ?? randomUUID();
  const quality = options?.quality ?? "l";
  const tmpDir = createJobDir();
  const sceneFile = join(tmpDir, "scene.py");

  writeFileSync(sceneFile, pythonCode, "utf-8");

  const mediaDir = join(tmpDir, "media");

  const args = [
    "render",
    sceneFile,
    "Lesson",
    `-pq${quality}`,
    `--media_dir`,
    mediaDir,
    `--format`,
    "mp4",
    "--disable_caching",
  ];

  const result = await new Promise<RenderResult>((resolve) => {
    const proc = execFile(
      "manim",
      args,
      {
        timeout: MANIM_RENDER_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
      (error, stdout, stderr) => {
        if (error) {
          const errMsg =
            error.killed
              ? "Render timed out."
              : `Render failed: ${error.message}`;
          resolve({ ok: false, error: errMsg, stderr: stderr ?? undefined });
          return;
        }

        // Find the mp4 — manim creates media_dir/videos/<filename>/<quality>/Lesson.mp4
        // We need to search for it since the subdirectory name depends on the
        // Python filename (scene.py → "scene").
        const videosDir = join(mediaDir, "videos");
        let videoPath: string | null = null;

        if (existsSync(videosDir)) {
          const subdirs = readdirSync(videosDir, { withFileTypes: true });
          for (const subdir of subdirs) {
            if (!subdir.isDirectory()) continue;
            const qualityDir = join(videosDir, subdir.name, quality === "l" ? "480p15" : quality === "m" ? "720p30" : "1080p60");
            if (!existsSync(qualityDir)) continue;
            const mp4Files = readdirSync(qualityDir).filter((f) => f.endsWith(".mp4"));
            if (mp4Files.length > 0) {
              videoPath = join(qualityDir, mp4Files[0]);
              break;
            }
          }
        }

        if (!videoPath) {
          resolve({
            ok: false,
            error: "Video directory not found after render.",
            stderr: stderr ?? undefined,
          });
          return;
        }

        resolve({ ok: true, videoPath, duration: 0 });
      },
    );

    proc.on("error", (err) => {
      resolve({ ok: false, error: `Failed to start manim: ${err.message}` });
    });
  });

  // Move the video to a stable path under jobId, then clean up temp dir
  if (result.ok) {
    const stablePath = join(ensureMediaDir(), `${jobId}.mp4`);
    copyFileSync(result.videoPath, stablePath);
    result.videoPath = stablePath;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort — stale dirs get cleaned up by cleanupStaleJobs()
    }
  }

  return result;
}

export async function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      outputPath,
    ];

    const proc = execFile("ffmpeg", args, { timeout: 30_000 }, (error) => {
      if (error) {
        reject(new Error(`ffmpeg merge failed: ${error.message}`));
        return;
      }
      resolve(outputPath);
    });

    proc.on("error", (err) => reject(err));
  });
}

export function getVideoStream(jobId: string): NodeJS.ReadableStream | null {
  const filePath = join(ensureMediaDir(), `${jobId}.mp4`);
  if (!existsSync(filePath)) return null;
  return createReadStream(filePath);
}

export function getVideoPath(jobId: string): string | null {
  const filePath = join(ensureMediaDir(), `${jobId}.mp4`);
  return existsSync(filePath) ? filePath : null;
}