import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { PipelineStageHandler } from "../stage";
import type { PipelineEvent, PostprocessOutput, RenderOutput } from "../types";
import {
  normalizeClip,
  generateTitleCard,
  concatenateClips,
  getMediaInfo,
  optimizeOutput,
} from "../ffmpeg-runner";

/* ------------------------------------------------------------------ */
/*  Stage 5: FFmpeg Post-Processing                                     */
/*                                                                      */
/*  Normalizes all rendered clips to consistent resolution/fps,         */
/*  generates a title card, concatenates with crossfade transitions,    */
/*  and optimizes the final output.                                     */
/* ------------------------------------------------------------------ */

type PostprocessInput = {
  clips: RenderOutput["clips"];
  title: string;
  quality: "l" | "m" | "h";
};

function qualitySpec(quality: "l" | "m" | "h") {
  switch (quality) {
    case "l":
      return { width: 854, height: 480, fps: 15 };
    case "m":
      return { width: 1280, height: 720, fps: 30 };
    case "h":
      return { width: 1920, height: 1080, fps: 60 };
  }
}

export const postprocessStage: PipelineStageHandler<PostprocessInput, PostprocessOutput> = {
  name: "postprocess",

  async *execute(input, context): AsyncGenerator<PipelineEvent, PostprocessOutput, undefined> {
    const { clips, title, quality } = input;
    const spec = qualitySpec(quality);
    const postDir = join(context.jobDir, "postprocess");

    mkdirSync(postDir, { recursive: true });

    const totalSteps = clips.length + 3; // normalize each clip + title card + concat + optimize
    let completed = 0;

    yield {
      type: "stage-progress",
      stage: "postprocess",
      progress: 0,
      message: "Starting post-processing\u2026",
    };

    // Step 1: Normalize all clips to consistent resolution/fps
    const normalizedPaths: string[] = [];
    for (const clip of clips) {
      const normalizedPath = join(postDir, `norm_${clip.sceneId}.mp4`);
      await normalizeClip(clip.videoPath, normalizedPath, spec);
      normalizedPaths.push(normalizedPath);
      completed++;
      yield {
        type: "stage-progress",
        stage: "postprocess",
        progress: completed / totalSteps,
        message: `Normalized clip "${clip.sceneId}" (${completed}/${clips.length})`,
      };
    }

    // Step 2: Generate title card
    const titleCardPath = join(postDir, "title_card.mp4");
    await generateTitleCard(title, titleCardPath, {
      ...spec,
      durationSeconds: 3,
    });
    completed++;
    yield {
      type: "stage-progress",
      stage: "postprocess",
      progress: completed / totalSteps,
      message: "Title card generated",
    };

    // Step 3: Concatenate title card + all clips with crossfade transitions
    const concatenatedPath = join(postDir, "concatenated.mp4");
    await concatenateClips(
      [titleCardPath, ...normalizedPaths],
      concatenatedPath,
      { transitionDurationSeconds: 0.5 },
    );
    completed++;
    yield {
      type: "stage-progress",
      stage: "postprocess",
      progress: completed / totalSteps,
      message: "Clips concatenated with transitions",
    };

    // Step 4: Final optimization
    const finalPath = join(context.jobDir, "final.mp4");
    await optimizeOutput(concatenatedPath, finalPath);
    completed++;

    // Get final duration
    const info = await getMediaInfo(finalPath);

    yield {
      type: "stage-progress",
      stage: "postprocess",
      progress: 1,
      message: `Post-processing complete \u2014 ${info.durationSeconds.toFixed(1)}s video`,
    };

    return {
      videoPath: finalPath,
      durationSeconds: info.durationSeconds,
    };
  },
};
