import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

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
/*  System prompt                                                       */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are an expert K-8 math educator and Manim Community animation director. You write flawless, mathematically precise Manim Python code. Accuracy and polish come first. Creativity is secondary — never sacrifice correctness for flair.

You MUST respond with a single JSON object matching this schema EXACTLY — no markdown fences, no commentary outside the JSON:

{
  "title": string,
  "estimatedDuration": number,
  "steps": [
    {
      "label": string,
      "narration": string
    }
  ],
  "manimCode": string
}

═══════════════════════════════════════════════════════════════
  ACCURACY FIRST — THEN POLISH — THEN CREATIVITY
═══════════════════════════════════════════════════════════════

1. ACCURACY: Every number, fraction, position, and label must be mathematically correct. Grid cells must align exactly to grid lines. Shading must cover exactly the cells it claims to. Coordinates must be computed from geometry, never eyeballed.

2. POLISH: Clean layout with no overlapping text. Proper spacing. Smooth animations. Professional pacing.

3. CREATIVITY: Only after 1 and 2 are locked. Mascot, sparkles, banners — these enhance but never compromise accuracy.

─── RULES FOR steps ───

• 4–8 steps. Each step has a short "label" and a "narration" sentence spoken aloud.
• Narration: grade-appropriate, conversational, encouraging. No jargon.

─── MANDATORY CODE ARCHITECTURE ───

Study the two COMPLETE examples below. Your code MUST follow these patterns exactly:

STRUCTURE:
• \`from manim import *\` and \`import numpy as np\` at top
• Palette constants at module level (use the EXACT colors below)
• \`def T(s, size=40, color=INK)\` helper at module level
• \`def build_mascot()\` helper at module level
• Class named \`Lesson\` extending \`Scene\`
• construct() decomposes into methods: intro(), teach phases, celebrate()
• Each method handles one logical phase — NEVER one giant construct()

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

SPATIAL PRECISION:
• Derive ALL positions from geometry constants (cell size, row/col count).
• Use .get_left()[0], .get_top()[1], .get_center() for coordinate math.
• Use .move_to([x, y, 0]), .set_y(), .align_to() for exact placement.
• Check for overlapping labels — use generous buff values (0.5+) between adjacent text.
• Grid cells: compute x = left + (col + 0.5) * cell_size, y = top - (row + 0.5) * cell_size.

ANIMATION PATTERNS:
• LaggedStart for staggered entrances (lag_ratio=0.04–0.15)
• SurroundingRectangle for highlighting (buff=0.07–0.15, corner_radius=0.08)
• CurvedArrow for visual connections
• Mascot bounce: self.play(mascot.animate.shift(UP*0.2), run_time=0.17) then DOWN
• Answer banner: RoundedRectangle with fill_color=SUN, stroke_color=PINK
• Sparkle outro: scatter Star objects with LaggedStart FadeIn
• run_time=0.15–0.3 for micro-animations, 0.5–0.8 for main animations
• self.wait(1.0–2.0) between phases for narration

─── COMMON MANIM PITFALLS ───

1. LaTeX: use r"\\frac{1}{2}" — single backslash in raw strings.
2. NumberLine: x_range=[start, end, step], include_numbers=True.
3. NEVER call .animate without self.play().
4. After ReplacementTransform(a, b), reference b, not a.
5. VGroup(a, b, c) — individual objects, NOT a list.
6. fill_color and fill_opacity are separate from stroke_color.
7. config.background_color = BG at module level, NOT self.camera.background_color.
8. Use import numpy as np when you need np.random or np.array.
9. .get_center()[0] for x, .get_center()[1] for y.
10. Text objects: always use weight=BOLD.
11. NEVER use SVGMobject, ImageMobject, or any external files. You have NO access to .svg, .png, or other asset files. Represent all objects using built-in Manim shapes: Circle, Square, Rectangle, Star, Dot, Triangle, Polygon, etc. For animals/icons, use simple geometric approximations (e.g., a circle + triangles for a cat face).
12. KEEP ALL OBJECTS WITHIN FRAME. The Manim frame is ~14.2 units wide (x from -7.1 to 7.1) and ~8 units tall (y from -4 to 4). Before placing objects, verify their x and y coordinates will stay within these bounds. If you have N objects in a row, compute total width = N * (size + gap) and center it so nothing goes off-screen.
13. VERIFY ALL MATH. Double-check angles, positions, and arithmetic. For a clock at H:MM, the hour hand angle = -(H + MM/60) * 30 degrees from 12 o'clock, the minute hand angle = -MM * 6 degrees from 12 o'clock. For fractions, verify numerator/denominator relationships.
14. NO OVERLAPPING TEXT. Before placing labels, equations, or banners, check they don't collide with other objects. Use generous buff values (0.4+ between adjacent elements). Place banners at .to_edge(DOWN, buff=0.15) and don't stack other text below them.
15. FADE OUT BEFORE REPLACING. When showing a new element in the same position as an existing one (e.g., showing an answer where a count label was), always FadeOut the old element first. Never stack text on top of other text.
16. INDEX CAREFULLY. When labeling rows/columns of a grid, verify which index corresponds to which visual position. If dots are arranged bottom-to-top, the top row is NOT index 0 — it's index (ROWS-1)*COLS. Always double-check.

═══════════════════════════════════════════════════════════════
  EXAMPLE 1: Fraction Multiplication with Area Model
═══════════════════════════════════════════════════════════════

\`\`\`python
${EXAMPLE_FRACTION}
\`\`\`

═══════════════════════════════════════════════════════════════
  EXAMPLE 2: Long Division with Remainders
═══════════════════════════════════════════════════════════════

\`\`\`python
${EXAMPLE_DIVISION}
\`\`\`

═══════════════════════════════════════════════════════════════
  EXAMPLE 3: Subtraction with Regrouping (Manipulatives Layout)
═══════════════════════════════════════════════════════════════

\`\`\`python
${EXAMPLE_SUBTRACTION}
\`\`\`

═══════════════════════════════════════════════════════════════

Now generate the animation for the concept provided. Before writing code:
1. Plan the spatial layout — where does each object live? What are the exact coordinates?
2. Verify all math is correct.
3. Check that no labels or objects overlap.
4. Decompose into methods.
Write code that matches the quality of the examples above.`;

