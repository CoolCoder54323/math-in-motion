import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineContext, PipelineStageHandler } from "../stage";
import type {
  CodegenOutput,
  FailureLayer,
  GeneratedScene,
  PipelineEvent,
  SceneValidationResult,
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

function classifyPreflightException(error: unknown): { layer: FailureLayer; code: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/snapshot|font_size|ZeroDivisionError/i.test(message)) {
    return { layer: "runtime", code: "runtime.snapshot_error" };
  }
  if (/TypeError|ValueError|NameError|AttributeError|IndexError|KeyError/i.test(message)) {
    return { layer: "runtime", code: "runtime.object_builder_error" };
  }
  return { layer: "preflight", code: "preflight.render_failed" };
}

class ValidationFailure extends Error {
  constructor(
    message: string,
    public layer: FailureLayer,
    public code: string,
  ) {
    super(message);
    this.name = "ValidationFailure";
  }
}

function issue(sceneId: string, message: string, params: {
  severity: "error" | "warning";
  category: string;
  code: string;
  layer: FailureLayer;
  suggestedFix?: string;
}): ValidationIssue {
  return {
    sceneId,
    severity: params.severity,
    category: params.category,
    code: params.code,
    layer: params.layer,
    message,
    suggestedFix: params.suggestedFix,
  };
}

function checkSceneIR(scene: GeneratedScene): SceneValidationResult {
  const issues: ValidationIssue[] = [];
  const sceneIR = scene.sceneIR;
  const designMode = scene.designMode;
  const rawConstruct = sceneIR.customBlocks?.rawConstruct?.trim();
  const hasObjects = Array.isArray(sceneIR.objects) && sceneIR.objects.length > 0;
  const hasBeats = Array.isArray(sceneIR.beats) && sceneIR.beats.length > 0;
  const hasTimelineBlocks = (sceneIR.customBlocks?.timeline?.length ?? 0) > 0;
  const requiresDeclaredObjects =
    designMode === "ir"
      || (designMode === "hybrid"
        && sceneIR.beats.some((beat) =>
          beat.actions.some((action) => "targets" in action || action.type === "transform"),
        ));

  if (!sceneIR.metadata?.sceneId) {
    issues.push(issue(scene.sceneId, "Scene IR is missing metadata.sceneId.", {
      severity: "error",
      category: "schema",
      code: "validation.schema_error",
      layer: "validation",
    }));
  }
  if (!Array.isArray(sceneIR.layout?.zones) || sceneIR.layout.zones.length === 0) {
    issues.push(issue(scene.sceneId, "Scene IR must declare at least one layout zone.", {
      severity: "error",
      category: "schema",
      code: "validation.schema_error",
      layer: "validation",
    }));
  }

  if (designMode === "raw") {
    if (!rawConstruct) {
      issues.push(issue(scene.sceneId, "Raw scenes must include customBlocks.rawConstruct.", {
        severity: "error",
        category: "schema",
        code: "validation.raw_mode_rejected",
        layer: "validation",
      }));
    }
  } else {
    if (!hasObjects && requiresDeclaredObjects) {
      issues.push(issue(scene.sceneId, "Scene IR must contain at least one object.", {
        severity: "error",
        category: "schema",
        code: "validation.schema_error",
        layer: "validation",
      }));
    }
    if (!hasBeats) {
      issues.push(issue(scene.sceneId, "Scene IR must contain at least one beat.", {
        severity: "error",
        category: "schema",
        code: "validation.schema_error",
        layer: "validation",
      }));
    }
    if (designMode === "hybrid" && !hasObjects && !hasTimelineBlocks) {
      issues.push(issue(scene.sceneId, "Hybrid scenes without objects must declare timeline custom blocks.", {
        severity: "error",
        category: "schema",
        code: "validation.schema_error",
        layer: "validation",
      }));
    }
  }

  const objectIds = new Set(sceneIR.objects.map((objectSpec) => objectSpec.id));
  if (designMode !== "raw") {
    for (const beat of sceneIR.beats) {
      for (const action of beat.actions) {
        if ("targets" in action && Array.isArray(action.targets)) {
          for (const target of action.targets) {
            if (!objectIds.has(target)) {
              issues.push(issue(scene.sceneId, `Beat "${beat.id}" references unknown object "${target}".`, {
                severity: "error",
                category: "schema",
                code: "validation.schema_error",
                layer: "validation",
              }));
            }
          }
        }
        if (action.type === "transform") {
          if (!objectIds.has(action.from) || !objectIds.has(action.to)) {
            issues.push(issue(scene.sceneId, `Beat "${beat.id}" has an invalid transform reference.`, {
              severity: "error",
              category: "schema",
              code: "validation.schema_error",
              layer: "validation",
            }));
          }
        }
        if (action.type === "custom") {
          const block = action.block;
          const custom = sceneIR.customBlocks;
          const timelineIds = new Set((custom?.timeline ?? []).map((entry) => entry.id));
          if (!timelineIds.has(block) && !sceneIR.customBlocks?.rawConstruct) {
            issues.push(issue(scene.sceneId, `Custom block "${block}" is not declared in customBlocks.timeline.`, {
              severity: "warning",
              category: "schema",
              code: "validation.schema_warning",
              layer: "validation",
            }));
          }
        }
      }
    }
  }

  return {
    ok: !issues.some((entry) => entry.severity === "error"),
    designMode,
    issues,
  };
}

