import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCompiledPython } from "./manim-kit";
import type { GeneratedScene, SceneDesignMode, SceneIR } from "./types";

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

export function compileScene(sceneIR: SceneIR, overrideClassName?: string): GeneratedScene {
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
}
