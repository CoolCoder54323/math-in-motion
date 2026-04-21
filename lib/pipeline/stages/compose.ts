import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PipelineStageHandler } from "../stage";
import type { PipelineEvent, ComposeOutput, AnimationStep } from "../types";

/* ------------------------------------------------------------------ */
/*  Stage 6: Compose (Final Assembly)                                   */
/*                                                                      */
/*  Currently a pass-through that copies the post-processed video to    */
/*  the final output location. Designed as the future insertion point   */
/*  for TTS narration (OpenAI TTS, ElevenLabs) and background music.   */
/* ------------------------------------------------------------------ */

type ComposeInput = {
  videoPath: string;
  durationSeconds: number;
  steps: AnimationStep[];
};

export const composeStage: PipelineStageHandler<ComposeInput, ComposeOutput> = {
  name: "compose",

  async *execute(input, context): AsyncGenerator<PipelineEvent, ComposeOutput, undefined> {
    yield {
      type: "stage-progress",
      stage: "compose",
      progress: 0,
      message: "Assembling final video\u2026",
    };

    // Future: generate TTS narration from step narrations
    // Future: mix TTS audio with video
    // Future: add background music

    const outputPath = join(context.jobDir, "output.mp4");

    // For now, copy the post-processed video as the final output
    if (input.videoPath !== outputPath && existsSync(input.videoPath)) {
      copyFileSync(input.videoPath, outputPath);
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
