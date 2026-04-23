import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { PipelineStageHandler } from "../stage";
import type { PipelineEvent, ComposeOutput, AnimationStep, SceneEntry } from "../types";
import { getMediaInfo, concatenateClips, normalizeClip } from "../ffmpeg-runner";

/* ------------------------------------------------------------------ */
/*  Stage 6: Compose (Final Assembly)                                   */
/*                                                                      */
/*  In "mp4" bake mode, this stage reads the plan's sceneBreakdown for  */
/*  mp4Bake/interaction data and inserts question/reveal card clips      */
/*  between scene clips to create a pedagogically structured MP4.        */
/*  In default mode (no bake data), it passes through as before.         */
/* ------------------------------------------------------------------ */

type ComposeInput = {
  videoPath: string;
  durationSeconds: number;
  steps: AnimationStep[];
  sceneBreakdown?: SceneEntry[];
  clips?: { sceneId: string; videoPath: string; durationSeconds: number }[];
  outputMode?: "mp4" | "interactive";
};

function run(cmd: string, args: string[], timeout = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 2 * 1024 * 1024 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/* -- Generate a question card clip using ffmpeg drawtext -------------- */

async function renderQuestionCard(params: {
  question: string;
  holdSeconds: number;
  jobDir: string;
  sceneId: string;
}): Promise<string> {
  const { question, holdSeconds, jobDir, sceneId } = params;
  const clipsDir = join(jobDir, "clips");
  mkdirSync(clipsDir, { recursive: true });
  const outPath = join(clipsDir, `qcard_${sceneId}.mp4`);

  if (existsSync(outPath)) return outPath;

  const safeText = question.replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/%/g, "%%");

  await run("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0xFFF4D6:s=1280x720:d=${holdSeconds}:r=30`,
    "-vf",
    [
      `drawtext=text='${safeText}':fontsize=48:fontcolor=0x2D2013:x=(w-text_w)/2:y=(h-text_h)/2-20:font=Arial`,
      `drawtext=text='Think about it...':fontsize=32:fontcolor=0x9B59D0:x=(w-text_w)/2:y=(h-text_h)/2+50:font=Arial`,
    ].join(","),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    outPath,
  ], 30_000);

  return outPath;
}

/* -- Generate a reveal card clip using ffmpeg drawtext ---------------- */

async function renderRevealCard(params: {
  answer: string;
  explanation?: string;
  misconceptionText?: string;
  showMisconception: boolean;
  jobDir: string;
  sceneId: string;
}): Promise<string> {
  const { answer, explanation, misconceptionText, showMisconception, jobDir, sceneId } = params;
  const clipsDir = join(jobDir, "clips");
  mkdirSync(clipsDir, { recursive: true });
  const outPath = join(clipsDir, `rcard_${sceneId}.mp4`);

  if (existsSync(outPath)) return outPath;

  const safeAnswer = answer.replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/%/g, "%%");

  const drawtextFilters = [
    `drawtext=text='Correct!':fontsize=36:fontcolor=0x9B59D0:x=(w-text_w)/2:y=(h-text_h)/2-80:font=Arial`,
    `drawtext=text='${safeAnswer}':fontsize=52:fontcolor=0x56C42A:x=(w-text_w)/2:y=(h-text_h)/2-10:font=Arial`,
  ];

  if (showMisconception && misconceptionText) {
    const safeMisconception = `Not: ${misconceptionText}`.replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/%/g, "%%");
    drawtextFilters.push(
      `drawtext=text='${safeMisconception}':fontsize=28:fontcolor=0xFF8C42:x=(w-text_w)/2:y=(h-text_h)/2+50:font=Arial`,
    );
  }

  if (explanation) {
    const safeExpl = explanation.replace(/'/g, "'\\''").replace(/:/g, "\\:").replace(/%/g, "%%");
    drawtextFilters.push(
      `drawtext=text='${safeExpl}':fontsize=28:fontcolor=0x2D2013:x=(w-text_w)/2:y=(h-text_h)/2+${showMisconception && misconceptionText ? 90 : 50}:font=Arial`,
    );
  }

  await run("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "color=c=0xFFF4D6:s=1280x720:d=2.5:r=30",
    "-vf", drawtextFilters.join(","),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    outPath,
  ], 30_000);

  return outPath;
}

/* -- Compose stage implementation ------------------------------------- */

