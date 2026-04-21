import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Completions } from "openai/resources/completions";
import fs from "node:fs";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineContext, PipelineStageHandler } from "../stage";
import type {
  PipelineEvent,
  PipelineInput,
  PlanOutput,
  CodegenOutput,
  GeneratedScene,
  SceneEntry,
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
const EXAMPLE_DIVISION = loadExample("long_division.py");
const EXAMPLE_SUBTRACTION = loadExample("subtraction_regrouping.py");

/* ------------------------------------------------------------------ */
/*  Stage 2: Manim Code Generation                                      */
/* ------------------------------------------------------------------ */

const CODEGEN_SYSTEM_PROMPT = `You are an expert Manim Community animation programmer. You receive a lesson plan with a scene breakdown and must produce Manim Python code for EACH scene.

You MUST respond with a single JSON object matching this schema EXACTLY -- no markdown fences, no commentary outside the JSON:

{
  "scenes": [
    {
      "sceneId": string,
      "className": string,
      "pythonCode": string
    }
  ]
}

Each scene is a SELF-CONTAINED Python file. Every scene file must include:
- \`from manim import *\` and \`import numpy as np\`
- The full palette constants (BG, INK, PINK, SKY, GRASS, SUN, GRAPE, ORANGE, PANEL_BG)
- \`config.background_color = BG\`
- \`def T(s, size=40, color=INK)\` helper
- \`def build_mascot()\` helper
- A class extending Scene with a descriptive PascalCase name matching className

PALETTE (define at module level of every scene):
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
- construct() can call sub-methods if needed, but each scene is short (5-15 seconds of animation)
- Start construct() with a LAYOUT PLAN comment mapping every object to coordinates
- End construct() by FadeOut-ing all objects (clean exit for scene transitions)
- Keep scenes focused -- one visual idea per scene

SPATIAL PRECISION:
- Derive ALL positions from geometry constants (cell size, row/col count).
- Use .move_to([x, y, 0]), .set_y(), .align_to() for exact placement.
- NEVER chain more than 2 .next_to() calls.
- INNER SAFE ZONE: keep all objects within x in [-6.5, 6.5], y in [-3.5, 3.5].

COMMON MANIM PITFALLS:
1. LaTeX: use r"\\frac{1}{2}" -- single backslash in raw strings.
2. NEVER call .animate without self.play().
3. After ReplacementTransform(a, b), reference b, not a.
4. VGroup(a, b, c) -- individual objects, NOT a list.
5. fill_color and fill_opacity are separate from stroke_color.
6. config.background_color = BG at module level, NOT self.camera.background_color.
7. Text objects: always use weight=BOLD.
8. NEVER use SVGMobject, ImageMobject, or any external files. Use built-in shapes only.
9. KEEP ALL OBJECTS WITHIN FRAME: x from -7.1 to 7.1, y from -4 to 4.
10. NO OVERLAPPING TEXT.
11. FADE OUT BEFORE REPLACING.
12. Use only well-tested Manim primitives: Write, FadeIn, FadeOut, Create, ReplacementTransform, LaggedStart, SurroundingRectangle, Indicate.
13. rate_func: ONLY use Manim built-in rate functions. Valid: smooth, linear, rush_into, rush_from, slow_into, lingering, not_quite_there, there_and_back, there_and_back_with_pause, running_start, wiggle, double_smooth, exponential_decay. NEVER use ease_in, ease_out, ease_in_out, ease_in_cubic, ease_out_cubic, ease_in_out_sine, or any CSS/web easing names -- they do NOT exist in Manim and will cause NameError.

Each scene MUST end with:
  self.play(*[FadeOut(mob) for mob in self.mobjects])
  self.wait(0.3)

IMPORTANT: Do NOT use VGroup(*self.mobjects) for the cleanup fade -- self.mobjects can contain non-VMobject types (Group, Mobject) which crash VGroup. Always use the list comprehension pattern above.

This ensures clean transitions when scenes are concatenated.`;

type CodegenInput = {
  plan: PlanOutput;
  options?: PipelineInput["options"];
};

/* ------------------------------------------------------------------ */
/*  Provider helpers                                                    */
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

/**
 * User-prompt halves for prompt caching. `cacheable` contains byte-stable
 * content shared across every codegen call (reference examples) — we mark
 * it with cache_control so Anthropic caches it after the first call.
 * `variable` is per-scene content that changes every request.
 *
 * Render order is tools → system → messages, so a single cache_control
 * breakpoint on the last cacheable user block caches everything before
 * it (system + cacheable) together.
 */
type UserPromptParts = { cacheable: string; variable: string };

async function callLLM(
  systemPrompt: string,
  userPromptParts: string | UserPromptParts,
  provider: ReturnType<typeof resolveProvider>,
  signal?: AbortSignal,
): Promise<{ text: string; usage: LLMUsage | null }> {
  const cacheable = typeof userPromptParts === "string" ? userPromptParts : userPromptParts.cacheable;
  const variable = typeof userPromptParts === "string" ? "" : userPromptParts.variable;

  if (provider.provider === "anthropic") {
    const client = new Anthropic({ apiKey: provider.key });
    let fullText = "";
    const stream = client.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: cacheable,
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: variable },
            ],
          },
        ],
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
  const userPrompt = variable ? `${cacheable}\n\n${variable}` : cacheable;
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
/*  Build user prompt with plan + examples                              */
/* ------------------------------------------------------------------ */

