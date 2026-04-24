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
  status:
    | "running"
    | "complete"
    | "failed"
    | "paused"
    | "awaiting-approval"
    | "awaiting-confirmation"
    | "generating"
    | "building"
    | "interrupted";
  currentStage?: PipelineStage;
  finalArtifact?: Artifact;
};

/* ------------------------------------------------------------------ */
/*  Shared scene / lesson types                                         */
/* ------------------------------------------------------------------ */

export type SceneRole =
  | "hook"
  | "introduce"
  | "worked_example"
  | "predict"
  | "address_misconception"
  | "synthesize";

export type InteractionBlock = {
  type: "multiple_choice" | "tap_to_reveal";
  prompt: string;
  pauseSeconds: number;
  choices?: {
    text: string;
    correct: boolean;
    feedback: string;
  }[];
};

export type Mp4BakeBlock = {
  questionHoldSeconds: number;
  revealNarration: string;
  showMisconceptionCorrection: boolean;
  misconceptionText?: string;
};

export type SceneEntry = {
  sceneId: string;
  description: string;
  mathContent: string;
  estimatedSeconds: number;
  role?: SceneRole;
  hasPredictPause?: boolean;
  targetMisconception?: string | null;
  exitObjects?: string[];
  interaction?: InteractionBlock;
  mp4Bake?: Mp4BakeBlock;
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

/* ------------------------------------------------------------------ */
/*  Scene IR + generated scene artifacts                                */
/* ------------------------------------------------------------------ */

export type SceneDesignMode = "ir" | "hybrid" | "raw";

export type SceneBaseClass = "Scene" | "MovingCameraScene";

export type SceneIRSafeArea = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type SceneIRZone = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  note?: string;
};

export type SceneIRAnchorAlign =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type SceneIRAnchor = {
  zone: string;
  align?: SceneIRAnchorAlign;
  dx?: number;
  dy?: number;
  widthPct?: number;
  heightPct?: number;
};

export type SceneIRMetadata = {
  sceneId: string;
  role?: SceneRole;
  visualIntent: string;
  densityTarget?: number;
  baseClass?: SceneBaseClass;
  notes?: string[];
};

export type SceneIRLayout = {
  safeArea?: SceneIRSafeArea;
  zones: SceneIRZone[];
  continuitySlots?: string[];
};

export type SceneIRObject = {
  id: string;
  kind: string;
  role?: string;
  anchor?: SceneIRAnchor;
  props?: Record<string, unknown>;
  relatedTo?: string[];
  zIndex?: number;
};

export type SceneIRAction =
  | {
      type: "show";
      targets: string[];
      animation?: string;
      runTime?: number;
      stagger?: number;
    }
  | {
      type: "hide";
      targets: string[];
      animation?: string;
      runTime?: number;
    }
  | {
      type: "transform";
      from: string;
      to: string;
      animation?: string;
      runTime?: number;
    }
  | {
      type: "emphasize";
      targets: string[];
      animation?: string;
      runTime?: number;
      color?: string;
    }
  | {
      type: "highlight";
      targets: string[];
      color: string;
      runTime?: number;
    }
  | {
      type: "move";
      targets: string[];
      anchor: SceneIRAnchor;
      runTime?: number;
    }
  | {
      type: "wait";
      seconds: number;
    }
  | {
      type: "custom";
      block: string;
      runTime?: number;
    };

export type SceneIRBeat = {
  id: string;
  narration?: string;
  actions: SceneIRAction[];
  holdSeconds?: number;
};

export type SceneIRCustomBlocks = {
  helpers?: string;
  objectFactories?: {
    id: string;
    code: string;
  }[];
  timeline?: {
    id: string;
    code: string;
  }[];
  updaters?: {
    id: string;
    code: string;
  }[];
  rawConstruct?: string;
};

export type SceneIR = {
  metadata: SceneIRMetadata;
  layout: SceneIRLayout;
  objects: SceneIRObject[];
  beats: SceneIRBeat[];
  continuity?: {
    keep?: string[];
  };
  customBlocks?: SceneIRCustomBlocks;
};

export type FailureLayer =
  | "model"
  | "normalization"
  | "validation"
  | "compiler"
  | "runtime"
  | "preflight"
  | "pipeline";

export type NormalizationIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
};

export type NormalizedSceneIR = SceneIR & {
  normalizedFromProvider?: "anthropic" | "openai" | "deepseek" | "kimi";
  normalizationIssues?: NormalizationIssue[];
};

