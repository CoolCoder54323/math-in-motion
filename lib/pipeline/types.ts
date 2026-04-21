/* ------------------------------------------------------------------ */
/*  Pipeline type system                                                */
/* ------------------------------------------------------------------ */

export const PIPELINE_STAGES = [
  "plan",
  "codegen",
  "validate",
  "render",
  "postprocess",
  "compose",
] as const;

export const VIZ_PIPELINE_STAGES = [
  "codegen",
  "validate",
  "render",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type PipelineMode = "lesson" | "viz";

export type ArtifactType = "video" | "audio" | "image" | "json" | "code";

export type Artifact = {
  type: ArtifactType;
  path: string;
  metadata: Record<string, unknown>;
};

export type StageStatus = "pending" | "running" | "success" | "error" | "skipped";

export type StageResult = {
  stage: PipelineStage;
  status: StageStatus;
  artifacts: Artifact[];
  durationMs: number;
  error?: string;
};

export type PipelineManifest = {
  jobId: string;
  mode: PipelineMode;
  stages: StageResult[];
  createdAt: number;
  status: "running" | "complete" | "failed" | "paused" | "awaiting-approval";
  finalArtifact?: Artifact;
};

/* ------------------------------------------------------------------ */
/*  SSE event types                                                     */
/* ------------------------------------------------------------------ */

export type ValidationIssue = {
  sceneId: string;
  severity: "error" | "warning";
  message: string;
};

export type PipelineEvent =
  | { type: "pipeline-started"; jobId: string }
  | { type: "stage-start"; stage: PipelineStage }
  | { type: "stage-progress"; stage: PipelineStage; progress: number; message: string }
  | { type: "stage-complete"; stage: PipelineStage; result: StageResult }
  | { type: "pipeline-complete"; manifest: PipelineManifest }
  | { type: "pipeline-error"; error: string; failedStage: PipelineStage }
  | { type: "plan-ready"; plan: PlanOutput }
  | { type: "plan-awaiting-approval"; plan: PlanOutput }
  | { type: "codegen-ready"; scenes: GeneratedScene[] }
  | { type: "scene-rendered"; sceneId: string; clipUrl: string }
  | { type: "scene-generating"; sceneId: string }
  | { type: "scene-ready"; sceneId: string; clipUrl: string; durationSeconds: number }
  | { type: "scene-failed"; sceneId: string; error: string }
  | { type: "scene-regenerating"; sceneId: string }
  | { type: "validation-report"; scenes: number; passed: number; issues: ValidationIssue[] }
  | { type: "pipeline-paused"; stage: PipelineStage; resumableFrom: PipelineStage };

/* ------------------------------------------------------------------ */
/*  Pipeline I/O types                                                  */
/* ------------------------------------------------------------------ */

export type SceneEntry = {
  sceneId: string;
  description: string;
  mathContent: string;
  estimatedSeconds: number;
};

export type AnimationStep = {
  label: string;
  narration: string;
};

export type PlanOutput = {
  title: string;
  estimatedDuration: number;
  steps: AnimationStep[];
  sceneBreakdown: SceneEntry[];
};

export type GeneratedScene = {
  sceneId: string;
  className: string;
  pythonCode: string;
};

export type CodegenOutput = {
  scenes: GeneratedScene[];
};

export type ValidateOutput = {
  scenes: GeneratedScene[];
  issues: ValidationIssue[];
};

export type RenderOutput = {
  clips: { sceneId: string; videoPath: string; durationSeconds: number }[];
  failures: { sceneId: string; error: string }[];
};

export type PostprocessOutput = {
  videoPath: string;
  durationSeconds: number;
  thumbnailPath?: string;
};

export type ComposeOutput = {
  videoPath: string;
  durationSeconds: number;
};

export type PipelineInput = {
  conceptText?: string;
  latexProblem?: string;
  mode?: PipelineMode;
  /** When set, skip all stages before this one and use cached artifacts. */
  resumeFrom?: PipelineStage;
  /** Cached plan output — used when resuming from codegen or later. */
  cachedPlan?: PlanOutput;
  /** Cached generated scenes — used when resuming from render or later. */
  cachedScenes?: GeneratedScene[];
  options?: {
    quality?: "l" | "m" | "h";
    skipPostProcess?: boolean;
    provider?: "anthropic" | "openai" | "deepseek";
  };
};

/* ------------------------------------------------------------------ */
/*  Timing analytics types                                              */
/* ------------------------------------------------------------------ */

export type SceneTiming = {
  sceneId: string;
  codegenMs: number;
  validateMs: number;
  renderMs: number;
  totalMs: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    cachedTokens?: number;
    estimatedCostUSD: number;
  };
};

export type StageTiming = {
  stage: PipelineStage;
  totalMs: number;
  llmProvider?: string;
  llmModel?: string;
  promptSummary?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    cachedTokens?: number;
    estimatedCostUSD: number;
  };
  sceneTimings?: SceneTiming[];
};

export type PipelineTiming = {
  jobId: string;
  mode: PipelineMode;
  startedAt: number;
  completedAt: number;
  totalMs: number;
  quality: "l" | "m" | "h";
  conceptText?: string;
  latexProblem?: string;
  totalEstimatedCostUSD: number;
  stages: StageTiming[];
};
