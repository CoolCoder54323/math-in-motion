"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useTimedProgress — smooth progress bar driven by elapsed time.
 *
 * Behavior:
 *  - When `isActive` becomes true, progress from 0 → 99% over `estimatedMs`
 *    using an ease-out curve (fast start, gradual slowdown).
 *  - If `isActive` is still true after `estimatedMs`, stall at 99%.
 *  - When `isActive` flips to false, rush to 100% immediately.
 *  - After `holdMs` (default 600ms) at 100%, reset to 0%.
 */

const STALL_PERCENT = 99;
const DEFAULT_HOLD_MS = 600;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useTimedProgress(
  isActive: boolean,
  estimatedMs: number,
  holdMs: number = DEFAULT_HOLD_MS,
): number {
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    if (startTimeRef.current === null) return;

    const elapsed = performance.now() - startTimeRef.current;
    const raw = Math.min(elapsed / estimatedMs, 1);
    const eased = easeOutCubic(raw);
    const value = Math.min(eased * STALL_PERCENT, STALL_PERCENT);

    setProgress(value);

    if (raw < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [estimatedMs]);

  useEffect(() => {
    if (isActive) {
      startTimeRef.current = performance.now();
      setProgress(0);
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
      if (startTimeRef.current !== null) {
        setProgress(100);
        holdTimerRef.current = setTimeout(() => {
          setProgress(0);
          startTimeRef.current = null;
        }, holdMs);
      }
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, [isActive, estimatedMs, holdMs, tick]);

  return progress;
}
