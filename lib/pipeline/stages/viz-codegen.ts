import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineStageHandler } from "../stage";
import type {
  CodegenOutput,
  PipelineEvent,
  PipelineInput,
} from "../types";
import { callLLM, resolveProvider } from "../llm-client";
import { compileScene, persistCompiledScene } from "../compiler";
import { normalizeSceneIR } from "../scene-normalizer";
import {
  buildFallbackVizSceneIR,
  buildSceneDesignSystemPrompt,
  buildVizSceneDesignPrompt,
  enrichSceneIR,
  parseSceneDesignResponse,
} from "../scene-design";

type VizCodegenInput = {
  conceptText?: string;
  latexProblem?: string;
  options?: PipelineInput["options"];
};

export const vizCodegenStage: PipelineStageHandler<VizCodegenInput, CodegenOutput> = {
  name: "codegen",

  async *execute(input, context): AsyncGenerator<PipelineEvent, CodegenOutput, undefined> {
    mkdirSync(join(context.jobDir, "scene-ir"), { recursive: true });
    mkdirSync(join(context.jobDir, "scenes"), { recursive: true });
    mkdirSync(join(context.jobDir, "llm"), { recursive: true });

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0,
      message: "Designing quick visualization…",
    };

    const provider = resolveProvider(input.options);
    const response = await callLLM({
      systemPrompt: buildSceneDesignSystemPrompt(),
      userPrompt: buildVizSceneDesignPrompt({
        conceptText: input.conceptText,
        latexProblem: input.latexProblem,
      }),
      provider,
      model: input.options?.model,
      maxTokens: 20000,
      signal: context.signal,
    }).catch(() => null);

    if (response?.usage) context.lastLLMUsage = response.usage;
    if (response?.text) {
      writeFileSync(join(context.jobDir, "llm", "viz-codegen.txt"), response.text, "utf-8");
    }

    let scene;
    try {
      const [sceneIR] = parseSceneDesignResponse(response?.text ?? "");
      scene = compileScene(
        normalizeSceneIR(enrichSceneIR(sceneIR), provider.provider),
        "Viz",
      );
    } catch {
      scene = compileScene(normalizeSceneIR(buildFallbackVizSceneIR(input), provider.provider), "Viz");
    }

    persistCompiledScene(context.jobDir, scene);

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 1,
      message: "Visualization design compiled",
    };

    return { scenes: [scene] };
  },
};
