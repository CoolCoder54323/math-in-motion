import type { PlanOutput, SceneEntry, SceneIR, PipelineEvent } from "./types";

const SCENE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseSceneId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return SCENE_ID_RE.test(trimmed) ? trimmed : null;
}

export function isValidSceneId(input: unknown): input is string {
  return parseSceneId(input) !== null;
}

function hasUniqueSceneIds(sceneBreakdown: SceneEntry[]): boolean {
  const seen = new Set<string>();
  for (const scene of sceneBreakdown) {
    if (seen.has(scene.sceneId)) return false;
    seen.add(scene.sceneId);
  }
  return true;
}

function validateStepRichness(plan: PlanOutput): boolean {
  if (!Array.isArray(plan.steps) || plan.steps.length < 3 || plan.steps.length > 12) {
    return false;
  }
  return plan.steps.every((step) => {
    const labelWords = step.label.trim().split(/\s+/).filter(Boolean).length;
    const narrationWords = step.narration.trim().split(/\s+/).filter(Boolean).length;
    return labelWords >= 2 && narrationWords >= 3;
  });
}

export function isValidPlanOutput(input: unknown): input is PlanOutput {
  if (!input || typeof input !== "object") return false;
  const plan = input as Record<string, unknown>;

  if (typeof plan.title !== "string" || !plan.title.trim()) return false;
  if (typeof plan.estimatedDuration !== "number" || !Number.isFinite(plan.estimatedDuration)) return false;
  if (plan.estimatedDuration < 30 || plan.estimatedDuration > 180) return false;
  if (!Array.isArray(plan.steps) || !Array.isArray(plan.sceneBreakdown) || plan.sceneBreakdown.length === 0) return false;

  const stepsAreValid = (plan.steps as Record<string, unknown>[]).every((s) => (
    typeof s.label === "string" && s.label.trim().length > 0
    && typeof s.narration === "string" && s.narration.trim().length > 0
  ));
  if (!stepsAreValid) return false;

  const sceneBreakdown = (plan.sceneBreakdown as Record<string, unknown>[]).map((s) => ({
    sceneId: String(s.sceneId ?? ""),
    description: String(s.description ?? ""),
    mathContent: String(s.mathContent ?? ""),
    estimatedSeconds: Number(s.estimatedSeconds ?? NaN),
  }));

  const scenesAreValid = sceneBreakdown.every((s) => (
    isValidSceneId(s.sceneId)
    && s.description.trim().length > 0
    && s.mathContent.trim().length > 0
    && Number.isFinite(s.estimatedSeconds)
    && s.estimatedSeconds >= 5
    && s.estimatedSeconds <= 25
  ));
  if (!scenesAreValid) return false;

  if (!hasUniqueSceneIds(sceneBreakdown as SceneEntry[])) return false;

  const sum = sceneBreakdown.reduce((acc, s) => acc + s.estimatedSeconds, 0);
  if (sum < 30 || sum > 180) return false;

  return validateStepRichness(plan as PlanOutput);
}

export function isValidSceneIR(input: unknown): input is SceneIR {
  if (!input || typeof input !== "object") return false;
  const scene = input as SceneIR;
  if (!scene.metadata || !isValidSceneId(scene.metadata.sceneId)) return false;
  if (!scene.layout || !Array.isArray(scene.layout.zones)) return false;
  if (!Array.isArray(scene.objects) || !Array.isArray(scene.beats)) return false;
  return true;
}

export function isValidPipelineEvent(input: unknown): input is PipelineEvent {
  if (!input || typeof input !== "object") return false;
  const event = input as { type?: unknown };
  return typeof event.type === "string" && event.type.length > 0;
}
