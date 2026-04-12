"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppStore } from "@/lib/store";

/**
 * useNarration — owns everything `window.speechSynthesis` related.
 *
 * The browser's TTS API is awkward (voice list loads async on Chrome,
 * synchronously on Safari; cancel doesn't always fire onend; the spoken
 * voice has to be a live `SpeechSynthesisVoice` object, not a string).
 * This hook hides that mess and returns a small, promise-friendly surface
 * the animation builder can `await speak(...)` against.
 */
export type SpeakOptions = {
  rate?: number;
  signal?: AbortSignal;
};

export type UseNarration = {
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  isSpeaking: boolean;
  isSupported: boolean;
  speak: (text: string, opts?: SpeakOptions) => Promise<void>;
  stop: () => void;
};

const isBrowserWithSpeech = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

function pickDefaultVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const preferredNames = /samantha|jenny|female|aria|nova/i;
  const enUS = voices.filter((v) => /en[-_]us/i.test(v.lang));
  const named = enUS.find((v) => preferredNames.test(v.name));
  if (named) return named;
  if (enUS.length > 0) return enUS[0];
  const anyEn = voices.find((v) => /^en/i.test(v.lang));
  return anyEn ?? voices[0];
}

export function useNarration(): UseNarration {
  const voiceURI = useAppStore((s) => s.narrationVoiceURI);
  const setVoiceURI = useAppStore((s) => s.setNarrationVoiceURI);
  const rate = useAppStore((s) => s.narrationRate);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported] = useState(isBrowserWithSpeech);

  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  // Subscribe to the voice list. Chrome populates it asynchronously via
  // the `voiceschanged` event; Safari has it on first call.
  useEffect(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;

    const refresh = () => {
      const list = synth.getVoices();
      if (list.length > 0) setVoices(list);
    };

    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
    };
  }, [isSupported]);

  // First time we have voices, write a sensible default back to the store.
  useEffect(() => {
    if (voices.length === 0) return;
    if (voiceURI) return;
    const def = pickDefaultVoice(voices);
    if (def) setVoiceURI(def.voiceURI);
  }, [voices, voiceURI, setVoiceURI]);

  const selectedVoice = useMemo(() => {
    if (voices.length === 0) return null;
    if (!voiceURI) return pickDefaultVoice(voices);
    return voices.find((v) => v.voiceURI === voiceURI) ?? voices[0];
  }, [voices, voiceURI]);

  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, opts?: SpeakOptions): Promise<void> => {
      if (!isSupported) return Promise.resolve();
      if (!text.trim()) return Promise.resolve();

      return new Promise((resolve, reject) => {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);
        const v = selectedVoiceRef.current;
        if (v) utterance.voice = v;
        utterance.rate = opts?.rate ?? rateRef.current ?? 1;
        utterance.pitch = 1.05;

        let settled = false;
        const cleanup = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          if (settled) return;
          settled = true;
          synth.cancel();
          setIsSpeaking(false);
          cleanup();
          reject(new DOMException("aborted", "AbortError"));
        };

        utterance.onend = () => {
          if (settled) return;
          settled = true;
          setIsSpeaking(false);
          cleanup();
          resolve();
        };
        utterance.onerror = (event) => {
          if (settled) return;
          settled = true;
          setIsSpeaking(false);
          cleanup();
          // The browser fires an "interrupted" error when cancel() is called
          // mid-utterance — treat that as a clean stop, not a hard failure.
          if (event.error === "interrupted" || event.error === "canceled") {
            resolve();
          } else {
            reject(new Error(`Speech synthesis failed: ${event.error}`));
          }
        };

        if (opts?.signal?.aborted) {
          onAbort();
          return;
        }
        opts?.signal?.addEventListener("abort", onAbort);

        setIsSpeaking(true);
        synth.speak(utterance);
      });
    },
    [isSupported],
  );

  // Make sure we don't leave audio running after a route change / unmount.
  useEffect(() => {
    if (!isSupported) return;
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  return { voices, selectedVoice, isSpeaking, isSupported, speak, stop };
}
