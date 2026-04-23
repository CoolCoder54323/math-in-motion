import type { SceneEntry } from "../types";

export type PedagogyIssue = {
  sceneId: string;
  severity: "error" | "warning";
  rule: string;
  message: string;
  fix: string;
};

export function lintScenePedagogy(
  code: string,
  scene: SceneEntry,
): PedagogyIssue[] {
  const issues: PedagogyIssue[] = [];

  // Rule P1: predict scenes must have self.wait(>=2.0) before any reveal
  if (scene.hasPredictPause) {
    const waitMatches = [...code.matchAll(/self\.wait\(\s*([0-9.]+)\s*\)/g)];
    const hasLongWait = waitMatches.some((m) => parseFloat(m[1]) >= 2.0);
    if (!hasLongWait) {
      issues.push({
        sceneId: scene.sceneId,
        severity: "error",
        rule: "P1",
        message: `Predict scene "${scene.sceneId}" has no self.wait(>=2.0) — student has no thinking time`,
        fix: "After showing the question text on screen, add self.wait(3.0) BEFORE any reveal animations. This wait is mandatory.",
      });
    }
  }

  // Rule P2: total wait time must be >= 15% of estimatedSeconds
  const allWaits = [...code.matchAll(/self\.wait\(\s*([0-9.]+)\s*\)/g)];
  const totalWait = allWaits.reduce((sum, m) => sum + parseFloat(m[1]), 0);
  const minWait = scene.estimatedSeconds * 0.15;
  if (totalWait < minWait) {
    issues.push({
      sceneId: scene.sceneId,
      severity: "warning",
      rule: "P2",
      message: `Total wait time ${totalWait.toFixed(1)}s is less than 15% of planned ${scene.estimatedSeconds}s`,
      fix: `Add self.wait() calls between animation groups. Total pauses should be at least ${minWait.toFixed(1)}s.`,
    });
  }

  // Rule P3: address_misconception scenes must use ORANGE color
  if (scene.role === "address_misconception") {
    if (!code.includes("ORANGE")) {
      issues.push({
        sceneId: scene.sceneId,
        severity: "error",
        rule: "P3",
        message: `Misconception scene "${scene.sceneId}" does not use ORANGE to mark the wrong approach`,
        fix: "Show the incorrect approach first using ORANGE color. Then cross it out (use FadeOut or strikethrough). Then show the correct approach in the normal color.",
      });
    }
  }

  // Rule P4: introduce scenes should label math objects
  if (scene.role === "introduce") {
    const mathObjectCount = [...code.matchAll(/MathTex\s*\(/g)].length;
    const labelCount = [...code.matchAll(/\bT\s*\(/g)].length;
    if (mathObjectCount > 0 && labelCount === 0) {
      issues.push({
        sceneId: scene.sceneId,
        severity: "warning",
        rule: "P4",
        message: `Introduce scene has ${mathObjectCount} MathTex object(s) but no T() text labels`,
        fix: "Add a T() label next to each MathTex object explaining what it represents (e.g., 'numerator', 'denominator').",
      });
    }
  }

  // Rule P5: no more than 5 consecutive self.play() calls without a self.wait()
  const playWaitSequence = [...(code.matchAll(/self\.(play|wait)\s*\(/g))].map((m) => m[1]);
  let consecutivePlays = 0;
  let exceededOnce = false;
  for (const call of playWaitSequence) {
    if (call === "play") {
      consecutivePlays++;
      if (consecutivePlays > 5 && !exceededOnce) {
        exceededOnce = true;
        issues.push({
          sceneId: scene.sceneId,
          severity: "warning",
          rule: "P5",
          message: "More than 5 consecutive self.play() calls without a pause — cognitively overwhelming",
          fix: "Add self.wait(0.5) after every 2-3 animation steps to let the student absorb what just happened.",
        });
      }
    } else {
      consecutivePlays = 0;
    }
  }

  return issues;
}