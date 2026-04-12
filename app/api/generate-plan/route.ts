import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * POST /api/generate-plan
 *
 * Body: { conceptText: string, latexProblem?: string }
 *
 * Returns a parsed JSON animation plan shaped as:
 *   {
 *     title: string,
 *     estimatedDuration: number,   // seconds
 *     steps: [{ description, visualHint, narration }, ...]
 *   }
 *
 * Provider selection: set ANIMATION_PROVIDER=anthropic in .env.local to use Claude.
 * Defaults to OpenAI. Falls back to whichever key is available.
 */

const SYSTEM_PROMPT = `You are a K-8 math educator and animation director. You
design short, narrated explainer animations (30-60 seconds) that teach a single
math concept to elementary or middle-school students. Your explanations are
visual-first, warm, and concrete. Prefer manipulatives (pizza slices, number
lines, base-ten blocks, area models, etc.) over symbol pushing. Keep narration
friendly and plain-spoken — no jargon.

You MUST respond with ONLY a single JSON object that matches this schema:

{
  "title": string,                      // short, catchy lesson title
  "estimatedDuration": number,          // total seconds, between 20 and 90
  "steps": [
    {
      "description": string,            // what happens on screen, 1-2 sentences
      "visualHint": string,              // concrete visual direction for an animator
      "narration": string                // exact words spoken over this step
    }
  ]
}

Rules:
- Produce between 3 and 7 steps.
- Every step must have all three fields, non-empty.
- Narration should be grade-appropriate and conversational.
- Do NOT wrap the JSON in markdown fences or commentary.`;

type Body = { conceptText?: string; latexProblem?: string };

async function planWithOpenAI(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? null;
}

async function planWithAnthropic(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text ?? null;
}

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const provider = (process.env.ANIMATION_PROVIDER ?? "openai").toLowerCase();

  const useAnthropic = provider === "anthropic" && !!anthropicKey;
  const useOpenAI = !useAnthropic && !!openaiKey;

  if (!useAnthropic && !useOpenAI) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No AI credentials configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local.",
      },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected a JSON body." },
      { status: 400 },
    );
  }

  const conceptText = (body.conceptText ?? "").trim();
  const latexProblem = (body.latexProblem ?? "").trim();

  if (!conceptText && !latexProblem) {
    return NextResponse.json(
      {
        success: false,
        error: "Provide either 'conceptText' or 'latexProblem'.",
      },
      { status: 400 },
    );
  }

  const userPrompt = [
    conceptText && `Concept to teach:\n${conceptText}`,
    latexProblem &&
      `Specific problem from a worksheet (LaTeX):\n${latexProblem}`,
    "Design the animation plan now. Respond with JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const raw = useAnthropic
      ? await planWithAnthropic(anthropicKey!, userPrompt)
      : await planWithOpenAI(openaiKey!, userPrompt);

    if (!raw) {
      return NextResponse.json(
        { success: false, error: "Model returned an empty response." },
        { status: 502 },
      );
    }

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, error: "Model returned invalid JSON." },
        { status: 502 },
      );
    }

    if (!isValidPlan(parsed)) {
      return NextResponse.json(
        {
          success: false,
          error: "Model response did not match the expected schema.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, plan: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const label = useAnthropic ? "Anthropic" : "OpenAI";
    return NextResponse.json(
      { success: false, error: `${label} request failed: ${message}` },
      { status: 502 },
    );
  }
}

function isValidPlan(value: unknown): value is {
  title: string;
  estimatedDuration: number;
  steps: { description: string; visualHint: string; narration: string }[];
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || !v.title) return false;
  if (typeof v.estimatedDuration !== "number") return false;
  if (!Array.isArray(v.steps) || v.steps.length === 0) return false;
  return v.steps.every((s) => {
    if (!s || typeof s !== "object") return false;
    const step = s as Record<string, unknown>;
    return (
      typeof step.description === "string" &&
      typeof step.visualHint === "string" &&
      typeof step.narration === "string"
    );
  });
}
