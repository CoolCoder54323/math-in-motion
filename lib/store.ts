import { create } from "zustand";
import type { PipelineStage, StageStatus } from "@/lib/pipeline/types";

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
  pipelineJobId: string | null;
  pipelineStages: PipelineStageState[];
  currentStage: PipelineStage | null;
  pipelineError: string | null;

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
  setPipelineJobId: (id: string | null) => void;
  setPipelineStages: (stages: PipelineStageState[]) => void;
  updatePipelineStage: (stage: PipelineStage, update: Partial<PipelineStageState>) => void;
  setCurrentStage: (stage: PipelineStage | null) => void;
  setPipelineError: (error: string | null) => void;
  resetPipeline: () => void;

  reset: () => void;
};

const INITIAL_PIPELINE_STAGES: PipelineStageState[] = [
  { stage: "plan", status: "pending", progress: 0, message: "" },
  { stage: "codegen", status: "pending", progress: 0, message: "" },
  { stage: "validate", status: "pending", progress: 0, message: "" },
  { stage: "render", status: "pending", progress: 0, message: "" },
  { stage: "postprocess", status: "pending", progress: 0, message: "" },
  { stage: "compose", status: "pending", progress: 0, message: "" },
];

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

  pipelineJobId: null,
  pipelineStages: INITIAL_PIPELINE_STAGES.map((s) => ({ ...s })),
  currentStage: null,
  pipelineError: null,

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
  resetPipeline: () =>
    set({
      pipelineJobId: null,
      pipelineStages: INITIAL_PIPELINE_STAGES.map((s) => ({ ...s })),
      currentStage: null,
      pipelineError: null,
      videoUrl: null,
      renderError: null,
      renderStatus: "idle",
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
      pipelineJobId: null,
      pipelineStages: INITIAL_PIPELINE_STAGES.map((s) => ({ ...s })),
      currentStage: null,
      pipelineError: null,
    }),
}));
