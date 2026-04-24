import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import { createHash } from "node:crypto";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY missing");
  process.exit(1);
}
const BASE_URL = "https://api.deepseek.com";

const EXAMPLES_DIR = "lib/manim-examples";
function loadExample(filename: string): string {
  try {
    return fs.readFileSync(`${EXAMPLES_DIR}/${filename}`, "utf-8");
  } catch {
    return "";
  }
}

const EXAMPLE_HOOK = loadExample("hook_scene.py");
const EXAMPLE_FRACTION = loadExample("fraction_multiply.py");
const EXAMPLE_FRACTION_CIRCLES = loadExample("fraction_circles.py");
const EXAMPLE_MISCONCEPTION_SYNTH = loadExample("misconception_and_synthesize.py");

/* Keep the old 11-example list for the baseline */
const EXAMPLE_DIVISION = loadExample("long_division.py");
const EXAMPLE_SUBTRACTION = loadExample("subtraction_regrouping.py");
const EXAMPLE_PLACE_VALUE = loadExample("place_value.py");
const EXAMPLE_ORDER_OPS = loadExample("order_of_operations.py");
const EXAMPLE_NUMBER_LINE = loadExample("number_line_addition.py");
const EXAMPLE_EQUIV_FRACTIONS = loadExample("equivalent_fractions.py");
const EXAMPLE_NL_FRACTION_ADD = loadExample("number_line_fraction_addition.py");

const SYSTEM_PROMPT = `You are an expert Manim Community animation programmer. You receive a lesson plan with a scene breakdown and must produce Manim Python code for EACH scene.

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
14. Sector takes 'radius', NOT 'outer_radius'. Sector(radius=1.8, angle=PI/2) is correct. Sector(outer_radius=1.8, ...) causes a TypeError.
15. Rectangle does NOT accept 'corner_radius'. Use RoundedRectangle(corner_radius=0.1, width=2, height=1) for rounded corners. Rectangle(corner_radius=...) causes a TypeError.

Each scene MUST end with:
  self.play(*[FadeOut(mob) for mob in self.mobjects])
  self.wait(0.3)

IMPORTANT: Do NOT use VGroup(*self.mobjects) for the cleanup fade -- self.mobjects can contain non-VMobject types (Group, Mobject) which crash VGroup. Always use the list comprehension pattern above.

This ensures clean transitions when scenes are concatenated.`;

const STYLE_GUIDE = `=== MANIM STYLE GUIDE ===

Every scene file MUST include these exact module-level definitions:

from manim import *
import numpy as np

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

def T(s, size=40, color=INK):
    return Text(str(s), font_size=size, color=color, weight=BOLD)

def build_mascot():
    body = Circle(radius=0.25, fill_color=SKY, fill_opacity=1, stroke_width=0)
    eye1 = Dot(color=INK).scale(0.6).move_to(body.get_center() + UP*0.08 + LEFT*0.08)
    eye2 = Dot(color=INK).scale(0.6).move_to(body.get_center() + UP*0.08 + RIGHT*0.08)
    smile = ArcBetweenPoints(body.get_center()+LEFT*0.1+DOWN*0.05, body.get_center()+RIGHT*0.1+DOWN*0.05, angle=-PI/3)
    return VGroup(body, eye1, eye2, smile)

SPATIAL RULES:
- Derive positions from geometry constants. Use .move_to([x,y,0]), .set_y(), .align_to().
- NEVER chain more than 2 .next_to() calls.
- INNER SAFE ZONE: x in [-6.5, 6.5], y in [-3.5, 3.5].

CLEANUP (mandatory at end of construct()):
  self.play(*[FadeOut(mob) for mob in self.mobjects])
  self.wait(0.3)

PITFALLS:
1. LaTeX: r"\\frac{1}{2}" (single backslash in raw strings).
2. NEVER .animate without self.play().
3. After ReplacementTransform(a,b), reference b.
4. VGroup(a,b,c) takes objects, NOT a list.
5. Text objects: always weight=BOLD.
6. NO SVGMobject, ImageMobject, or external files.
7. rate_func: ONLY smooth, linear, rush_into, rush_from, slow_into, lingering, not_quite_there, there_and_back, there_and_back_with_pause, running_start, wiggle, double_smooth, exponential_decay. NO CSS easing names.
8. Sector takes 'radius', NOT 'outer_radius'.
9. Rectangle does NOT accept 'corner_radius'; use RoundedRectangle.`;

const FULL_EXAMPLES = `=== REFERENCE EXAMPLES ===

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
\`\`\`

EXAMPLE 4 -- Place Value:
\`\`\`python
${EXAMPLE_PLACE_VALUE}
\`\`\`

EXAMPLE 5 -- Order of Operations:
\`\`\`python
${EXAMPLE_ORDER_OPS}
\`\`\`

EXAMPLE 6 -- Number Line Addition:
\`\`\`python
${EXAMPLE_NUMBER_LINE}
\`\`\`

EXAMPLE 7 -- Equivalent Fractions:
\`\`\`python
${EXAMPLE_EQUIV_FRACTIONS}
\`\`\`

EXAMPLE 8 -- Hook Scene (title + question, no math notation):
\`\`\`python
${EXAMPLE_HOOK}
\`\`\`

EXAMPLE 9 -- Fraction Circles (introduce + predict roles):
\`\`\`python
${EXAMPLE_FRACTION_CIRCLES}
\`\`\`

EXAMPLE 10 -- Number Line Fraction Addition (worked_example):
\`\`\`python
${EXAMPLE_NL_FRACTION_ADD}
\`\`\`

EXAMPLE 11 -- Misconception + Synthesize (address_misconception + synthesize):
\`\`\`python
${EXAMPLE_MISCONCEPTION_SYNTH}
\`\`\``;

