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

• 4–8 steps. Each step MUST correspond 1:1 to a method in your Lesson class.
• Step "label" = short, concrete description of what appears on screen (e.g. "Draw the area grid" NOT "Explore the concept of multiplication through visual representation"). Keep labels under 10 words.
• Step "narration" = what a teacher says aloud during that phase. Grade-appropriate, conversational, encouraging. No jargon. 1–2 sentences max.
• The steps MUST match the manimCode exactly. If step 3 says "shade the overlap region", the code's 3rd method must shade the overlap region. A reviewer will verify this by reading both side by side.
• Do NOT describe abstract learning goals in steps. Describe concrete visual actions: "Write the equation", "Highlight the numerator", "Shade 3 of 4 cells".

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
• Start construct() with a LAYOUT PLAN comment mapping every object to coordinates:
    # LAYOUT: title y=3.2 | visual center y=0 | labels y=-2.5 | banner y=-3.5
• Define layout constants (TITLE_Y, VISUAL_Y, LABEL_Y) at the top of the class or method.
• Derive ALL positions from geometry constants (cell size, row/col count).
• Use .move_to([x, y, 0]), .set_y(), .align_to() for exact placement.
• NEVER chain more than 2 .next_to() calls — accumulated rounding causes drift and overlap.
• Use generous buff values (0.5+ between text, 0.3+ between shapes).
• Grid cells: compute x = left + (col + 0.5) * cell_size, y = top - (row + 0.5) * cell_size.
• INNER SAFE ZONE: keep all objects within x ∈ [-6.5, 6.5], y ∈ [-3.5, 3.5].

ANIMATION PATTERNS:
• LaggedStart for staggered entrances (lag_ratio=0.04–0.15)
• SurroundingRectangle for highlighting (buff=0.07–0.15, corner_radius=0.08)
• CurvedArrow for visual connections
• Mascot bounce: self.play(mascot.animate.shift(UP*0.2), run_time=0.17) then DOWN
• Answer banner: RoundedRectangle with fill_color=SUN, stroke_color=PINK
• Sparkle outro: scatter Star objects with LaggedStart FadeIn
• run_time=0.15–0.3 for micro-animations, 0.5–0.8 for main animations
• self.wait(1.0–2.0) between phases for narration

ADVANCED LAYOUT TECHNIQUES:
• VGroup(*items).arrange(DOWN, buff=0.3) for vertical stacks — always specify buff.
• VGroup(*items).arrange_in_grid(rows=R, cols=C, buff=(0.4, 0.6)) for grids — buff is (vertical, horizontal).
• After .next_to(), use .align_to(reference, DOWN) to fix text baseline drift.
• For math expressions: split MathTex into submobjects for selective coloring:
    eq = MathTex(r"\\frac{2}{3}", r"\\times", r"\\frac{3}{4}")
    eq[1].set_color(ORANGE)  # color the × independently
• Use Indicate(obj, color=PINK) to pulse/highlight key elements.
• Use Circumscribe(obj, color=GRASS) for temporary highlight outlines.
• Use TransformMatchingTex(old_eq, new_eq) for equation derivations — it auto-matches shared LaTeX parts.
• For dynamic labels that follow moving objects, prefer explicit repositioning over always_redraw.

