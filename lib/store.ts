import { create } from "zustand";

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

export type PlaybackStatus =
  | "idle"
  | "playing"
  | "paused"
  | "complete"
  | "error";

type LoadingKey = "ocr" | "plan" | null;

type AppState = {
  uploadedImage: File | null;
  extractedLatex: string | null;
  extractedText: string | null;
  conceptInput: string;
  animationPlan: AnimationPlan | null;
  loading: LoadingKey;

  renderStatus: RenderStatus;
  videoUrl: string | null;
  renderError: string | null;

  narrationVoiceURI: string | null;
  narrationRate: number;
  playbackStatus: PlaybackStatus;
  currentStepIndex: number;
  playbackError: string | null;

  setUploadedImage: (file: File | null) => void;
  setExtracted: (latex: string | null, text: string | null) => void;
  setConceptInput: (value: string) => void;
  setAnimationPlan: (plan: AnimationPlan | null) => void;
  setLoading: (key: LoadingKey) => void;

  setRenderStatus: (status: RenderStatus) => void;
  setVideoUrl: (url: string | null) => void;
  setRenderError: (message: string | null) => void;

  setNarrationVoiceURI: (uri: string | null) => void;
  setNarrationRate: (rate: number) => void;
  setPlaybackStatus: (status: PlaybackStatus) => void;
  setCurrentStepIndex: (i: number) => void;
  setPlaybackError: (message: string | null) => void;

  reset: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  uploadedImage: null,
  extractedLatex: null,
  extractedText: null,
  conceptInput: "",
  animationPlan: null,
  loading: null,

  renderStatus: "idle",
  videoUrl: null,
  renderError: null,

  narrationVoiceURI: null,
  narrationRate: 1,
  playbackStatus: "idle",
  currentStepIndex: -1,
  playbackError: null,

  setUploadedImage: (file) => set({ uploadedImage: file }),
  setExtracted: (extractedLatex, extractedText) =>
    set({ extractedLatex, extractedText }),
  setConceptInput: (conceptInput) => set({ conceptInput }),
  setAnimationPlan: (animationPlan) =>
    set({
      animationPlan,
      renderStatus: "idle",
      videoUrl: null,
      renderError: null,
      playbackStatus: "idle",
      currentStepIndex: -1,
      playbackError: null,
    }),
  setLoading: (loading) => set({ loading }),

  setRenderStatus: (renderStatus) => set({ renderStatus }),
  setVideoUrl: (videoUrl) => set({ videoUrl }),
  setRenderError: (renderError) => set({ renderError }),

  setNarrationVoiceURI: (narrationVoiceURI) => set({ narrationVoiceURI }),
  setNarrationRate: (narrationRate) => set({ narrationRate }),
  setPlaybackStatus: (playbackStatus) => set({ playbackStatus }),
  setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }),
  setPlaybackError: (playbackError) => set({ playbackError }),

  reset: () =>
    set({
      uploadedImage: null,
      extractedLatex: null,
      extractedText: null,
      conceptInput: "",
      animationPlan: null,
      loading: null,
      renderStatus: "idle",
      videoUrl: null,
      renderError: null,
      playbackStatus: "idle",
      currentStepIndex: -1,
      playbackError: null,
    }),
}));
