import type { PipelineEvent, PipelineManifest, PipelineMode, PipelineStage } from "./types";
import type { LLMUsage } from "./llm-usage";

export type PipelineContext = {
  jobId: string;
  jobDir: string;
  mode: PipelineMode;
  manifest: PipelineManifest;
  signal?: AbortSignal;

  pauseRequested: boolean;

  resumePipeline?: () => void;

  resumeFrom?: PipelineStage;

  lastLLMUsage?: LLMUsage;
};

/* ------------------------------------------------------------------ */
/*  Stage handler interface                                             */
/*                                                                      */
/*  Each stage is an async generator:                                   */
/*    - yields PipelineEvent for progress reporting                     */
/*    - returns TOutput when complete                                   */
/* ------------------------------------------------------------------ */

export interface PipelineStageHandler<TInput, TOutput> {
  name: PipelineStage;
  execute(
    input: TInput,
    context: PipelineContext,
  ): AsyncGenerator<PipelineEvent, TOutput, undefined>;
}
