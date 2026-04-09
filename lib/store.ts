import { create } from "zustand";

export type AnimationStep = {
  description: string;
  visualHint: string;
  narration: string;
};

export type AnimationPlan = {
  title: string;
  estimatedDuration: number;
  steps: AnimationStep[];
};

type LoadingKey = "ocr" | "plan" | null;

type AppState = {
  uploadedImage: File | null;
  extractedLatex: string | null;
  extractedText: string | null;
  conceptInput: string;
  animationPlan: AnimationPlan | null;
  loading: LoadingKey;

  setUploadedImage: (file: File | null) => void;
  setExtracted: (latex: string | null, text: string | null) => void;
  setConceptInput: (value: string) => void;
  setAnimationPlan: (plan: AnimationPlan | null) => void;
  setLoading: (key: LoadingKey) => void;
  reset: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  uploadedImage: null,
  extractedLatex: null,
  extractedText: null,
  conceptInput: "",
  animationPlan: null,
  loading: null,

  setUploadedImage: (file) => set({ uploadedImage: file }),
  setExtracted: (extractedLatex, extractedText) =>
    set({ extractedLatex, extractedText }),
  setConceptInput: (conceptInput) => set({ conceptInput }),
  setAnimationPlan: (animationPlan) => set({ animationPlan }),
  setLoading: (loading) => set({ loading }),
  reset: () =>
    set({
      uploadedImage: null,
      extractedLatex: null,
      extractedText: null,
      conceptInput: "",
      animationPlan: null,
      loading: null,
    }),
}));
