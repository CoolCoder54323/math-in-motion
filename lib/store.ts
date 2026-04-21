import { create } from "zustand";
import type {
  GeneratedScene,
  PipelineMode,
  PipelineStage,
  PlanOutput,
  SceneEntry,
  StageStatus,
  ValidationIssue,
} from "@/lib/pipeline/types";

export type AnimationStep = {
  label: string;
  narration: string;
};

export type AnimationPlan = {
  title: string;
  estimatedDuration: number;
  steps: AnimationStep[];
  manimCode: string;
};

export type RenderStatus = "idle" | "pending" | "rendering" | "complete" | "error";

type LoadingKey = "ocr" | "plan" | "pipeline" | null;

export type PipelineStageState = {
  stage: PipelineStage;
  status: StageStatus;
  progress: number;
  message: string;
};

export type LiveClip = {
  sceneId: string;
  clipUrl: string;
};

export type LiveValidationReport = {
  scenes: number;
  passed: number;
  issues: ValidationIssue[];
};

export type PendingRedo = {
  stage: PipelineStage;
  cachedPlan: PlanOutput | null;
  cachedScenes: GeneratedScene[];
};

/* ------------------------------------------------------------------ */
/*  Workshop per-scene state                                            */
/* ------------------------------------------------------------------ */

export type SceneStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed"
  | "regenerating";

export type SceneState = {
  status: SceneStatus;
  clipUrl?: string;
  durationSeconds?: number;
  error?: string;
};

export type SceneStates = Record<string, SceneState>;

/* ------------------------------------------------------------------ */
/*  Stage lists by mode                                                 */
/* ------------------------------------------------------------------ */

const LESSON_STAGES: PipelineStage[] = [
  "plan",
  "codegen",
  "validate",
  "render",
  "postprocess",
  "compose",
];

const VIZ_STAGES: PipelineStage[] = [
  "codegen",
  "validate",
  "render",
];

export function getInitialStages(mode: PipelineMode): PipelineStageState[] {
  const stages = mode === "viz" ? VIZ_STAGES : LESSON_STAGES;
  return stages.map((stage) => ({
    stage,
    status: "pending" as StageStatus,
    progress: 0,
    message: "",
  }));
}

/* ------------------------------------------------------------------ */
/*  Store definition                                                    */
/* ------------------------------------------------------------------ */