PHASE TRANSITION PATTERN (mandatory between methods):
  At the END of each phase method, group everything that phase created and FadeOut:
    all_phase_objects = VGroup(title, grid, labels, highlight)
    self.play(FadeOut(all_phase_objects))
  The NEXT phase method starts with a clean canvas. This prevents overlap accumulation.

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
14. NO OVERLAPPING TEXT. Every text/equation/label MUST have explicit, non-conflicting coordinates. Before placing any object, mentally verify it won't collide with existing visible objects. Use buff=0.5+ between adjacent text. If two objects could overlap, FadeOut the old one first OR move it to a guaranteed-clear position. Never have more than 6-8 text objects visible simultaneously.
15. FADE OUT BEFORE REPLACING. When showing a new element in the same region as an existing one, ALWAYS FadeOut the old element first in a prior self.play() call. Never stack text on top of text. When transitioning between phases, FadeOut ALL objects from the previous phase before building the next one.
16. INDEX CAREFULLY. When labeling rows/columns of a grid, verify which index corresponds to which visual position. If dots are arranged bottom-to-top, the top row is NOT index 0 — it's index (ROWS-1)*COLS. Always double-check.
17. TEXT BASELINE ALIGNMENT. Characters like "y" and "g" have descenders that shift bounding boxes. After .next_to(), add .align_to(reference, DOWN) to fix vertical misalignment between adjacent text objects.
18. COLOR AFTER TRANSFORM. ReplacementTransform may carry old colors. Always set explicit colors on the target object BEFORE the transform: new_obj = MathTex(..., color=INK).
19. KEEP ANIMATIONS SIMPLE. Stick to proven patterns: Write, FadeIn, FadeOut, Create, ReplacementTransform, LaggedStart, SurroundingRectangle, Indicate. Do NOT use obscure or experimental Manim features. Every animation must work reliably with Manim Community v0.18+.

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
1. Plan the spatial layout — assign every object an explicit (x, y) position. Write these as a LAYOUT comment at the top of construct().
2. Verify all math is correct — double-check every fraction, equation, and coordinate.
3. Walk through the animation frame by frame: at each self.play() call, list every currently-visible object. If any two overlap, fix the layout or FadeOut the older one first.
4. Decompose into methods — one per step in the steps array. Each method must FadeOut its objects before returning.
5. Verify step-code correspondence: each step's "label" must describe exactly what its method renders. Read each step and its method side by side — they must match.
6. Keep it achievable: use only well-tested Manim primitives. No exotic features, no external assets.
Write code that matches the quality and structure of the examples above.`;

type Body = { conceptText?: string; latexProblem?: string };

/* ------------------------------------------------------------------ */
/*  Streaming helpers                                                   */
/* ------------------------------------------------------------------ */

async function streamAnthropic(
  apiKey: string,
  userPrompt: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  let fullText = "";
  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    },
    { signal },
  );
  stream.on("text", (text) => {
    fullText += text;
    onDelta(text);
  });
  await stream.finalMessage();
  return fullText;
}

async function streamOpenAI(
  apiKey: string,
  userPrompt: string,
  model: string,
  onDelta: (text: string) => void,
  baseURL?: string,
  signal?: AbortSignal,
): Promise<string> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  let fullText = "";
  const stream = await client.chat.completions.create(
    {
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    },
    { signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      fullText += text;
      onDelta(text);
    }
  }
  return fullText;
}

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const requestedProvider = process.env.ANIMATION_PROVIDER?.toLowerCase();

  // Fallback chain: anthropic (Sonnet) → deepseek → openai
  // If a specific provider is requested, try it first; otherwise use the fallback chain
  let useAnthropic = false;
  let useDeepSeek = false;
  let useOpenAI = false;

  if (requestedProvider === "anthropic" && !!anthropicKey) {
    useAnthropic = true;
  } else if (requestedProvider === "deepseek" && !!deepseekKey) {
    useDeepSeek = true;
  } else if (requestedProvider === "openai" && !!openaiKey) {
    useOpenAI = true;
  } else {
    // Default fallback order: anthropic → deepseek → openai
    if (!!anthropicKey) {
      useAnthropic = true;
    } else if (!!deepseekKey) {
      useDeepSeek = true;
    } else if (!!openaiKey) {
      useOpenAI = true;
    }
  }

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

  const providerUsed = useDeepSeek ? "deepseek" : useAnthropic ? "anthropic" : "openai";
  const abort = new AbortController();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream cancelled by client
        }
      };

      try {
        const fullText = useAnthropic
          ? await streamAnthropic(
              anthropicKey!,
              userPrompt,
              (text) => send({ type: "delta", text }),
              abort.signal,
            )
          : await streamOpenAI(
              useDeepSeek ? deepseekKey! : openaiKey!,
              userPrompt,
              useDeepSeek ? "deepseek-chat" : "gpt-4o",
              (text) => send({ type: "delta", text }),
              useDeepSeek ? "https://api.deepseek.com" : undefined,
              abort.signal,
            );

        const cleaned = fullText
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          send({ type: "error", error: "Model returned invalid JSON." });
          return;
        }

        if (!isValidAnimationResponse(parsed)) {
          send({ type: "error", error: "Model response did not match the expected schema." });
          return;
        }

        send({ type: "result", success: true, provider: providerUsed, ...parsed });
      } catch (err) {
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        const label = useDeepSeek ? "DeepSeek" : useAnthropic ? "Anthropic" : "OpenAI";
        send({ type: "error", error: `${label} request failed: ${message}` });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
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
