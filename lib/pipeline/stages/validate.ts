import { execFile } from "node:child_process";
import type { PipelineContext, PipelineStageHandler } from "../stage";
import type {
  CodegenOutput,
  GeneratedScene,
  PipelineEvent,
  ValidateOutput,
  ValidationIssue,
} from "../types";
import { preflightScene } from "./preflight";

const ALWAYS_BANNED_PATTERNS = [
  { pattern: /open\s*\(/g, msg: "File I/O (open()) is not allowed in scenes" },
  { pattern: /requests\./g, msg: "HTTP requests are not allowed in scenes" },
  { pattern: /subprocess\./g, msg: "subprocess calls are not allowed in scenes" },
  { pattern: /os\.system/g, msg: "os.system calls are not allowed in scenes" },
];

function checkSceneIR(scene: GeneratedScene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sceneIR = scene.sceneIR;

  if (!sceneIR.metadata?.sceneId) {
    issues.push({
      sceneId: scene.sceneId,
      severity: "error",
      category: "schema",
      message: "Scene IR is missing metadata.sceneId.",
    });
  }
  if (!Array.isArray(sceneIR.layout?.zones) || sceneIR.layout.zones.length === 0) {
    issues.push({
      sceneId: scene.sceneId,
      severity: "error",
      category: "schema",
      message: "Scene IR must declare at least one layout zone.",
    });
  }
  if (!Array.isArray(sceneIR.objects) || sceneIR.objects.length === 0) {
    issues.push({
      sceneId: scene.sceneId,
      severity: "error",
      category: "schema",
      message: "Scene IR must contain at least one object.",
    });
  }
  if (!Array.isArray(sceneIR.beats) || sceneIR.beats.length === 0) {
    issues.push({
      sceneId: scene.sceneId,
      severity: "error",
      category: "schema",
      message: "Scene IR must contain at least one beat.",
    });
  }

  const objectIds = new Set(sceneIR.objects.map((objectSpec) => objectSpec.id));
  for (const beat of sceneIR.beats) {
    for (const action of beat.actions) {
      if ("targets" in action) {
        for (const target of action.targets) {
          if (!objectIds.has(target)) {
            issues.push({
              sceneId: scene.sceneId,
              severity: "error",
              category: "schema",
              message: `Beat "${beat.id}" references unknown object "${target}".`,
            });
          }
        }
      }
      if (action.type === "transform") {
        if (!objectIds.has(action.from) || !objectIds.has(action.to)) {
          issues.push({
            sceneId: scene.sceneId,
            severity: "error",
            category: "schema",
            message: `Beat "${beat.id}" has an invalid transform reference.`,
          });
        }
      }
      if (action.type === "custom") {
        const block = action.block;
        const custom = sceneIR.customBlocks;
        const timelineIds = new Set((custom?.timeline ?? []).map((entry) => entry.id));
        if (!timelineIds.has(block) && !sceneIR.customBlocks?.rawConstruct) {
          issues.push({
            sceneId: scene.sceneId,
            severity: "warning",
            category: "schema",
            message: `Custom block "${block}" is not declared in customBlocks.timeline.`,
          });
        }
      }
    }
  }

  return issues;
}

function checkPythonSanity(code: string, sceneId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!code.includes("from manim import")) {
    issues.push({
      sceneId,
      severity: "error",
      category: "python",
      message: `Missing "from manim import *" import.`,
    });
  }
  for (const { pattern, msg } of ALWAYS_BANNED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(code)) {
      issues.push({
        sceneId,
        severity: "error",
        category: "python",
        message: msg,
      });
    }
  }
  return issues;
}

async function checkPythonSyntax(code: string, sceneId: string): Promise<ValidationIssue[]> {
  return new Promise((resolve) => {
    const pythonCheck = `import ast; ast.parse(${JSON.stringify(code)})`;
    execFile("python3", ["-c", pythonCheck], { timeout: 10_000 }, (error, _stdout, stderr) => {
      if (error) {
        resolve([
          {
            sceneId,
            severity: "error",
            category: "python",
            message: `Python syntax error: ${(stderr || error.message).trim()}`,
          },
        ]);
        return;
      }
      resolve([]);
    });
  });
}

export async function validateSingleScene(
  scene: GeneratedScene,
  context: Pick<PipelineContext, "jobDir" | "assets">,
): Promise<{ scene: GeneratedScene; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  issues.push(...checkSceneIR(scene));
  issues.push(...checkPythonSanity(scene.pythonCode, scene.sceneId));
  issues.push(...(await checkPythonSyntax(scene.pythonCode, scene.sceneId)));

  if (issues.some((issue) => issue.severity === "error")) {
    throw new Error(
      `Scene "${scene.sceneId}" failed validation: ${issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  const preflightReport = await preflightScene(scene, context.jobDir, context.assets);
  scene.preflightReport = preflightReport;
  issues.push(
    ...preflightReport.issues.map((issue) => ({
      sceneId: issue.sceneId,
      severity: issue.severity,
      category: issue.category,
      message: issue.message,
      suggestedFix: issue.suggestedFix,
    })),
  );

  if (!preflightReport.passed) {
    throw new Error(
      `Scene "${scene.sceneId}" failed preflight: ${preflightReport.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return { scene, issues };
}

export const validateStage: PipelineStageHandler<CodegenOutput, ValidateOutput> = {
  name: "validate",

  async *execute(input, context): AsyncGenerator<PipelineEvent, ValidateOutput, undefined> {
    const allIssues: ValidationIssue[] = [];
    const validScenes: GeneratedScene[] = [];
    const totalScenes = input.scenes.length;

    yield {
      type: "stage-progress",
      stage: "validate",
      progress: 0,
      message: `Running static checks and preflight for ${totalScenes} scenes…`,
    };

    for (let index = 0; index < totalScenes; index++) {
      const scene = input.scenes[index];
      yield {
        type: "stage-progress",
        stage: "validate",
        progress: (index / Math.max(1, totalScenes)) * 0.9,
        message: `Preflighting "${scene.sceneId}"…`,
      };
      try {
        const validated = await validateSingleScene(scene, context);
        validScenes.push(validated.scene);
        allIssues.push(...validated.issues);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        allIssues.push({
          sceneId: scene.sceneId,
          severity: "error",
          category: "preflight",
          message,
        });
      }
    }

    if (validScenes.length === 0) {
      throw new Error(
        `All scenes failed validation:\n${allIssues
          .filter((issue) => issue.severity === "error")
          .map((issue) => `[${issue.sceneId}] ${issue.message}`)
          .join("\n")}`,
      );
    }

    yield {
      type: "stage-progress",
      stage: "validate",
      progress: 1,
      message: `Validation complete: ${validScenes.length}/${totalScenes} scene packages passed`,
    };

    return {
      scenes: validScenes,
      issues: allIssues,
    };
  },
};
