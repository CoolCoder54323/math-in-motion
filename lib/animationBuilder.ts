import {
  Arrow,
  Axes,
  Circle,
  Create,
  FadeOut,
  GrowFromCenter,
  Mobject,
  NumberLine,
  Rectangle,
  Square,
  Tex,
  Text,
  Write,
  type Animation,
  type Scene,
} from "manim-web";

import type { AnimationPlan, AnimationStep } from "@/lib/store";

/**
 * Sunflower-aligned palette so the canvas matches the editorial theme.
 */
const SUNFLOWER = "#EFB94D";
const UMBER = "#4A2F17";
const ACCENT = "#D85E2A";

export type NarrateFn = (text: string, signal?: AbortSignal) => Promise<void>;

export type BuilderHooks = {
  onStepStart?: (index: number) => void;
  onStepEnd?: (index: number) => void;
  signal?: AbortSignal;
};

type StepRender = {
  mobject: Mobject;
  animation: Animation;
};

const KEYWORDS = {
  equation:
    /equation|formula|=|\+|-|\\frac|\\sum|\\int|\\sqrt|\\cdot|\^|x_/i,
  circle: /\bcircle|pizza|pie\b/i,
  square: /\bsquare|rectangle|grid|block\b/i,
  numberLine: /number ?line|integer line/i,
  line: /\bline\b/i,
  arrow: /\barrow\b/i,
  axes: /\baxes|graph|plot|coordinate\b/i,
  transform: /transform|becomes|turns into|morph|change(s)? into/i,
};

/**
 * Lightweight LaTeX extractor — picks the first inline math span we can find.
 * Plans coming back from the LLM tend to use single-dollar delimiters; we also
 * handle the rarer `\(...\)` form.
 */
function extractLatex(text: string): string | null {
  const dollar = text.match(/\$([^$]+)\$/);
  if (dollar) return dollar[1].trim();
  const paren = text.match(/\\\(([^)]+)\\\)/);
  if (paren) return paren[1].trim();
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Decide which mobject + animation to build for a given step. Deliberately
 * small: a handful of keyword heuristics with a Text fallback. The plan
 * comes from an LLM and the description is prose, so a tiny rule set plus
 * the fallback covers the common cases without pretending to be a real
 * scene compiler.
 */
function interpretStep(step: AnimationStep): StepRender {
  const haystack = `${step.label} ${step.narration}`;

  // Equation / formula path — try to render the LaTeX bit, fall back to the
  // raw description if there's no $...$ marker we can pull out.
  if (KEYWORDS.equation.test(haystack)) {
    const latex = extractLatex(haystack) ?? extractLatex(step.label);
    const tex = new Tex({
      latex: latex ?? truncate(step.label, 60),
      color: UMBER,
      fontSize: 64,
    });
    return { mobject: tex, animation: new Write(tex) };
  }

  if (KEYWORDS.circle.test(haystack)) {
    const circle = new Circle({
      radius: 1.6,
      color: SUNFLOWER,
      fillOpacity: 0.55,
      strokeWidth: 6,
    });
    return { mobject: circle, animation: new Create(circle) };
  }

  if (KEYWORDS.square.test(haystack)) {
    const square = new Square({
      sideLength: 2,
      color: ACCENT,
      fillOpacity: 0.4,
      strokeWidth: 6,
    });
    return { mobject: square, animation: new Create(square) };
  }

  if (KEYWORDS.numberLine.test(haystack)) {
    const line = new NumberLine({
      xRange: [-5, 5, 1],
      length: 9,
      color: UMBER,
      includeNumbers: true,
    });
    return { mobject: line, animation: new Create(line) };
  }

  if (KEYWORDS.arrow.test(haystack)) {
    const arrow = new Arrow({
      start: [0, 0, 0],
      end: [2, 1, 0],
      color: ACCENT,
    });
    return { mobject: arrow, animation: new GrowFromCenter(arrow) };
  }

  if (KEYWORDS.axes.test(haystack)) {
    const axes = new Axes({
      xRange: [-5, 5, 1],
      yRange: [-3, 3, 1],
    });
    return { mobject: axes, animation: new Create(axes) };
  }

  if (KEYWORDS.line.test(haystack)) {
    const line = new Rectangle({
      width: 4,
      height: 0.05,
      color: UMBER,
      fillOpacity: 1,
      strokeWidth: 0,
    });
    return { mobject: line, animation: new Create(line) };
  }

  // Plain prose fallback. Cap the body so a long step doesn't overflow the
  // canvas; the narration still carries the full sentence.
  const text = new Text({
    text: truncate(step.label, 80),
    fontSize: 36,
    color: UMBER,
    textAlign: "center",
  });
  return { mobject: text, animation: new Write(text) };
}

class AbortError extends DOMException {
  constructor() {
    super("aborted", "AbortError");
  }
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortError();
}

/**
 * Walk an animation plan and play it on the supplied scene, narrating each
 * step in parallel with its visual. Steps are cleared between with a fade
 * so the canvas doesn't accumulate mobjects.
 */
export async function buildAnimationFromPlan(
  scene: Scene,
  plan: AnimationPlan,
  narrate: NarrateFn,
  hooks?: BuilderHooks,
): Promise<void> {
  let previous: Mobject | null = null;

  for (let i = 0; i < plan.steps.length; i++) {
    checkAbort(hooks?.signal);
    hooks?.onStepStart?.(i);

    const step = plan.steps[i];
    const { mobject, animation } = interpretStep(step);

    // Clear previous mobject before staging the next one.
    if (previous) {
      try {
        await scene.play(new FadeOut(previous));
      } catch {
        /* fade-out failures shouldn't kill the run */
      }
      try {
        scene.remove(previous);
      } catch {
        /* ignore — scene may have already cleaned it up */
      }
      previous = null;
    }

    checkAbort(hooks?.signal);

    // Visual + voice run together so the narration lands in step with the
    // bloom on screen. We let the longer of the two settle the iteration.
    await Promise.all([
      scene.play(animation),
      narrate(step.narration, hooks?.signal),
    ]);

    previous = mobject;

    checkAbort(hooks?.signal);
    await scene.wait(0.4);
    hooks?.onStepEnd?.(i);
  }

  // Drop the final mobject after a longer hold so viewers see the last frame.
  if (previous) {
    await scene.wait(0.6);
    try {
      await scene.play(new FadeOut(previous));
    } catch {
      /* ignore */
    }
  }
}

