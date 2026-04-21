import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Completions } from "openai/resources/completions";
import type { PipelineStageHandler } from "../stage";
import type { PipelineEvent, PipelineInput, PlanOutput, SceneEntry } from "../types";
import type { LLMUsage } from "../llm-usage";

/* ------------------------------------------------------------------ */
/*  Stage 1: Pedagogical Plan                                           */
/*                                                                      */
/*  Asks the LLM to design a lesson plan and scene breakdown.           */
/*  NO Manim code is generated here -- just structure.                  */
/* ------------------------------------------------------------------ */

const PLAN_SYSTEM_PROMPT = `You are an expert K-8 math educator who designs animated lesson plans. Your job is to plan the STRUCTURE and PEDAGOGY of a math animation -- not to write any code.

You MUST respond with a single JSON object matching this schema EXACTLY -- no markdown fences, no commentary outside the JSON:

{
  "title": string,
  "estimatedDuration": number,
  "steps": [
    { "label": string, "narration": string }
  ],
  "sceneBreakdown": [
    {
      "sceneId": string,
      "description": string,
      "mathContent": string,
      "estimatedSeconds": number
    }
  ]
}

STEPS (4-8):
- Each step describes a concrete visual action: "Draw the area grid", "Highlight the numerator" -- NOT abstract goals.
- "label": short (under 10 words), concrete, describes what appears on screen.
- "narration": what a teacher says aloud. Grade-appropriate, conversational, encouraging. 1-2 sentences max.

SCENE BREAKDOWN (3-6 scenes):
- Decompose the lesson into discrete, self-contained scenes. Each scene is 5-15 seconds.
- "sceneId": short kebab-case identifier (e.g. "intro", "area-grid", "overlap-highlight", "answer-reveal", "celebration").
- "description": what visually happens in this scene. Be specific about objects, positions, and animations.
- "mathContent": the mathematical content shown (equations, fractions, numbers). Use LaTeX notation where appropriate.
- "estimatedSeconds": how long this scene should play (5-15).
- The first scene should be an intro (title + mascot).
- The last scene should be a celebration/summary.

PEDAGOGY:
- Build from concrete to abstract.
- Use visual models (area models, number lines, base-10 blocks, etc.) before symbolic notation.
- One concept per scene -- don't overload.
- Narration should guide the student's eye: "Look at the top row...", "Now watch as we shade..."

estimatedDuration is the total in seconds (sum of all scene estimatedSeconds).`;

function buildUserPrompt(input: PipelineInput): string {
  const parts: string[] = [];
  if (input.conceptText) parts.push(`Concept to teach:\n${input.conceptText}`);
  if (input.latexProblem)
    parts.push(`Specific problem from a worksheet (LaTeX):\n${input.latexProblem}`);
  parts.push("Design the lesson plan and scene breakdown. Respond with JSON only.");
  return parts.join("\n\n");
}

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

  // Fallback chain
  if (anthropicKey) return { provider: "anthropic" as const, key: anthropicKey };
  if (deepseekKey) return { provider: "deepseek" as const, key: deepseekKey };
  if (openaiKey) return { provider: "openai" as const, key: openaiKey };

  throw new Error(
    "No AI credentials configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY.",
  );
}

async function callLLM(
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
        max_tokens: 4000,
        temperature: 0.3,
        system: PLAN_SYSTEM_PROMPT,
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

  // OpenAI / DeepSeek
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
        { role: "system", content: PLAN_SYSTEM_PROMPT },
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
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

function parsePlanResponse(raw: string): PlanOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Plan stage: LLM returned invalid JSON.");
  }

  const p = parsed as Record<string, unknown>;
  if (typeof p.title !== "string" || !p.title) throw new Error("Plan missing title.");
  if (typeof p.estimatedDuration !== "number") throw new Error("Plan missing estimatedDuration.");
  if (!Array.isArray(p.steps) || p.steps.length === 0) throw new Error("Plan missing steps.");
  if (!Array.isArray(p.sceneBreakdown) || p.sceneBreakdown.length === 0)
    throw new Error("Plan missing sceneBreakdown.");

  const steps = (p.steps as Record<string, unknown>[]).map((s) => ({
    label: String(s.label ?? ""),
    narration: String(s.narration ?? ""),
  }));

  const sceneBreakdown: SceneEntry[] = (p.sceneBreakdown as Record<string, unknown>[]).map(
    (s) => ({
      sceneId: String(s.sceneId ?? ""),
      description: String(s.description ?? ""),
      mathContent: String(s.mathContent ?? ""),
      estimatedSeconds: Number(s.estimatedSeconds ?? 10),
    }),
  );

  return {
    title: p.title as string,
    estimatedDuration: p.estimatedDuration as number,
    steps,
    sceneBreakdown,
  };
}

/* ------------------------------------------------------------------ */
/*  Stage implementation                                                */
/* ------------------------------------------------------------------ */

export const planStage: PipelineStageHandler<PipelineInput, PlanOutput> = {
  name: "plan",

  async *execute(input, context): AsyncGenerator<PipelineEvent, PlanOutput, undefined> {
    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0,
      message: "Designing lesson plan\u2026",
    };

    const provider = resolveProvider(input.options);
    const userPrompt = buildUserPrompt(input);

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0.2,
      message: `Generating plan via ${provider.provider}\u2026`,
    };

    const { text: raw, usage } = await callLLM(userPrompt, provider, context.signal);
    if (usage) context.lastLLMUsage = usage;

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0.9,
      message: "Parsing plan response\u2026",
    };

    const plan = parsePlanResponse(raw);

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 1,
      message: `Plan ready: "${plan.title}" \u2014 ${plan.sceneBreakdown.length} scenes`,
    };

    return plan;
  },
};