export const composeStage: PipelineStageHandler<ComposeInput, ComposeOutput> = {
  name: "compose",

  async *execute(input, context): AsyncGenerator<PipelineEvent, ComposeOutput, undefined> {
    yield {
      type: "stage-progress",
      stage: "compose",
      progress: 0,
      message: "Assembling final video\u2026",
    };

    const outputPath = join(context.jobDir, "output.mp4");
    const hasBakeData =
      input.sceneBreakdown &&
      input.clips &&
      input.sceneBreakdown.some((s) => s.hasPredictPause && s.mp4Bake);

    if (hasBakeData && input.sceneBreakdown && input.clips) {
      // ── Bake mode: insert question/reveal cards between scene clips ──
      yield {
        type: "stage-progress",
        stage: "compose",
        progress: 0.2,
        message: "Rendering question cards\u2026",
      };

      const orderedClips: string[] = [];
      const sceneBreakdown = input.sceneBreakdown;
      const clips = input.clips;
      const missingScenes: string[] = [];

      for (const scene of sceneBreakdown) {
        const clip = clips.find((c) => c.sceneId === scene.sceneId);
        if (!clip) {
          missingScenes.push(scene.sceneId);
          continue;
        }
        if (!existsSync(clip.videoPath)) {
          missingScenes.push(`${scene.sceneId} (file missing: ${clip.videoPath})`);
          continue;
        }

        orderedClips.push(clip.videoPath);

        if (scene.hasPredictPause && scene.mp4Bake) {
          const qCardPath = await renderQuestionCard({
            question: scene.interaction?.prompt ?? "What do you think?",
            holdSeconds: scene.mp4Bake.questionHoldSeconds,
            jobDir: context.jobDir,
            sceneId: scene.sceneId,
          });
          orderedClips.push(qCardPath);

          const revealPath = await renderRevealCard({
            answer: scene.mp4Bake.revealNarration || "See the explanation!",
            explanation: scene.mp4Bake.showMisconceptionCorrection
              ? scene.targetMisconception ?? undefined
              : undefined,
            misconceptionText: scene.mp4Bake.misconceptionText ?? undefined,
            showMisconception: scene.mp4Bake.showMisconceptionCorrection,
            jobDir: context.jobDir,
            sceneId: scene.sceneId,
          });
          orderedClips.push(revealPath);
        }
      }

      // Pre-concat validation
      const totalExpected = sceneBreakdown.length;
      const missingCount = missingScenes.length;
      console.log(`[compose] Ordered clips (${orderedClips.length} total including cards):`);
      for (let i = 0; i < orderedClips.length; i++) {
        console.log(`  ${i + 1}. ${orderedClips[i]}`);
      }
      if (missingCount > 0) {
        console.warn(`[compose] Missing scenes (${missingCount}/${totalExpected}): ${missingScenes.join(", ")}`);
        // Reject if more than 50% of scenes are missing, or if all are missing
        if (missingCount === totalExpected || missingCount / totalExpected > 0.5) {
          throw new Error(
            `Compose failed: ${missingCount}/${totalExpected} scenes missing or have missing files. ` +
            `Missing: ${missingScenes.join(", ")}`,
          );
        }
      }

      if (orderedClips.length > 1) {
        yield {
          type: "stage-progress",
          stage: "compose",
          progress: 0.5,
          message: "Normalizing clips for concatenation\u2026",
        };

        // Normalize all clips to identical resolution/fps/timebase before xfade
        const normalizedDir = join(context.jobDir, "normalized");
        mkdirSync(normalizedDir, { recursive: true });
        const normalizedClips: string[] = [];
        for (let i = 0; i < orderedClips.length; i++) {
          const normPath = join(normalizedDir, `n${i}.mp4`);
          await normalizeClip(orderedClips[i], normPath, { width: 1280, height: 720, fps: 30 });
          normalizedClips.push(normPath);
        }

        yield {
          type: "stage-progress",
          stage: "compose",
          progress: 0.7,
          message: "Concatenating scenes with question cards\u2026",
        };

        await concatenateClips(normalizedClips, outputPath);

        let totalDuration = 0;
        try {
          const info = await getMediaInfo(outputPath);
          totalDuration = info.durationSeconds;
        } catch {
          totalDuration = input.durationSeconds;
        }

        yield {
          type: "stage-progress",
          stage: "compose",
          progress: 1,
          message: `Final video ready \u2014 ${totalDuration.toFixed(1)}s`,
        };

        return { videoPath: outputPath, durationSeconds: totalDuration };
      }

      // Fall through to pass-through if only one clip
    }

    // ── Default (pass-through) mode ──
    if (input.videoPath !== outputPath && existsSync(input.videoPath)) {
      const { copyFileSync: copyFile } = await import("node:fs");
      copyFile(input.videoPath, outputPath);
    }

    const finalPath = existsSync(outputPath) ? outputPath : input.videoPath;

    yield {
      type: "stage-progress",
      stage: "compose",
      progress: 1,
      message: `Final video ready \u2014 ${input.durationSeconds.toFixed(1)}s`,
    };

    return {
      videoPath: finalPath,
      durationSeconds: input.durationSeconds,
    };
  },
};