function checkPythonSanity(code: string, sceneId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!code.includes("from manim import")) {
    issues.push(issue(sceneId, `Missing "from manim import *" import.`, {
      severity: "error",
      category: "python",
      code: "validation.python_sanity_error",
      layer: "validation",
    }));
  }
  for (const { pattern, msg } of ALWAYS_BANNED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(code)) {
      issues.push(issue(sceneId, msg, {
        severity: "error",
        category: "python",
        code: "validation.python_safety_error",
        layer: "validation",
      }));
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
          issue(sceneId, `Python syntax error: ${(stderr || error.message).trim()}`, {
            severity: "error",
            category: "python",
            code: "validation.python_syntax_error",
            layer: "validation",
          }),
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
  const schemaResult = checkSceneIR(scene);
  issues.push(...schemaResult.issues);
  issues.push(...checkPythonSanity(scene.pythonCode, scene.sceneId));
  issues.push(...(await checkPythonSyntax(scene.pythonCode, scene.sceneId)));

  if (issues.some((issue) => issue.severity === "error")) {
    const primary = issues.find((entry) => entry.severity === "error");
    throw new ValidationFailure(
      `Scene "${scene.sceneId}" failed validation: ${issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join("; ")}`,
      primary?.layer ?? "validation",
      primary?.code ?? "validation.schema_error",
    );
  }

  let preflightReport;
  try {
    preflightReport = await preflightScene(scene, context.jobDir, context.assets);
  } catch (error) {
    const classified = classifyPreflightException(error);
    const message = error instanceof Error ? error.message : String(error);
    scene.renderStatus = "failed";
    scene.qualityStatus = "failed-runtime";
    scene.sceneIR.metadata.qualityStatus = "failed-runtime";
    throw new ValidationFailure(
      `Scene "${scene.sceneId}" failed preflight: ${message}`,
      classified.layer,
      classified.code,
    );
  }
  scene.preflightReport = preflightReport;
  scene.renderStatus = "renderable";
  scene.qualityStatus = preflightReport.passed ? "passed" : "needs-review";
  scene.sceneIR.metadata.qualityStatus = scene.qualityStatus;
  writeFileSync(
    join(context.jobDir, "scene-ir", `${scene.sceneId}.normalized.json`),
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
  issues.push(
    ...preflightReport.issues.map((issue) => ({
      sceneId: issue.sceneId,
      severity: "warning" as const,
      category: issue.category,
      code: `preflight.${issue.category}`,
      layer: "preflight" as const,
      message: `${issue.message} (${issue.severity}; renderable scene kept for review)`,
      suggestedFix: issue.suggestedFix,
    })),
  );

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
        const layer = error instanceof ValidationFailure ? error.layer : "preflight";
        const code = error instanceof ValidationFailure ? error.code : "preflight.failed";
        allIssues.push(issue(scene.sceneId, message, {
          severity: "error",
          category: layer === "validation" ? "schema" : "preflight",
          code,
          layer,
        }));
      }
    }

    mkdirSync(join(context.jobDir, "validation"), { recursive: true });
    writeFileSync(
      join(context.jobDir, "validation", "report.json"),
      JSON.stringify(
        {
          scenes: totalScenes,
          passed: validScenes.length,
          issues: allIssues,
        },
        null,
        2,
      ),
      "utf-8",
    );

    if (validScenes.length === 0) {
      const primary = allIssues.find((issue) => issue.severity === "error");
      throw new ValidationFailure(
        `All scenes failed validation:\n${allIssues
          .filter((issue) => issue.severity === "error")
          .map((issue) => `[${issue.sceneId}] ${issue.message}`)
          .join("\n")}`,
        primary?.layer ?? "validation",
        primary?.code ?? "validation.schema_error",
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
