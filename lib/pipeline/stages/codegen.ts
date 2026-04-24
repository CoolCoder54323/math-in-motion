import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineContext, PipelineStageHandler } from "../stage";
import type {
  CodegenOutput,
  GeneratedScene,
  PipelineEvent,
  PipelineInput,
  PlanOutput,
  SceneEntry,
} from "../types";
import { callLLM, resolveProvider, type UserPromptParts } from "../llm-client";
import type { LLMUsage } from "../llm-usage";
import { compileScene, persistCompiledScene } from "../compiler";
import { normalizeSceneIR } from "../scene-normalizer";
import {
  buildFallbackSceneIR,
  buildLessonSceneDesignPrompt,
  buildSceneDesignSystemPrompt,
  buildSingleSceneDesignPrompt,
  enrichSceneIR,
  markFallbackSceneIR,
  parseSceneDesignResponseWithDiagnostics,
} from "../scene-design";

type CacheEntry = {
  scene: GeneratedScene;
  usage: LLMUsage | null;
  timestamp: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 50;
const codegenCache = new Map<string, CacheEntry>();

function cacheKey(system: string, user: UserPromptParts, provider: string): string {
  return createHash("sha256")
    .update(provider + "\0" + system + "\0" + user.cacheable + "\0" + user.variable)
    .digest("hex");
}

function getCached(key: string): CacheEntry | undefined {
  const entry = codegenCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    codegenCache.delete(key);
    return undefined;
  }
  return entry;
}

function setCached(key: string, entry: CacheEntry): void {
  if (codegenCache.size >= CACHE_MAX_SIZE) {
    const oldest = codegenCache.keys().next().value;
    if (oldest !== undefined) codegenCache.delete(oldest);
  }
  codegenCache.set(key, entry);
}

type CodegenInput = {
  plan: PlanOutput;
  options?: PipelineInput["options"];
};

function buildPromptParts(prompt: string): UserPromptParts {
  return {
    cacheable: "",
    variable: prompt,
  };
}

