import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Completions } from "openai/resources/completions";
import fs from "node:fs";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineStageHandler } from "../stage";
import type {
  PipelineEvent,
  PipelineInput,
  CodegenOutput,
  GeneratedScene,
} from "../types";
import type { LLMUsage } from "../llm-usage";

/* ------------------------------------------------------------------ */
/*  Load gold-standard Manim examples from disk                        */
/* ------------------------------------------------------------------ */

const EXAMPLES_DIR = path.join(process.cwd(), "lib", "manim-examples");

function loadExample(filename: string): string {
  try {
    return fs.readFileSync(path.join(EXAMPLES_DIR, filename), "utf-8");
  } catch {
    return "";
  }
}

const EXAMPLE_FRACTION = loadExample("fraction_multiply.py");

/* ------------------------------------------------------------------ */
/*  Stage: Quick Viz Code Generation                                    */
/*                                                                      */
/*  A lightweight codegen stage that produces a SINGLE Manim scene      */
/*  (5-10 seconds) directly from the user prompt — no lesson plan,      */
/*  no scene breakdown, no multi-scene orchestration.                   */
/* ------------------------------------------------------------------ */

const VIZ_SYSTEM_PROMPT = `You are an expert Manim Community animation programmer. You produce a SINGLE short (5-10 second) math visualization.

You MUST respond with a single JSON object matching this schema EXACTLY -- no markdown fences, no commentary outside the JSON:

{
  "scenes": [
    {
      "sceneId": "viz",
      "className": "Viz",
      "pythonCode": string
    }
  ]
}

The scene is a SELF-CONTAINED Python file that must include:
- \`from manim import *\` and \`import numpy as np\`
- The full palette constants (BG, INK, PINK, SKY, GRASS, SUN, GRAPE, ORANGE, PANEL_BG)
- \`config.background_color = BG\`
- \`def T(s, size=40, color=INK)\` helper
- A class called "Viz" extending Scene

PALETTE (define at module level):
  BG       = "#FFF4D6"
  INK      = "#2D2013"
  PINK     = "#FF6FA3"
  SKY      = "#4FC3F7"
  GRASS    = "#56C42A"
  SUN      = "#FFD23F"
  GRAPE    = "#9B59D0"
  ORANGE   = "#FF8C42"
  PANEL_BG = "#E8D5A3"
  config.background_color = BG

STRUCTURE:
- construct() should be 5-10 seconds of focused animation
- Start with a LAYOUT PLAN comment mapping every object to coordinates
- End by fading out all objects
- ONE visual idea — keep it tight and impactful

SPATIAL PRECISION:
- Derive ALL positions from geometry constants.
- Use .move_to([x, y, 0]), .set_y(), .align_to() for exact placement.
- INNER SAFE ZONE: x in [-6.5, 6.5], y in [-3.5, 3.5].

COMMON MANIM PITFALLS:
1. LaTeX: use r"\\frac{1}{2}" -- single backslash in raw strings.
2. NEVER call .animate without self.play().
3. After ReplacementTransform(a, b), reference b, not a.
4. VGroup(a, b, c) -- individual objects, NOT a list.
5. fill_color and fill_opacity are separate from stroke_color.
6. config.background_color = BG at module level, NOT self.camera.background_color.
7. Text objects: always use weight=BOLD.
8. NEVER use SVGMobject, ImageMobject, or any external files.
9. KEEP ALL OBJECTS WITHIN FRAME: x from -7.1 to 7.1, y from -4 to 4.
10. NO OVERLAPPING TEXT.
11. FADE OUT BEFORE REPLACING.
12. Use only well-tested Manim primitives: Write, FadeIn, FadeOut, Create, ReplacementTransform, LaggedStart, SurroundingRectangle, Indicate.
13. rate_func: ONLY use Manim built-in rate functions. Valid: smooth, linear, rush_into, rush_from, slow_into, lingering, not_quite_there, there_and_back, there_and_back_with_pause, running_start, wiggle, double_smooth, exponential_decay.

Scene MUST end with:
  self.play(*[FadeOut(mob) for mob in self.mobjects])
  self.wait(0.3)

IMPORTANT: Do NOT use VGroup(*self.mobjects) -- self.mobjects can contain non-VMobject types which crash VGroup. Always use the list comprehension pattern above.`;

type VizCodegenInput = {
  conceptText?: string;
  latexProblem?: string;
  options?: PipelineInput["options"];
};

/* ------------------------------------------------------------------ */
/*  Provider helpers (shared logic)                                     */
/* ------------------------------------------------------------------ */

