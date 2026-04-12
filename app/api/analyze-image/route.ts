import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * POST /api/analyze-image
 *
 * Accepts a multipart/form-data request with a single `file` field (PNG/JPG).
 * Uses vision to extract a structured JSON description of the worksheet.
 *
 * Provider selection: set ANIMATION_PROVIDER=anthropic to use Claude.
 * Defaults to OpenAI. Falls back to whichever key is available.
 */

const SYSTEM_PROMPT = `You are a K-8 math tutor looking at a photo of a
worksheet. Return a single JSON object with this exact shape:

{
  "problems": string[],   // each distinct math problem visible, in plain prose
                          // with LaTeX wrapped in $...$ for any math expressions
  "context": string,       // 1-2 sentences inferring grade level and lesson focus
  "themes": string[]       // visual or narrative threads (e.g. "pizzas",
                          // "farm animals", "sports") — empty array if none
}

Respond with JSON only — no markdown fences, no commentary.`;

type Analysis = {
  problems: string[];
  context: string;
  themes: string[];
};

async function analyzeWithOpenAI(
  apiKey: string,
  dataUrl: string,
): Promise<string | null> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this worksheet using the JSON schema above.",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
  });
  return completion.choices[0]?.message?.content ?? null;
}

async function analyzeWithAnthropic(
  apiKey: string,
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
): Promise<string | null> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this worksheet using the JSON schema above.",
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
        ],
      },
    ],
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

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected multipart/form-data body." },
      { status: 400 },
    );
  }

  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Missing 'file' field." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Uploaded file is empty." },
      { status: 400 },
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Only image uploads are supported (PNG or JPG). PDF support has been dropped for the MVP.",
      },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;
  const mediaType = file.type as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  try {
    const raw = useAnthropic
      ? await analyzeWithAnthropic(anthropicKey!, base64, mediaType)
      : await analyzeWithOpenAI(openaiKey!, dataUrl);

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

    if (!isValidAnalysis(parsed)) {
      return NextResponse.json(
        {
          success: false,
          error: "Model response did not match the expected schema.",
        },
        { status: 502 },
      );
    }

    const analysis: Analysis = parsed;

    const text = [
      analysis.problems.length
        ? `Problems:\n${analysis.problems
            .map((p, i) => `  ${i + 1}. ${p}`)
            .join("\n")}`
        : null,
      analysis.context ? `Context: ${analysis.context}` : null,
      analysis.themes.length
        ? `Themes: ${analysis.themes.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return NextResponse.json({
      success: true,
      latex: "",
      text,
      analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const label = useAnthropic ? "Anthropic" : "OpenAI";
    return NextResponse.json(
      { success: false, error: `${label} request failed: ${message}` },
      { status: 502 },
    );
  }
}

function isValidAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.problems)) return false;
  if (!v.problems.every((p) => typeof p === "string")) return false;
  if (typeof v.context !== "string") return false;
  if (!Array.isArray(v.themes)) return false;
  if (!v.themes.every((t) => typeof t === "string")) return false;
  return true;
}
