import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCompiledPython } from "./manim-kit";
import type { GeneratedScene, NormalizedSceneIR, SceneDesignMode, SceneIR } from "./types";

export function sceneIdToClassName(sceneId: string): string {
  return sceneId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("") || "LessonScene";
}

export function countCustomBlocks(sceneIR: SceneIR): number {
  const blocks = sceneIR.customBlocks;
  if (!blocks) return 0;
  return [
    blocks.helpers ? 1 : 0,
    blocks.rawConstruct ? 1 : 0,
    ...(blocks.objectFactories ?? []).map(() => 1),
    ...(blocks.timeline ?? []).map(() => 1),
    ...(blocks.updaters ?? []).map(() => 1),
  ].reduce((sum, value) => sum + value, 0);
}

export function inferDesignMode(sceneIR: SceneIR): SceneDesignMode {
  if (sceneIR.customBlocks?.rawConstruct?.trim()) return "raw";
  return countCustomBlocks(sceneIR) > 0 ? "hybrid" : "ir";
}

const CREATIVE_PRIMITIVE_PREFIXES = [
  "compound.number_line_walk",
  "compound.grouped_dots",
  "compound.split_shape",
  "compound.trace_path",
  "compound.grid_fill",
  "compound.equation_ladder",
  "compound.story_stage",
  "compound.character",
  "compound.pizza_ratio",
  "compound.array_grid",
  "compound.percent_grid",
  "compound.fraction_percent_board",
  "compound.misconception_panel",
];

function countCreativePrimitives(sceneIR: SceneIR): number {
  return sceneIR.objects.filter((objectSpec) =>
    CREATIVE_PRIMITIVE_PREFIXES.includes(objectSpec.kind),
  ).length;
}

function countMotionRecipes(sceneIR: SceneIR): number {
  return sceneIR.beats.reduce(
    (sum, beat) => sum + beat.actions.filter((action) => action.type === "recipe").length,
    0,
  );
}

function boringScore(sceneIR: SceneIR): number {
  let score = 0;
  const calloutCount = sceneIR.objects.filter((objectSpec) => objectSpec.kind === "compound.callout_card").length;
  const creativeCount = countCreativePrimitives(sceneIR);
  const motionCount = countMotionRecipes(sceneIR);
  const transformCount = sceneIR.beats.reduce(
    (sum, beat) => sum + beat.actions.filter((action) => action.type === "transform" || action.type === "custom").length,
    0,
  );
  if (sceneIR.metadata.fallbackReason) score += 0.35;
  if (calloutCount > 0 && calloutCount >= sceneIR.objects.length / 2) score += 0.25;
  if (sceneIR.objects.length < 4) score += 0.15;
  if (sceneIR.beats.length < 4) score += 0.15;
  if (creativeCount === 0) score += 0.2;
  if (motionCount === 0 && transformCount === 0) score += 0.2;
  return Math.min(1, score);
}

export function compileScene(sceneIR: NormalizedSceneIR, overrideClassName?: string): GeneratedScene {
  const className = overrideClassName ?? sceneIdToClassName(sceneIR.metadata.sceneId);
  const designMode = inferDesignMode(sceneIR);
  const pythonCode = buildCompiledPython(sceneIR, className, designMode);
  const capabilitiesUsed = Array.from(
    new Set(sceneIR.objects.map((objectSpec) => objectSpec.kind)),
  ).sort();

  return {
    sceneId: sceneIR.metadata.sceneId,
    className,
    designMode,
    sceneIR,
    pythonCode,
    capabilitiesUsed,
    customBlockCount: countCustomBlocks(sceneIR),
    normalizationIssues: sceneIR.normalizationIssues ?? [],
    usedFallback: Boolean(sceneIR.metadata.fallbackReason),
    renderStatus: "unchecked",
    qualityStatus: sceneIR.metadata.qualityStatus ?? "unchecked",
    creativePrimitiveCount: countCreativePrimitives(sceneIR),
    motionRecipeCount: countMotionRecipes(sceneIR),
    boringScore: boringScore(sceneIR),
  };
}

export function persistCompiledScene(jobDir: string, scene: GeneratedScene): void {
  mkdirSync(join(jobDir, "scenes"), { recursive: true });
  mkdirSync(join(jobDir, "scene-ir"), { recursive: true });
  writeFileSync(join(jobDir, "scenes", `${scene.sceneId}.py`), scene.pythonCode, "utf-8");
  writeFileSync(
    join(jobDir, "scene-ir", `${scene.sceneId}.json`),
    JSON.stringify(scene.sceneIR, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(jobDir, "scene-ir", `${scene.sceneId}.normalized.json`),
    JSON.stringify(
      {
        designMode: scene.designMode,
        normalizedFromProvider: scene.sceneIR.normalizedFromProvider,
        normalizationIssues: scene.normalizationIssues,
        usedFallback: scene.usedFallback,
        renderStatus: scene.renderStatus,
        qualityStatus: scene.qualityStatus,
        creativePrimitiveCount: scene.creativePrimitiveCount,
        motionRecipeCount: scene.motionRecipeCount,
        boringScore: scene.boringScore,
        sceneIR: scene.sceneIR,
      },
      null,
      2,
    ),
    "utf-8",
  );
}