function resolveProvider(options?: PipelineInput["options"]) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const requested = options?.provider ?? process.env.ANIMATION_PROVIDER?.toLowerCase();

  if (requested === "anthropic" && anthropicKey)
    return { provider: "anthropic" as const, key: anthropicKey };
  if (requested === "deepseek" && deepseekKey)
    return { provider: "deepseek" as const, key: deepseekKey };
  if (requested === "openai" && openaiKey)
    return { provider: "openai" as const, key: openaiKey };
  if (anthropicKey) return { provider: "anthropic" as const, key: anthropicKey };
  if (deepseekKey) return { provider: "deepseek" as const, key: deepseekKey };
  if (openaiKey) return { provider: "openai" as const, key: openaiKey };
  throw new Error("No AI credentials configured.");
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  provider: ReturnType<typeof resolveProvider>,
  signal?: AbortSignal,
): Promise<{ text: string; usage: LLMUsage | null }> {
  if (provider.provider === "anthropic") {
    const client = new Anthropic({ apiKey: provider.key });
    let fullText = "";
    const stream = client.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal },
    );
    stream.on("text", (text) => {
      fullText += text;
    });
    const finalMsg = await stream.finalMessage();
    return {
      text: fullText,
      usage: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        inputTokens: finalMsg.usage.input_tokens,
        outputTokens: finalMsg.usage.output_tokens,
        cacheReadTokens: finalMsg.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens: finalMsg.usage.cache_creation_input_tokens ?? undefined,
      },
    };
  }

  const client = new OpenAI({
    apiKey: provider.key,
    ...(provider.provider === "deepseek" ? { baseURL: "https://api.deepseek.com" } : {}),
  });
  const model = provider.provider === "deepseek" ? "deepseek-chat" : "gpt-4o";
  let fullText = "";
  let lastUsage: Completions.CompletionUsage | undefined;
  const stream = await client.chat.completions.create(
    {
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) fullText += text;
    if (chunk.usage) lastUsage = chunk.usage;
  }
  return {
    text: fullText,
    usage: lastUsage
      ? {
          provider: provider.provider,
          model,
          inputTokens: lastUsage.prompt_tokens,
          outputTokens: lastUsage.completion_tokens,
          cachedTokens: lastUsage.prompt_tokens_details?.cached_tokens,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Build user prompt                                                   */
/* ------------------------------------------------------------------ */

function buildUserPrompt(input: VizCodegenInput): string {
  const parts: string[] = [];
  if (input.conceptText) parts.push(`Visualization request:\n${input.conceptText}`);
  if (input.latexProblem) parts.push(`Math problem (LaTeX):\n${input.latexProblem}`);

  parts.push(`
=== REFERENCE EXAMPLE ===

Study this complete Manim program for style, structure, and quality:

\`\`\`python
${EXAMPLE_FRACTION}
\`\`\`

=== YOUR TASK ===

Generate ONE self-contained Manim scene (class name "Viz", sceneId "viz") that creates a focused 5-10 second visualization of the concept described above. Keep it short, clear, and visually impactful. Respond with JSON only.`);

  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Parse response                                                      */
/* ------------------------------------------------------------------ */

function parseVizResponse(raw: string): CodegenOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Viz codegen: LLM returned invalid JSON.");
  }

  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.scenes) || p.scenes.length === 0)
    throw new Error("Viz codegen: no scene returned.");

  const scene = p.scenes[0] as Record<string, unknown>;
  const generated: GeneratedScene = {
    sceneId: String(scene.sceneId ?? "viz"),
    className: String(scene.className ?? "Viz"),
    pythonCode: String(scene.pythonCode ?? ""),
  };

  return { scenes: [generated] };
}

/* ------------------------------------------------------------------ */
/*  Stage implementation                                                */
/* ------------------------------------------------------------------ */

export const vizCodegenStage: PipelineStageHandler<VizCodegenInput, CodegenOutput> = {
  name: "codegen",

  async *execute(input, context): AsyncGenerator<PipelineEvent, CodegenOutput, undefined> {
    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0,
      message: "Generating quick visualization\u2026",
    };

    const provider = resolveProvider(input.options);
    const userPrompt = buildUserPrompt(input);

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0.1,
      message: `Calling ${provider.provider}\u2026`,
    };

    const { text: raw, usage } = await callLLM(VIZ_SYSTEM_PROMPT, userPrompt, provider, context.signal);
    if (usage) context.lastLLMUsage = usage;

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0.85,
      message: "Parsing generated code\u2026",
    };

    const output = parseVizResponse(raw);

    // Write scene file to job directory
    for (const scene of output.scenes) {
      const filePath = join(context.jobDir, "scenes", `${scene.sceneId}.py`);
      writeFileSync(filePath, scene.pythonCode, "utf-8");
    }

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 1,
      message: "Visualization code ready",
    };

    return output;
  },
};