export type PreflightObjectSnapshot = {
  id: string;
  kind: string;
  visible: boolean;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  fontSize?: number;
  relatedTo?: string[];
};

export type PreflightBeatSnapshot = {
  beatId: string;
  timestampSeconds: number;
  objects: PreflightObjectSnapshot[];
};

export type PreflightMetricCategory =
  | "overflow"
  | "overlap"
  | "occupancy"
  | "legibility"
  | "balance"
  | "render";

export type PreflightIssue = {
  sceneId: string;
  severity: "error" | "warning";
  category: PreflightMetricCategory;
  beatId?: string;
  objectIds?: string[];
  message: string;
  suggestedFix?: string;
};

export type PreflightMetrics = {
  overlapScore: number;
  overflowScore: number;
  occupancyScore: number;
  textLegibilityScore: number;
  balanceScore: number;
};

export type PreflightReport = {
  passed: boolean;
  issues: PreflightIssue[];
  metrics: PreflightMetrics;
  keyframes: string[];
  snapshots: PreflightBeatSnapshot[];
};

export type GeneratedScene = {
  sceneId: string;
  className: string;
  designMode: SceneDesignMode;
  sceneIR: NormalizedSceneIR;
  pythonCode: string;
  capabilitiesUsed: string[];
  customBlockCount: number;
  normalizationIssues: NormalizationIssue[];
  preflightReport?: PreflightReport;
};

export type CodegenOutput = {
  scenes: GeneratedScene[];
};

export type ValidateOutput = {
  scenes: GeneratedScene[];
  issues: ValidationIssue[];
};

/* ------------------------------------------------------------------ */
/*  Validation + pipeline event types                                   */
/* ------------------------------------------------------------------ */

export type ValidationIssue = {
  sceneId: string;
  severity: "error" | "warning";
  message: string;
  category?: string;
  code?: string;
  layer?: FailureLayer;
  suggestedFix?: string;
};

export type SceneValidationResult = {
  ok: boolean;
  designMode: SceneDesignMode;
  issues: ValidationIssue[];
};

export type PipelineEvent =
  | { type: "pipeline-started"; jobId: string }
  | { type: "stage-start"; stage: PipelineStage }
  | { type: "stage-progress"; stage: PipelineStage; progress: number; message: string }
  | { type: "stage-complete"; stage: PipelineStage; result: StageResult }
  | { type: "pipeline-complete"; manifest: PipelineManifest }
  | { type: "pipeline-error"; error: string; failedStage?: PipelineStage; layer?: FailureLayer; code?: string }
  | { type: "plan-ready"; plan: PlanOutput }
  | { type: "plan-awaiting-approval"; plan: PlanOutput }
  | { type: "codegen-ready"; scenes: GeneratedScene[] }
  | { type: "scene-rendered"; sceneId: string; clipUrl: string }
  | { type: "scene-generating"; sceneId: string }
  | { type: "scene-ready"; sceneId: string; clipUrl: string; durationSeconds: number; tokenUsage?: SceneTiming["tokenUsage"] }
  | { type: "scene-failed"; sceneId: string; error: string; layer?: FailureLayer; code?: string; tokenUsage?: SceneTiming["tokenUsage"] }
  | { type: "scene-regenerating"; sceneId: string }
  | { type: "validation-report"; scenes: number; passed: number; issues: ValidationIssue[] }
  | { type: "pipeline-paused"; stage: PipelineStage; resumableFrom: PipelineStage }
  | { type: "pipeline-awaiting-confirmation"; failedCount: number; totalScenes: number; canContinue: boolean };

/* ------------------------------------------------------------------ */
/*  Pipeline I/O types                                                  */
/* ------------------------------------------------------------------ */

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
  resumeFrom?: PipelineStage;
  cachedPlan?: PlanOutput;
  cachedScenes?: GeneratedScene[];
  options?: {
    quality?: "l" | "m" | "h";
    skipPostProcess?: boolean;
    provider?: "anthropic" | "openai" | "deepseek" | "kimi";
    model?: string;
    outputMode?: "mp4" | "interactive";
    assets?: string[];
    autoContinue?: boolean;
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
  elapsedMs?: number;
  aggregateWorkMs?: number;
  successfulScenes?: number;
  failedScenes?: number;
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
  outcome: "complete" | "failed" | "aborted" | "interrupted";
  failedStage?: PipelineStage;
  error?: string;
  failureLayer?: FailureLayer;
  failureCode?: string;
  quality: "l" | "m" | "h";
  conceptText?: string;
  latexProblem?: string;
  totalEstimatedCostUSD: number;
  stages: StageTiming[];
};