function buildUserPrompt(plan: PlanOutput): UserPromptParts {
  const sceneList = plan.sceneBreakdown
    .map(
      (s, i) =>
        `  ${i + 1}. Scene "${s.sceneId}" (${s.estimatedSeconds}s): ${s.description}\n     Math: ${s.mathContent}`,
    )
    .join("\n");

  return {
    cacheable: `=== REFERENCE EXAMPLES ===

Study these complete Manim programs for style, structure, and quality:

EXAMPLE 1 -- Fraction Multiplication:
\`\`\`python
${EXAMPLE_FRACTION}
\`\`\`

EXAMPLE 2 -- Long Division:
\`\`\`python
${EXAMPLE_DIVISION}
\`\`\`

EXAMPLE 3 -- Subtraction with Regrouping:
\`\`\`python
${EXAMPLE_SUBTRACTION}
\`\`\``,
    variable: `LESSON PLAN:
Title: ${plan.title}
Total duration: ${plan.estimatedDuration}s

SCENE BREAKDOWN:
${sceneList}

STEPS (for reference):
${plan.steps.map((s, i) => `  ${i + 1}. ${s.label} -- "${s.narration}"`).join("\n")}

=== YOUR TASK ===

Generate one self-contained Manim Python file per scene listed above. Each scene class should be named in PascalCase matching the sceneId (e.g. "intro" -> "Intro", "area-grid" -> "AreaGrid").

Each scene must be independently renderable and end by fading out all its objects. Respond with JSON only.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Single-scene prompt builder — used by per-scene workshop loop       */
/*                                                                      */
/*  Differs from buildUserPrompt in that it focuses on ONE scene and    */
/*  includes lightweight neighboring-scene context for continuity.      */
/*  The three worked examples are still included (they're the style     */
/*  anchor for the LLM), but the response schema asks for a single      */
/*  scene object, not an array.                                         */
/* ------------------------------------------------------------------ */

function buildSingleSceneUserPrompt(
  scene: SceneEntry,
  plan: PlanOutput,
  sceneIndex: number,
): UserPromptParts {
  const prev = sceneIndex > 0 ? plan.sceneBreakdown[sceneIndex - 1] : null;
  const next =
    sceneIndex + 1 < plan.sceneBreakdown.length
      ? plan.sceneBreakdown[sceneIndex + 1]
      : null;
  const matchingStep = plan.steps[sceneIndex];

  const neighborSummary = [
    prev ? `  Previous scene: "${prev.sceneId}" — ${prev.description}` : null,
    next ? `  Next scene: "${next.sceneId}" — ${next.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    cacheable: `=== REFERENCE EXAMPLES ===

Study these complete Manim programs for style, structure, and quality:

EXAMPLE 1 -- Fraction Multiplication:
\`\`\`python
${EXAMPLE_FRACTION}
\`\`\`

EXAMPLE 2 -- Long Division:
\`\`\`python
${EXAMPLE_DIVISION}
\`\`\`

EXAMPLE 3 -- Subtraction with Regrouping:
\`\`\`python
${EXAMPLE_SUBTRACTION}
\`\`\``,
    variable: `LESSON PLAN:
Title: ${plan.title}
Total duration: ${plan.estimatedDuration}s

SCENE TO GENERATE (scene ${sceneIndex + 1} of ${plan.sceneBreakdown.length}):
  sceneId: "${scene.sceneId}"
  Estimated length: ${scene.estimatedSeconds}s
  Description: ${scene.description}
  Math content: ${scene.mathContent}
${matchingStep ? `  Narration: "${matchingStep.narration}"` : ""}

${neighborSummary ? `NEIGHBORING CONTEXT (do NOT generate these — they give you continuity):\n${neighborSummary}` : ""}

=== YOUR TASK ===

Generate ONE self-contained Manim Python file for the scene "${scene.sceneId}". The class name should be PascalCase matching the sceneId (e.g. "intro" -> "Intro", "area-grid" -> "AreaGrid").

Respond with JSON only, matching this schema:
{
  "scenes": [
    { "sceneId": "${scene.sceneId}", "className": "...", "pythonCode": "..." }
  ]
}

The scene must be independently renderable and end by fading out all its objects.`,
  };
}

/**
 * Generate Manim code for a single scene. Used by the per-scene workshop
 * loop and by the regenerate-scene action.
 */
export async function codegenSingleScene(
  scene: SceneEntry,
  plan: PlanOutput,
  context: PipelineContext,
  options?: PipelineInput["options"],
): Promise<{ scene: GeneratedScene; usage: LLMUsage | null }> {
  const provider = resolveProvider(options);
  const sceneIndex = plan.sceneBreakdown.findIndex(
    (s) => s.sceneId === scene.sceneId,
  );
  const userPrompt = buildSingleSceneUserPrompt(
    scene,
    plan,
    sceneIndex < 0 ? 0 : sceneIndex,
  );

  const { text: raw, usage } = await callLLM(
    CODEGEN_SYSTEM_PROMPT,
    userPrompt,
    provider,
    context.signal,
  );
  const parsed = parseCodegenResponse(raw, {
    ...plan,
    sceneBreakdown: [scene],
  });

  if (parsed.scenes.length === 0) {
    throw new Error(`Codegen returned no scene for "${scene.sceneId}".`);
  }

  const generated: GeneratedScene = {
    sceneId: scene.sceneId,
    className: parsed.scenes[0].className,
    pythonCode: parsed.scenes[0].pythonCode,
  };

  const filePath = join(context.jobDir, "scenes", `${generated.sceneId}.py`);
  try {
    writeFileSync(filePath, generated.pythonCode, "utf-8");
  } catch {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, generated.pythonCode, "utf-8");
  }

  return { scene: generated, usage };
}