const COMPRESSED_EXAMPLES = `${STYLE_GUIDE}

=== REFERENCE EXAMPLES (4 archetypes covering all roles) ===

EXAMPLE 1 -- Hook Scene (title + question, no math notation):
\`\`\`python
${EXAMPLE_HOOK}
\`\`\`

EXAMPLE 2 -- Worked Example (fraction multiplication with MathTex):
\`\`\`python
${EXAMPLE_FRACTION}
\`\`\`

EXAMPLE 3 -- Introduce + Predict (fraction circles, visual model first):
\`\`\`python
${EXAMPLE_FRACTION_CIRCLES}
\`\`\`

EXAMPLE 4 -- Misconception + Synthesize (wrong→correct + summary):
\`\`\`python
${EXAMPLE_MISCONCEPTION_SYNTH}
\`\`\``;

const TASK = `LESSON PLAN:
Title: Area vs. Perimeter: The Garden Problem
Total duration: 71s

SCENE TO GENERATE (scene 2 of 7):
  sceneId: "introduce_perimeter"
  Estimated length: 10s
  Description: A bug animates a glowing path around the outer edge of the garden. The word 'Perimeter' appears with an arrow pointing to the path. Side lengths 6 m and 4 m are labeled.
  Math content: 6\\text{ m}, \\; 4\\text{ m}, \\; \\text{Perimeter}
  Role: introduce

=== YOUR TASK ===

Generate ONE self-contained Manim Python file for the scene "introduce_perimeter". The class name should be PascalCase matching the sceneId.

Respond with JSON only, matching this schema:
{
  "scenes": [
    { "sceneId": "introduce_perimeter", "className": "...", "pythonCode": "..." }
  ]
}

The scene must be independently renderable and end by fading out all its objects.`;

const FULL_PROMPT = `${FULL_EXAMPLES}\n\n${TASK}`;
const COMPRESSED_PROMPT = `${COMPRESSED_EXAMPLES}\n\n${TASK}`;

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function callDeepSeek(label: string, userPrompt: string): Promise<{ elapsed: number; promptTokens: number; completionTokens: number; status: number; ok: boolean }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await resp.json();
    const elapsed = Date.now() - start;

    if (data.error) {
      console.log(`${label} ERROR:`, JSON.stringify(data.error).slice(0, 300));
      return { elapsed: -1, promptTokens: 0, completionTokens: 0, status: resp.status, ok: false };
    }

    const usage = data.usage || {};
    const choice = data.choices?.[0];
    return {
      elapsed,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      status: resp.status,
      ok: true,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    console.log(`${label} FAILED:`, err.name, err.message?.slice(0, 100));
    return { elapsed: -1, promptTokens: 0, completionTokens: 0, status: 0, ok: false };
  }
}

async function main() {
  const out: string[] = [];
  const log = (s: string) => {
    console.log(s);
    out.push(s);
  };

  log("=== DEEPSEEK CODEGEN PROMPT BENCHMARK ===");
  log(`Full prompt hash:    ${hash(FULL_PROMPT)}`);
  log(`Compressed hash:     ${hash(COMPRESSED_PROMPT)}`);
  log(`Full size:           ${FULL_PROMPT.length.toLocaleString()} chars`);
  log(`Compressed size:     ${COMPRESSED_PROMPT.length.toLocaleString()} chars`);
  log(`Reduction:           ${((1 - COMPRESSED_PROMPT.length / FULL_PROMPT.length) * 100).toFixed(1)}%`);
  log("");

  // Run full prompt
  log("--- RUN 1: FULL PROMPT (11 examples) ---");
  const full = await callDeepSeek("FULL", FULL_PROMPT);

  // Small delay to avoid rate-limit burst
  await new Promise((r) => setTimeout(r, 2000));

  log("--- RUN 2: COMPRESSED PROMPT (4 examples + style guide) ---");
  const compressed = await callDeepSeek("COMPRESSED", COMPRESSED_PROMPT);

  log("");
  log("=== RESULTS ===");
  if (full.ok && compressed.ok) {
    log(`Full prompt:         ${full.elapsed}ms (${(full.elapsed / 1000).toFixed(1)}s) — ${full.promptTokens} prompt / ${full.completionTokens} completion tokens`);
    log(`Compressed:          ${compressed.elapsed}ms (${(compressed.elapsed / 1000).toFixed(1)}s) — ${compressed.promptTokens} prompt / ${compressed.completionTokens} completion tokens`);
    log(`Time difference:     ${full.elapsed - compressed.elapsed}ms (${((full.elapsed - compressed.elapsed) / 1000).toFixed(1)}s)`);
    log(`Speedup:             ${(full.elapsed / compressed.elapsed).toFixed(2)}x`);
    log(`Token savings:       ${full.promptTokens - compressed.promptTokens} prompt tokens (${((1 - compressed.promptTokens / full.promptTokens) * 100).toFixed(1)}% reduction)`);
  } else {
    log(`Full ok=${full.ok} status=${full.status} | Compressed ok=${compressed.ok} status=${compressed.status}`);
  }

  fs.writeFileSync("benchmark-results.json", JSON.stringify({
    full: { ok: full.ok, elapsed: full.elapsed, promptTokens: full.promptTokens, completionTokens: full.completionTokens, status: full.status },
    compressed: { ok: compressed.ok, elapsed: compressed.elapsed, promptTokens: compressed.promptTokens, completionTokens: compressed.completionTokens, status: compressed.status },
    sizes: { full: FULL_PROMPT.length, compressed: COMPRESSED_PROMPT.length },
    timestamp: new Date().toISOString(),
  }, null, 2));

  log("");
  log("Results saved to benchmark-results.json");
}

main().catch((e) => {
  console.error("Benchmark crashed:", e);
  process.exit(1);
});