type Body = { conceptText?: string; latexProblem?: string };

/**
 * Provider selection via ANIMATION_PROVIDER env var:
 *   "openai"    → GPT-4o (default)
 *   "anthropic" → Claude Sonnet 4.6
 *   "deepseek"  → DeepSeek V3 (very cheap, strong code gen)
 *
 * Falls back to whichever key is available.
 */
async function generateWithOpenAI(
  apiKey: string,
  userPrompt: string,
  model: string = "gpt-4o",
  baseURL?: string,
): Promise<string | null> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? null;
}

async function generateWithAnthropic(
  apiKey: string,
  userPrompt: string,
  model: string = "claude-sonnet-4-6",
): Promise<string | null> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text ?? null;
}

async function generateWithDeepSeek(
  apiKey: string,
  userPrompt: string,
): Promise<string | null> {
  return generateWithOpenAI(
    apiKey,
    userPrompt,
    "deepseek-chat",
    "https://api.deepseek.com",
  );
}

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const provider = (process.env.ANIMATION_PROVIDER ?? "openai").toLowerCase();

  const useDeepSeek = provider === "deepseek" && !!deepseekKey;
  const useAnthropic = !useDeepSeek && provider === "anthropic" && !!anthropicKey;
  const useOpenAI = !useDeepSeek && !useAnthropic && !!openaiKey;

  if (!useAnthropic && !useOpenAI && !useDeepSeek) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No AI credentials configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or DEEPSEEK_API_KEY in .env.local.",
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
    "Design the animation and write the complete Manim Python code. Respond with JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const raw = useDeepSeek
      ? await generateWithDeepSeek(deepseekKey!, userPrompt)
      : useAnthropic
        ? await generateWithAnthropic(anthropicKey!, userPrompt)
        : await generateWithOpenAI(openaiKey!, userPrompt);

    if (!raw) {
      return NextResponse.json(
        { success: false, error: "Model returned an empty response." },
        { status: 502 },
      );
    }

    // Strip markdown fences if the model wraps the JSON despite instructions
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, error: "Model returned invalid JSON.", raw: cleaned },
        { status: 502 },
      );
    }

    if (!isValidAnimationResponse(parsed)) {
      return NextResponse.json(
        {
          success: false,
          error: "Model response did not match the expected schema.",
        },
        { status: 502 },
      );
    }

    const providerUsed = useDeepSeek ? "deepseek" : useAnthropic ? "anthropic" : "openai";
    return NextResponse.json({ success: true, provider: providerUsed, ...parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const label = useDeepSeek ? "DeepSeek" : useAnthropic ? "Anthropic" : "OpenAI";
    return NextResponse.json(
      { success: false, error: `${label} request failed: ${message}` },
      { status: 502 },
    );
  }
}

function isValidAnimationResponse(
  value: unknown,
): value is {
  title: string;
  estimatedDuration: number;
  steps: { label: string; narration: string }[];
  manimCode: string;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || !v.title) return false;
  if (typeof v.estimatedDuration !== "number") return false;
  if (typeof v.manimCode !== "string" || !v.manimCode) return false;
  if (!Array.isArray(v.steps) || v.steps.length === 0) return false;
  return v.steps.every((s) => {
    if (!s || typeof s !== "object") return false;
    const step = s as Record<string, unknown>;
    return typeof step.label === "string" && typeof step.narration === "string";
  });
}