/* ------------------------------------------------------------------ */
/*  Parse + validate response                                           */
/* ------------------------------------------------------------------ */

function parseCodegenResponse(raw: string, plan: PlanOutput): CodegenOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Codegen stage: LLM returned invalid JSON.");
  }

  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.scenes) || p.scenes.length === 0)
    throw new Error("Codegen: no scenes returned.");

  const scenes: GeneratedScene[] = (p.scenes as Record<string, unknown>[]).map((s) => ({
    sceneId: String(s.sceneId ?? ""),
    className: String(s.className ?? ""),
    pythonCode: String(s.pythonCode ?? ""),
  }));

  if (scenes.length !== plan.sceneBreakdown.length) {
    console.warn(
      `Codegen returned ${scenes.length} scenes but plan has ${plan.sceneBreakdown.length}`,
    );
  }

  return { scenes };
}

/* ------------------------------------------------------------------ */
/*  Stage implementation                                                */
/* ------------------------------------------------------------------ */

export const codegenStage: PipelineStageHandler<CodegenInput, CodegenOutput> = {
  name: "codegen",

  async *execute(input, context): AsyncGenerator<PipelineEvent, CodegenOutput, undefined> {
    const { plan, options } = input;

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0,
      message: `Generating Manim code for ${plan.sceneBreakdown.length} scenes\u2026`,
    };

    const provider = resolveProvider(options);
    const userPrompt = buildUserPrompt(plan);

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0.1,
      message: `Calling ${provider.provider} for code generation\u2026`,
    };

    const { text: raw, usage } = await callLLM(CODEGEN_SYSTEM_PROMPT, userPrompt, provider, context.signal);
    if (usage) context.lastLLMUsage = usage;

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 0.85,
      message: "Parsing generated code\u2026",
    };

    const output = parseCodegenResponse(raw, plan);

    // Write scene files to job directory
    for (const scene of output.scenes) {
      const filePath = join(context.jobDir, "scenes", `${scene.sceneId}.py`);
      writeFileSync(filePath, scene.pythonCode, "utf-8");
    }

    yield {
      type: "stage-progress",
      stage: "codegen",
      progress: 1,
      message: `Generated ${output.scenes.length} scene files`,
    };

    return output;
  },
};
