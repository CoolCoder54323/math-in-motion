import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/*  FFmpeg CLI wrapper functions                                        */
/*                                                                      */
/*  Each function shells out to ffmpeg/ffprobe. All paths are absolute  */
/*  and all outputs go into the job directory.                          */
/* ------------------------------------------------------------------ */

const FFMPEG_TIMEOUT_MS = 60_000;

function run(
  cmd: string,
  args: string[],
  timeout = FFMPEG_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${cmd} failed: ${error.message}\n${stderr}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/*  ffprobe: get media info                                             */
/* ------------------------------------------------------------------ */

export type MediaInfo = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
};

export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find(
    (s: Record<string, unknown>) => s.codec_type === "video",
  );

  const durationSeconds = parseFloat(data.format?.duration ?? "0");
  const width = videoStream?.width ?? 0;
  const height = videoStream?.height ?? 0;

  // Parse frame rate from "30/1" or "15/1" format
  let fps = 30;
  const rateStr = videoStream?.r_frame_rate ?? "30/1";
  const [num, den] = rateStr.split("/").map(Number);
  if (num && den) fps = num / den;

  return { durationSeconds, width, height, fps };
}

/* ------------------------------------------------------------------ */
/*  normalizeClip: scale + pad to target resolution/fps                 */
/* ------------------------------------------------------------------ */

export async function normalizeClip(
  inputPath: string,
  outputPath: string,
  options: { width: number; height: number; fps: number },
): Promise<string> {
  const { width, height, fps } = options;

  await run("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0xFFF4D6`,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-an",
    outputPath,
  ]);

  return outputPath;
}

/* ------------------------------------------------------------------ */
/*  generateTitleCard: create a title card video from text               */
/* ------------------------------------------------------------------ */

export async function generateTitleCard(
  title: string,
  outputPath: string,
  options: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
  },
): Promise<string> {
  const { width, height, fps, durationSeconds } = options;

  // Escape single quotes and special chars for drawtext
  const safeTitle = title.replace(/'/g, "'\\''").replace(/:/g, "\\:");

  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0xFFF4D6:s=${width}x${height}:d=${durationSeconds}:r=${fps}`,
    "-vf",
    [
      `drawtext=text='${safeTitle}':fontsize=64:fontcolor=0x2D2013:x=(w-text_w)/2:y=(h-text_h)/2-30:font=Arial`,
      `drawtext=text='Math in Motion':fontsize=28:fontcolor=0x2D2013@0.5:x=(w-text_w)/2:y=(h-text_h)/2+50:font=Arial`,
    ].join(","),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);

  return outputPath;
}

/* ------------------------------------------------------------------ */
/*  concatenateClips: join clips with crossfade transitions              */
/* ------------------------------------------------------------------ */

export async function concatenateClips(
  clipPaths: string[],
  outputPath: string,
  options?: { transitionDurationSeconds?: number },
): Promise<string> {
  if (clipPaths.length === 0) throw new Error("No clips to concatenate.");

  if (clipPaths.length === 1) {
    // Single clip — just copy
    await run("ffmpeg", ["-y", "-i", clipPaths[0], "-c", "copy", outputPath]);
    return outputPath;
  }

  const transDur = options?.transitionDurationSeconds ?? 0.5;

  // Get durations for each clip to calculate xfade offsets
  const durations: number[] = [];
  for (const clip of clipPaths) {
    const info = await getMediaInfo(clip);
    durations.push(info.durationSeconds);
  }

  // Build complex filter for xfade chain
  // For N clips, we need N-1 xfade operations
  const inputs = clipPaths.flatMap((p) => ["-i", p]);
  const filterParts: string[] = [];
  let currentOffset = 0;
  let prevLabel = "[0:v]";

  for (let i = 1; i < clipPaths.length; i++) {
    currentOffset += durations[i - 1] - transDur;
    if (currentOffset < 0) currentOffset = 0;

    const outLabel = i < clipPaths.length - 1 ? `[v${i}]` : "[outv]";
    filterParts.push(
      `${prevLabel}[${i}:v]xfade=transition=fade:duration=${transDur}:offset=${currentOffset.toFixed(3)}${outLabel}`,
    );
    prevLabel = outLabel;
  }

  await run(
    "ffmpeg",
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[outv]",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ],
    120_000,
  );

  return outputPath;
}

/* ------------------------------------------------------------------ */
/*  addAudioTrack: merge video + audio                                  */
/* ------------------------------------------------------------------ */

export async function addAudioTrack(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<string> {
  await run("ffmpeg", [
    "-y",
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
  ]);

  return outputPath;
}

/* ------------------------------------------------------------------ */
/*  optimizeOutput: final H.264 encode                                  */
/* ------------------------------------------------------------------ */

export async function optimizeOutput(
  inputPath: string,
  outputPath: string,
  crf = 18,
): Promise<string> {
  await run(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(crf),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    120_000,
  );

  return outputPath;
}
