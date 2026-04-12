"use client";

import { useCallback, useEffect, useRef } from "react";
import { ManimScene, type Scene } from "manim-web/react";

import { buildAnimationFromPlan, type NarrateFn } from "@/lib/animationBuilder";
import type { AnimationPlan } from "@/lib/store";

type Props = {
  plan: AnimationPlan;
  narrate: NarrateFn;
  isPlaying: boolean;
  onStepChange: (i: number) => void;
  onComplete: () => void;
  onError: (message: string) => void;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const CANVAS_BG = "#FAF4E4";

/**
 * AnimationEngine — mounts the manim-web scene and runs the plan through
 * `buildAnimationFromPlan`. Owns the AbortController so flipping isPlaying
 * off cleanly halts whatever's currently in flight.
 */
export function AnimationEngine({
  plan,
  narrate,
  isPlaying,
  onStepChange,
  onComplete,
  onError,
}: Props) {
  const abortRef = useRef<AbortController | null>(null);

  // Hold the latest callbacks in refs so onSceneReady can stay stable —
  // ManimScene only calls it once when the underlying Scene mounts.
  const narrateRef = useRef(narrate);
  const onStepChangeRef = useRef(onStepChange);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const planRef = useRef(plan);
  useEffect(() => {
    narrateRef.current = narrate;
    onStepChangeRef.current = onStepChange;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    planRef.current = plan;
  }, [narrate, onStepChange, onComplete, onError, plan]);

  const onSceneReady = useCallback(async (scene: Scene) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await buildAnimationFromPlan(
        scene,
        planRef.current,
        (text, signal) => narrateRef.current(text, signal ?? ctrl.signal),
        {
          signal: ctrl.signal,
          onStepStart: (i) => onStepChangeRef.current(i),
        },
      );
      if (!ctrl.signal.aborted) onCompleteRef.current();
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      onErrorRef.current(
        err instanceof Error ? err.message : "Render failed",
      );
    }
  }, []);

  // When the parent flips isPlaying off (Stop pressed), abort the in-flight
  // run so the build loop bails out and the scene unmounts cleanly.
  useEffect(() => {
    if (!isPlaying) {
      abortRef.current?.abort();
    }
  }, [isPlaying]);

  // Tear down on unmount too — cancels any pending narration as well, since
  // the builder propagates the signal into the speak() call.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!isPlaying) {
    return (
      <div
        className="relative aspect-video w-full overflow-hidden rounded-[24px] bg-[#FAF4E4]"
        style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
      />
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-[24px] bg-[#FAF4E4]"
      style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
    >
      <ManimScene
        // Re-mount whenever the plan changes so we get a totally fresh Scene.
        key={plan.title}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        backgroundColor={CANVAS_BG}
        onSceneReady={onSceneReady}
        className="h-full w-full"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
        }}
      />
    </div>
  );
}
