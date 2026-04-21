import { execFile } from "node:child_process";
import type { PipelineStageHandler } from "../stage";
import type {
  PipelineEvent,
  CodegenOutput,
  GeneratedScene,
  ValidateOutput,
  ValidationIssue,
} from "../types";

/* ------------------------------------------------------------------ */
/*  Stage 3: Static Code Validation                                     */
/*                                                                      */
/*  Validates generated Python code without running Manim.              */
/*  Catches syntax errors, banned patterns, and out-of-bounds coords.  */
/* ------------------------------------------------------------------ */

/* -- Checks -------------------------------------------------------- */

const BANNED_PATTERNS = [
  { pattern: /SVGMobject/g, msg: "SVGMobject is banned -- use built-in shapes only" },
  { pattern: /ImageMobject/g, msg: "ImageMobject is banned -- no external image files" },
  { pattern: /\.svg["']/g, msg: "SVG file references are banned" },
  { pattern: /\.png["']/g, msg: "PNG file references are banned" },
  { pattern: /\.jpg["']/g, msg: "JPG file references are banned" },
  { pattern: /open\s*\(/g, msg: "File I/O (open()) is not allowed in scenes" },
  { pattern: /requests\./g, msg: "HTTP requests are not allowed in scenes" },
  { pattern: /subprocess\./g, msg: "subprocess calls are not allowed in scenes" },
  { pattern: /os\.system/g, msg: "os.system calls are not allowed in scenes" },
];

function checkBannedPatterns(code: string, sceneId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const { pattern, msg } of BANNED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(code)) {
      issues.push({ sceneId, severity: "error", message: msg });
    }
  }
  return issues;
}

function checkCoordinateBounds(code: string, sceneId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const coordPatterns = [
    /move_to\s*\(\s*\[([^,]+),\s*([^,]+),/g,
    /move_to\s*\(\s*np\.array\s*\(\s*\[([^,]+),\s*([^,]+),/g,
  ];

  for (const pattern of coordPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const x = parseFloat(match[1].trim());
      const y = parseFloat(match[2].trim());

      if (!isNaN(x) && (x < -7.1 || x > 7.1)) {
        issues.push({
          sceneId,
          severity: "warning",
          message: `x coordinate ${x} is outside frame bounds [-7.1, 7.1]`,
        });
      }
      if (!isNaN(y) && (y < -4 || y > 4)) {
        issues.push({
          sceneId,
          severity: "warning",
          message: `y coordinate ${y} is outside frame bounds [-4, 4]`,
        });
      }
    }
  }

  return issues;
}

function checkClassExists(code: string, expectedClassName: string, sceneId: string): ValidationIssue[] {
  const classPattern = new RegExp(`class\\s+${expectedClassName}\\s*\\(`);
  if (!classPattern.test(code)) {
    return [
      {
        sceneId,
        severity: "error",
        message: `Expected class "${expectedClassName}" not found in code`,
      },
    ];
  }
  return [];
}

const VALID_RATE_FUNCS = new Set([
  "smooth",
  "linear",
  "rush_into",
  "rush_from",
  "slow_into",
  "lingering",
  "not_quite_there",
  "there_and_back",
  "there_and_back_with_pause",
  "running_start",
  "wiggle",
  "double_smooth",
  "exponential_decay",
]);

function fixAndCheckRateFuncs(
  code: string,
  sceneId: string,
): { code: string; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const fixed = code.replace(
    /rate_func\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (fullMatch, funcName: string) => {
      if (VALID_RATE_FUNCS.has(funcName)) return fullMatch;
      issues.push({
        sceneId,
        severity: "warning",
        message: `Auto-fixed invalid rate_func "${funcName}" → "smooth"`,
      });
      return fullMatch.replace(funcName, "smooth");
    },
  );
  return { code: fixed, issues };
}

function fixVGroupMobjects(
  code: string,
  sceneId: string,
): { code: string; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  // Replace VGroup(*self.mobjects) with the safe pattern
  const pattern = /VGroup\(\s*\*\s*self\.mobjects\s*\)/g;
  if (pattern.test(code)) {
    issues.push({
      sceneId,
      severity: "warning",
      message: `Auto-fixed VGroup(*self.mobjects) → list comprehension (VGroup can't hold non-VMobject types)`,
    });
    code = code.replace(
      /FadeOut\(\s*VGroup\(\s*\*\s*self\.mobjects\s*\)\s*\)/g,
      "*[FadeOut(mob) for mob in self.mobjects]",
    );
  }
  return { code, issues };
}

function checkManimImport(code: string, sceneId: string): ValidationIssue[] {
  if (!code.includes("from manim import")) {
    return [
      {
        sceneId,
        severity: "error",
        message: `Missing "from manim import *" -- scene won't render`,
      },
    ];
  }
  return [];
}

async function checkPythonSyntax(code: string, sceneId: string): Promise<ValidationIssue[]> {
  return new Promise((resolve) => {
    const pythonCheck = `import ast; ast.parse(${JSON.stringify(code)})`;
    execFile(
      "python3",
      ["-c", pythonCheck],
      { timeout: 10_000 },
      (error, _stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          const syntaxMatch = msg.match(/SyntaxError:.*/);
          resolve([
            {
              sceneId,
              severity: "error",
              message: `Python syntax error: ${syntaxMatch?.[0] ?? msg}`,
            },
          ]);
        } else {
          resolve([]);
        }
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Single-scene validator — used by per-scene workshop loop            */
/*                                                                      */
/*  Applies the same auto-fixes and checks as the batch stage but       */
/*  against a single scene, without yielding stage-progress events.     */
/*  Returns the (possibly auto-fixed) scene and the list of issues.     */
/*  Throws if the scene has any severity="error" issues.                */
/* ------------------------------------------------------------------ */

export async function validateSingleScene(
  scene: GeneratedScene,
): Promise<{ scene: GeneratedScene; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  const fixed: GeneratedScene = { ...scene };

  const rateFuncResult = fixAndCheckRateFuncs(fixed.pythonCode, fixed.sceneId);
  fixed.pythonCode = rateFuncResult.code;
  issues.push(...rateFuncResult.issues);

  const vgroupResult = fixVGroupMobjects(fixed.pythonCode, fixed.sceneId);
  fixed.pythonCode = vgroupResult.code;
  issues.push(...vgroupResult.issues);

  issues.push(...checkManimImport(fixed.pythonCode, fixed.sceneId));
  issues.push(...checkClassExists(fixed.pythonCode, fixed.className, fixed.sceneId));
  issues.push(...checkBannedPatterns(fixed.pythonCode, fixed.sceneId));
  issues.push(...checkCoordinateBounds(fixed.pythonCode, fixed.sceneId));

  const syntaxIssues = await checkPythonSyntax(fixed.pythonCode, fixed.sceneId);
  issues.push(...syntaxIssues);

  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Scene "${fixed.sceneId}" failed validation: ${errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }

  return { scene: fixed, issues };
}

/* ------------------------------------------------------------------ */
/*  Stage implementation                                                */
/* ------------------------------------------------------------------ */

export const validateStage: PipelineStageHandler<CodegenOutput, ValidateOutput> = {
  name: "validate",

  async *execute(input, _context): AsyncGenerator<PipelineEvent, ValidateOutput, undefined> {
    const allIssues: ValidationIssue[] = [];
    const totalScenes = input.scenes.length;

    yield {
      type: "stage-progress",
      stage: "validate",
      progress: 0,
      message: `Validating ${totalScenes} scene files\u2026`,
    };

    // Build mutable copies so auto-fixes can propagate to downstream stages
    const fixedScenes = input.scenes.map((s) => ({ ...s }));

    for (let i = 0; i < totalScenes; i++) {
      const scene = fixedScenes[i];

      yield {
        type: "stage-progress",
        stage: "validate",
        progress: (i / totalScenes) * 0.9,
        message: `Checking scene "${scene.sceneId}"\u2026`,
      };

      // Auto-fix invalid rate_func names before other checks
      const rateFuncResult = fixAndCheckRateFuncs(scene.pythonCode, scene.sceneId);
      scene.pythonCode = rateFuncResult.code;
      allIssues.push(...rateFuncResult.issues);

      // Auto-fix VGroup(*self.mobjects) → safe list comprehension
      const vgroupResult = fixVGroupMobjects(scene.pythonCode, scene.sceneId);
      scene.pythonCode = vgroupResult.code;
      allIssues.push(...vgroupResult.issues);

      allIssues.push(...checkManimImport(scene.pythonCode, scene.sceneId));
      allIssues.push(...checkClassExists(scene.pythonCode, scene.className, scene.sceneId));
      allIssues.push(...checkBannedPatterns(scene.pythonCode, scene.sceneId));
      allIssues.push(...checkCoordinateBounds(scene.pythonCode, scene.sceneId));

      const syntaxIssues = await checkPythonSyntax(scene.pythonCode, scene.sceneId);
      allIssues.push(...syntaxIssues);
    }

    const errors = allIssues.filter((i) => i.severity === "error");
    const warnings = allIssues.filter((i) => i.severity === "warning");

    const validScenes = fixedScenes.filter(
      (s) => !errors.some((e) => e.sceneId === s.sceneId),
    );

    if (validScenes.length === 0) {
      throw new Error(
        `All scenes failed validation:\n${errors.map((e) => `  [${e.sceneId}] ${e.message}`).join("\n")}`,
      );
    }

    yield {
      type: "stage-progress",
      stage: "validate",
      progress: 1,
      message: `Validation complete: ${validScenes.length}/${totalScenes} scenes passed${
        warnings.length > 0 ? ` (${warnings.length} warnings)` : ""
      }`,
    };

    return { scenes: validScenes, issues: allIssues };
  },
};