export async function codegenSingleScene(
  scene: SceneEntry,
  plan: PlanOutput,
  context: PipelineContext,
  options?: PipelineInput["options"],
  errorFeedback?: string,
): Promise<{ scene: GeneratedScene; usage: LLMUsage | null; cacheHit: boolean }> {
  mkdirSync(join(context.jobDir, "scene-ir"), { recursive: true });
  mkdirSync(join(context.jobDir, "scenes"), { recursive: true });
  mkdirSync(join(context.jobDir, "llm"), { recursive: true });

  const provider = resolveProvider(options);
  const systemPrompt = buildSceneDesignSystemPrompt();
  const userPrompt = buildPromptParts(buildSingleSceneDesignPrompt(scene, plan, errorFeedback));
  const key = cacheKey(systemPrompt, userPrompt, provider.provider);
  const cached = !errorFeedback ? getCached(key) : undefined;
  if (cached) {
    persistCompiledScene(context.jobDir, cached.scene);
    return { scene: cached.scene, usage: null, cacheHit: true };
  }

  let usage: LLMUsage | null = null;
  let generatedScene: GeneratedScene;

  try {
    const response = await callLLM({
      systemPrompt,
      userPrompt,
      provider,
      model: options?.model,
      maxTokens: 24000,
      signal: context.signal,
    });
    usage = response.usage;
    writeFileSync(join(context.jobDir, "llm", `${scene.sceneId}.codegen.txt`), response.text, "utf-8");
    const parsed = parseSceneDesignResponseWithDiagnostics(response.text);
    if (parsed.repaired) {
      writeFileSync(
        join(context.jobDir, "llm", `${scene.sceneId}.codegen-repair.json`),
        JSON.stringify({ repaired: true, repairNotes: parsed.repairNotes }, null, 2),
        "utf-8",
      );
    }
    const [sceneIR] = parsed.scenes;
    generatedScene = compileScene(
      normalizeSceneIR(enrichSceneIR(sceneIR), provider.provider),
    );
  } catch (error) {
    mkdirSync(join(context.jobDir, "errors"), { recursive: true });
    writeFileSync(
      join(context.jobDir, "errors", `${scene.sceneId}.codegen.json`),
      JSON.stringify(
        {
          layer: "model",
          code: "model.parse_error",
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
      "utf-8",
    );
    generatedScene = compileScene(
      normalizeSceneIR(
        markFallbackSceneIR(buildFallbackSceneIR(scene, plan.title), "model.parse_error"),
        provider.provider,
      ),
    );
  }

  persistCompiledScene(context.jobDir, generatedScene);
  setCached(key, { scene: generatedScene, usage, timestamp: Date.now() });
  return { scene: generatedScene, usage, cacheHit: false };
}

export const codegenStage: PipelineStageHandler<CodegenInput, CodegenOutput> = {
  name: "codegen",

  async *execute(input, context): AsyncGenerator<PipelineEvent, CodegenOutput, undefined> {
    const { plan, options } = input;
    mkdirSync(join(context.jobDir, "scene-ir"), { recursive: true });
    mkdirSync(join(context.jobDir, "scenes"), { recursive: true });
    mkdirSync(join(context.jobDir, "llm"), { recursive: true });

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0,
      message: `Designing ${plan.sceneBreakdown.length} scenes…`,
    };

    const provider = resolveProvider(options);
    const systemPrompt = buildSceneDesignSystemPrompt();
    const userPrompt = buildPromptParts(buildLessonSceneDesignPrompt(plan));

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0.1,
      message: `Calling ${provider.provider} for scene design…`,
    };

    const startedAt = Date.now();
    const estimatedMs = 15000;
    const llmPromise = callLLM({
      systemPrompt,
      userPrompt,
      provider,
      model: options?.model,
      maxTokens: 64000,
      signal: context.signal,
    });

    let raw = "";
    let usage: LLMUsage | null = null;

    while (true) {
      const delay = new Promise<void>((resolve) => setTimeout(resolve, 400));
      const winner = await Promise.race([llmPromise, delay.then(() => null)]);
      if (winner !== null) {
        raw = winner.text;
        usage = winner.usage;
        break;
      }
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(0.82, 0.1 + (elapsed / estimatedMs) * 0.72);
      yield {
        type: "stage-progress",
        stage: "codegen",
        progress,
        message: `Designing structured scenes via ${provider.provider}…`,
      };
    }

    if (usage) context.lastLLMUsage = usage;
    if (raw) {
      writeFileSync(join(context.jobDir, "llm", "lesson-codegen.txt"), raw, "utf-8");
    }

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0.86,
      message: "Compiling scene designs…",
    };

    let scenes: GeneratedScene[];
    try {
      const parsed = parseSceneDesignResponseWithDiagnostics(raw);
      if (parsed.repaired) {
        writeFileSync(
          join(context.jobDir, "llm", "lesson-codegen-repair.json"),
          JSON.stringify({ repaired: true, repairNotes: parsed.repairNotes }, null, 2),
          "utf-8",
        );
      }
      const designed = parsed.scenes;
      const bySceneId = new Map(
        designed.map((sceneIR) => [
          sceneIR.metadata.sceneId,
          normalizeSceneIR(enrichSceneIR(sceneIR), provider.provider),
        ]),
      );
      scenes = plan.sceneBreakdown.map((scene) =>
        compileScene(
          bySceneId.get(scene.sceneId)
            ?? normalizeSceneIR(buildFallbackSceneIR(scene, plan.title), provider.provider),
        ),
      );
    } catch (error) {
      mkdirSync(join(context.jobDir, "errors"), { recursive: true });
      writeFileSync(
        join(context.jobDir, "errors", "lesson-codegen.json"),
        JSON.stringify(
          {
            layer: "model",
            code: "model.parse_error",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
        "utf-8",
      );
      scenes = plan.sceneBreakdown.map((scene) =>
        compileScene(
          normalizeSceneIR(
            markFallbackSceneIR(buildFallbackSceneIR(scene, plan.title), "model.parse_error"),
            provider.provider,
          ),
        ),
      );
    }

    for (const scene of scenes) {
      persistCompiledScene(context.jobDir, scene);
    }

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 1,
      message: `Designed ${scenes.length} scene packages`,
    };

    return { scenes };
  },
};