type AppState = {
  uploadedImage: File | null;
  extractedLatex: string | null;
  extractedText: string | null;
  conceptInput: string;
  animationPlan: AnimationPlan | null;
  loading: LoadingKey;

  streamProgress: number;
  streamingSteps: AnimationStep[];
  streamingTitle: string | null;
  abortGeneration: (() => void) | null;

  renderStatus: RenderStatus;
  videoUrl: string | null;
  renderError: string | null;

  // Pipeline state
  pipelineMode: PipelineMode;
  pipelineJobId: string | null;
  pipelineStages: PipelineStageState[];
  currentStage: PipelineStage | null;
  pipelineError: string | null;

  // Live artifacts
  livePlan: PlanOutput | null;
  liveScenes: GeneratedScene[];
  liveClips: LiveClip[];
  validationReport: LiveValidationReport | null;
  isPaused: boolean;

  // Workshop (scene-centric) state
  sceneStates: SceneStates;
  /** True between plan-awaiting-approval and user clicking "Start building". */
  planApprovalPending: boolean;
  /** True while the approve-plan POST is in-flight. */
  approvalLoading: boolean;
  /** Last approval error message, if any. */
  approvalError: string | null;

  // Redo support
  pendingRedo: PendingRedo | null;

  setUploadedImage: (file: File | null) => void;
  setExtracted: (latex: string | null, text: string | null) => void;
  setConceptInput: (value: string) => void;
  setAnimationPlan: (plan: AnimationPlan | null) => void;
  setLoading: (key: LoadingKey) => void;

  setStreamProgress: (n: number) => void;
  setStreamingSteps: (steps: AnimationStep[]) => void;
  setStreamingTitle: (title: string | null) => void;
  setAbortGeneration: (fn: (() => void) | null) => void;

  setRenderStatus: (status: RenderStatus) => void;
  setVideoUrl: (url: string | null) => void;
  setRenderError: (message: string | null) => void;

  // Pipeline actions
  setPipelineMode: (mode: PipelineMode) => void;
  setPipelineJobId: (id: string | null) => void;
  setPipelineStages: (stages: PipelineStageState[]) => void;
  updatePipelineStage: (stage: PipelineStage, update: Partial<PipelineStageState>) => void;
  setCurrentStage: (stage: PipelineStage | null) => void;
  setPipelineError: (error: string | null) => void;

  // Live artifact actions
  setLivePlan: (plan: PlanOutput | null) => void;
  setLiveScenes: (scenes: GeneratedScene[]) => void;
  addLiveClip: (clip: LiveClip) => void;
  setValidationReport: (report: LiveValidationReport | null) => void;
  setPaused: (paused: boolean) => void;

  // Workshop actions
  setPlanApprovalPending: (pending: boolean) => void;
  /** Replace the draft plan; called from editable scene cards / title. */
  updatePlanDraft: (plan: PlanOutput) => void;
  /** Patch a single scene inside livePlan (description, mathContent, narration). */
  updateSceneDraft: (sceneId: string, patch: Partial<SceneEntry>) => void;
  /** Patch a single AnimationStep (narration at a plan-index). */
  updateStepDraft: (index: number, patch: Partial<{ label: string; narration: string }>) => void;
  /** POST approve-plan for the current pipelineJobId, clear pending flag. */
  approvePlan: () => Promise<void>;
  /** POST regenerate-scene for the given sceneId. */
  regenerateScene: (sceneId: string) => Promise<void>;
  /** Set a scene-state entry (used by SSE handlers). */
  setSceneState: (sceneId: string, state: Partial<SceneState>) => void;
  /** Seed every plan scene as pending on plan-ready. */
  initSceneStatesFromPlan: (plan: PlanOutput) => void;

  // Redo actions
  setPendingRedo: (redo: PendingRedo | null) => void;
  triggerRedoFromStage: (stage: PipelineStage) => void;

  // Resume from gallery
  resumeFromGallery: (params: {
    jobId: string;
    conceptText: string;
    mode: PipelineMode;
    status: "awaiting-approval" | "building" | "complete" | "failed" | "generating";
    currentStage: PipelineStage | null;
    plan: PlanOutput | null;
    videoUrl: string | null;
  }) => void;

  resetPipeline: () => void;
  resetPipelineFromStage: (stage: PipelineStage) => void;
  reset: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  uploadedImage: null,
  extractedLatex: null,
  extractedText: null,
  conceptInput: "",
  animationPlan: null,
  loading: null,

  streamProgress: 0,
  streamingSteps: [],
  streamingTitle: null,
  abortGeneration: null,

  renderStatus: "idle",
  videoUrl: null,
  renderError: null,

  pipelineMode: "lesson",
  pipelineJobId: null,
  pipelineStages: getInitialStages("lesson"),
  currentStage: null,
  pipelineError: null,

  livePlan: null,
  liveScenes: [],
  liveClips: [],
  validationReport: null,
  isPaused: false,
  sceneStates: {},
  planApprovalPending: false,
  approvalLoading: false,
  approvalError: null,
  pendingRedo: null,

  setUploadedImage: (file) => set({ uploadedImage: file }),
  setExtracted: (extractedLatex, extractedText) =>
    set({ extractedLatex, extractedText }),
  setConceptInput: (conceptInput) => set({ conceptInput }),
  setAnimationPlan: (animationPlan) =>
    set({
      animationPlan,
      streamProgress: 0,
      streamingSteps: [],
      streamingTitle: null,
      renderStatus: "idle",
      videoUrl: null,
      renderError: null,
    }),
  setLoading: (loading) => set({ loading }),

  setStreamProgress: (streamProgress) => set({ streamProgress }),
  setStreamingSteps: (streamingSteps) => set({ streamingSteps }),
  setStreamingTitle: (streamingTitle) => set({ streamingTitle }),
  setAbortGeneration: (abortGeneration) => set({ abortGeneration }),

  setRenderStatus: (renderStatus) => set({ renderStatus }),
  setVideoUrl: (videoUrl) => set({ videoUrl }),
  setRenderError: (renderError) => set({ renderError }),

  setPipelineMode: (pipelineMode) =>
    set({
      pipelineMode,
      pipelineStages: getInitialStages(pipelineMode),
    }),
  setPipelineJobId: (pipelineJobId) => set({ pipelineJobId }),
  setPipelineStages: (pipelineStages) => set({ pipelineStages }),
  updatePipelineStage: (stage, update) =>
    set((state) => ({
      pipelineStages: state.pipelineStages.map((s) =>
        s.stage === stage ? { ...s, ...update } : s,
      ),
    })),
  setCurrentStage: (currentStage) => set({ currentStage }),
  setPipelineError: (pipelineError) => set({ pipelineError }),

  setLivePlan: (livePlan) => set({ livePlan }),
  setLiveScenes: (liveScenes) => set({ liveScenes }),
  addLiveClip: (clip) =>
    set((state) => ({ liveClips: [...state.liveClips, clip] })),
  setValidationReport: (validationReport) => set({ validationReport }),
  setPaused: (isPaused) => set({ isPaused }),

  // ── Workshop actions ───────────────────────────────────────────────
  setPlanApprovalPending: (planApprovalPending) => set({ planApprovalPending }),

  updatePlanDraft: (livePlan) => set({ livePlan }),

  updateSceneDraft: (sceneId, patch) =>
    set((state) => {
      if (!state.livePlan) return state;
      return {
        livePlan: {
          ...state.livePlan,
          sceneBreakdown: state.livePlan.sceneBreakdown.map((s) =>
            s.sceneId === sceneId ? { ...s, ...patch } : s,
          ),
        },
      };
    }),

  updateStepDraft: (index, patch) =>
    set((state) => {
      if (!state.livePlan) return state;
      return {
        livePlan: {
          ...state.livePlan,
          steps: state.livePlan.steps.map((s, i) =>
            i === index ? { ...s, ...patch } : s,
          ),
        },
      };
    }),

  approvePlan: async () => {
    const { pipelineJobId, livePlan } = useAppStore.getState();
    if (!pipelineJobId || !livePlan) return;
    set({ approvalLoading: true, approvalError: null });
    try {
      const res = await fetch(`/api/pipeline/${pipelineJobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve-plan", plan: livePlan }),
      });
      if (res.ok) {
        set({ planApprovalPending: false, approvalLoading: false });
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        set({
          approvalLoading: false,
          approvalError: data.error ?? `Server error (${res.status})`,
        });
      }
    } catch {
      set({
        approvalLoading: false,
        approvalError: "Network error \u2014 please try again.",
      });
    }
  },

  regenerateScene: async (sceneId) => {
    const { pipelineJobId, livePlan } = useAppStore.getState();
    if (!pipelineJobId) return;

    // If there's a plan on hand, push an update-plan first so the server's
    // in-memory plan reflects any local edits. This makes regenerate
    // respect the user's current scene description/narration.
    if (livePlan) {
      try {
        await fetch(`/api/pipeline/${pipelineJobId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-plan", plan: livePlan }),
        });
      } catch {
        // best effort
      }
    }

    try {
      await fetch(`/api/pipeline/${pipelineJobId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate-scene", sceneId }),
      });
      // Optimistic UI: mark as regenerating until the server echoes
      // scene-regenerating / scene-ready.
      set((state) => ({
        sceneStates: {
          ...state.sceneStates,
          [sceneId]: {
            ...(state.sceneStates[sceneId] ?? { status: "pending" }),
            status: "regenerating",
            error: undefined,
          },
        },
      }));
    } catch {
      // no-op
    }
  },

  setSceneState: (sceneId, patch) =>
    set((state) => ({
      sceneStates: {
        ...state.sceneStates,
        [sceneId]: {
          ...(state.sceneStates[sceneId] ?? { status: "pending" }),
          ...patch,
        },
      },
    })),

  initSceneStatesFromPlan: (plan) =>
    set(() => ({
      sceneStates: Object.fromEntries(
        plan.sceneBreakdown.map((s) => [s.sceneId, { status: "pending" as SceneStatus }]),
      ),
    })),

  setPendingRedo: (pendingRedo) => set({ pendingRedo }),
  triggerRedoFromStage: (stage) =>
    set((state) => ({
      pendingRedo: {
        stage,
        cachedPlan: state.livePlan,
        cachedScenes: state.liveScenes,
      },
    })),

  resumeFromGallery: (params) => {
    const {
      jobId,
      conceptText,
      mode,
      status,
      currentStage,
      plan,
      videoUrl,
    } = params;

    const stages = getInitialStages(mode);

    // Update each stage's status based on the resume point
    const stageOrder = mode === "viz"
      ? (["codegen", "validate", "render"] as PipelineStage[])
      : (["plan", "codegen", "validate", "render", "postprocess", "compose"] as PipelineStage[]);

    const resumeStageIndex = currentStage ? stageOrder.indexOf(currentStage) : 0;

    const updatedStages = stages.map((s) => {
      const sIdx = stageOrder.indexOf(s.stage);
      if (sIdx < resumeStageIndex) {
        return { ...s, status: "success" as StageStatus, progress: 100 };
      }
      if (s.stage === currentStage) {
        return { ...s, status: "running" as StageStatus, progress: 50 };
      }
      return s;
    });

    set({
      pipelineMode: mode,
      pipelineJobId: jobId,
      pipelineStages: updatedStages,
      currentStage,
      pipelineError: null,
      conceptInput: conceptText,
      loading: status === "complete" || status === "failed" ? null : "pipeline",
      livePlan: plan,
      liveScenes: [],
      liveClips: [],
      validationReport: null,
      isPaused: false,
      sceneStates: plan ? Object.fromEntries(
        plan.sceneBreakdown.map((s) => [s.sceneId, { status: "pending" as SceneStatus }]),
      ) : {},
      planApprovalPending: status === "awaiting-approval",
      approvalLoading: false,
      approvalError: null,
      pendingRedo: null,
      videoUrl: videoUrl ?? null,
    });
  },

  resetPipeline: () =>
    set((state) => ({
      pipelineJobId: null,
      pipelineStages: getInitialStages(state.pipelineMode),
      currentStage: null,
      pipelineError: null,
      videoUrl: null,
      renderError: null,
      renderStatus: "idle",
      livePlan: null,
      liveScenes: [],
      liveClips: [],
      validationReport: null,
      isPaused: false,
      sceneStates: {},
      planApprovalPending: false,
      approvalLoading: false,
      approvalError: null,
      pendingRedo: null,
    })),

  resetPipelineFromStage: (stage) =>
    set((state) => {
      const stages = state.pipelineMode === "viz"
        ? (["codegen", "validate", "render"] as PipelineStage[])
        : (["plan", "codegen", "validate", "render", "postprocess", "compose"] as PipelineStage[]);
      const stageIndex = stages.indexOf(stage);

      return {
        pipelineStages: state.pipelineStages.map((s) => {
          const sIdx = stages.indexOf(s.stage);
          if (sIdx >= stageIndex) {
            return { ...s, status: "pending" as StageStatus, progress: 0, message: "" };
          }
          return s;
        }),
        currentStage: null,
        pipelineError: null,
        videoUrl: null,
        renderError: null,
        renderStatus: "idle",
        // Keep livePlan if we're resuming after plan
        livePlan: stageIndex > 0 ? state.livePlan : null,
        liveScenes: stageIndex > 1 ? state.liveScenes : [],
        liveClips: [],
        validationReport: stageIndex > 2 ? state.validationReport : null,
        isPaused: false,
      };
    }),

  reset: () =>
    set({
      uploadedImage: null,
      extractedLatex: null,
      extractedText: null,
      conceptInput: "",
      animationPlan: null,
      loading: null,
      streamProgress: 0,
      streamingSteps: [],
      streamingTitle: null,
      abortGeneration: null,
      renderStatus: "idle",
      videoUrl: null,
      renderError: null,
      pipelineMode: "lesson",
      pipelineJobId: null,
      pipelineStages: getInitialStages("lesson"),
      currentStage: null,
      pipelineError: null,
      livePlan: null,
      liveScenes: [],
      liveClips: [],
      validationReport: null,
      isPaused: false,
      sceneStates: {},
      planApprovalPending: false,
      approvalLoading: false,
      approvalError: null,
      pendingRedo: null,
    }),
}));
