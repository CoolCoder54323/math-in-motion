#!/usr/bin/env node
/**
 * Model Comparison Test — generate + render Manim animations across 6 models.
 *
 * Usage: node scripts/model-comparison.mjs
 *
 * Outputs videos to: /tmp/model-comparison/<prompt-slug>/<model-slug>.mp4
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Keys ──────────────────────────────────────────────────────
let envContent = "";
try {
  envContent = fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8");
} catch {
  console.warn("Warning: .env.local not found, using process.env");
}

const OPENAI_KEY =
  process.env.OPENAI_API_KEY ||
  envContent.match(/OPENAI_API_KEY=(.*)/)?.[1]?.trim();
const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY ||
  envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();
const DEEPSEEK_KEY =
  process.env.DEEPSEEK_API_KEY ||
  envContent.match(/DEEPSEEK_API_KEY=(.*)/)?.[1]?.trim();

// ── Load system prompt (same as route.ts) ─────────────────────
const EXAMPLES_DIR = path.join(ROOT, "lib", "manim-examples");
function loadExample(f) {
  try {
    return fs.readFileSync(path.join(EXAMPLES_DIR, f), "utf-8");
  } catch {
    return "";
  }
}

const EF = loadExample("gold_v2_fraction_pizza_addition.py");
const EP = loadExample("gold_v2_place_value_blocks.py");
const ED = loadExample("gold_v2_distributive_property_array.py");
const EA = loadExample("gold_v2_area_perimeter_garden.py");
const EC = loadExample("gold_v2_fraction_to_percent_grid.py");

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

Study the five COMPLETE gold v2 examples below. Your code MUST follow these visually checked patterns exactly:

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
12. KEEP ALL OBJECTS WITHIN FRAME. The Manim frame is ~14.2 units wide (x from -7.1 to 7.1) and ~8 units tall (y from -4 to 4). Before placing objects, verify their x and y coordinates will stay within these bounds. If you have N objects in a row, compute total width = N * (size + gap) and center it so nothing goes off-screen. For manipulatives (blocks, cubes), use a 2-column grid layout instead of a single row.
13. VERIFY ALL MATH. Double-check angles, positions, and arithmetic.
14. NO OVERLAPPING TEXT. Before placing labels, equations, or banners, check they don't collide with other objects. Use generous buff values (0.4+ between adjacent elements).
15. FADE OUT BEFORE REPLACING. When showing a new element in the same position as an existing one, always FadeOut the old element first.
16. INDEX CAREFULLY. When labeling rows/columns of a grid, verify which index corresponds to which visual position.

═══════════════════════════════════════════════════════════════
  EXAMPLE 1: Unlike-Denominator Fraction Addition with Pizza Slices
═══════════════════════════════════════════════════════════════

\`\`\`python
${EF}
\`\`\`

═══════════════════════════════════════════════════════════════
  EXAMPLE 2: Place Value with Base-Ten Blocks
═══════════════════════════════════════════════════════════════

\`\`\`python
${EP}
\`\`\`

═══════════════════════════════════════════════════════════════
  EXAMPLE 3: Distributive Property with Garden Array
═══════════════════════════════════════════════════════════════

\`\`\`python
${ED}
\`\`\`

═══════════════════════════════════════════════════════════════
  EXAMPLE 4: Area vs Perimeter with Garden Model
═══════════════════════════════════════════════════════════════

\`\`\`python
${EA}
\`\`\`

═══════════════════════════════════════════════════════════════
  EXAMPLE 5: Fraction to Percent with 100 Grid
═══════════════════════════════════════════════════════════════

\`\`\`python
${EC}
\`\`\`

═══════════════════════════════════════════════════════════════

Now generate the animation for the concept provided. Before writing code:
1. Plan the spatial layout — where does each object live? What are the exact coordinates?
2. Verify all math is correct.
3. Check that no labels or objects overlap.
4. Decompose into methods.
Write code that matches the quality of the examples above.`;

// ── Test prompts ──────────────────────────────────────────────
const PROMPTS = [
  {
    slug: "01_comparing_fractions",
    text: "Concept to teach:\nCompare the fractions 2/5 and 3/8 — show which is bigger using bar models side by side. Grade 4.\n\nDesign the animation and write the complete Manim Python code. Respond with JSON only.",
  },
  {
    slug: "02_telling_time",
    text: "Concept to teach:\nTelling time on an analog clock — show what 7:35 looks like. Draw the clock, place the hour and minute hands at the correct angles, and explain how to read it. Grade 2.\n\nDesign the animation and write the complete Manim Python code. Respond with JSON only.",
  },
  {
    slug: "03_perimeter",
    text: "Concept to teach:\nFind the perimeter of a rectangle that is 6 cm wide and 4 cm tall. Show the sides, label each measurement, add them up step by step. Grade 3.\n\nDesign the animation and write the complete Manim Python code. Respond with JSON only.",
  },
];

// ── Models ────────────────────────────────────────────────────
const MODELS = [
  {
    slug: "deepseek-v4-pro",
    type: "openai",
    model: "deepseek-v4-pro",
    baseURL: "https://api.deepseek.com",
    apiKey: DEEPSEEK_KEY,
  },
  {
    slug: "gpt-4o",
    type: "openai",
    model: "gpt-4o",
    apiKey: OPENAI_KEY,
  },
  {
    slug: "o3-mini",
    type: "openai",
    model: "o3-mini",
    apiKey: OPENAI_KEY,
  },
  {
    slug: "haiku-3.5",
    type: "anthropic",
    model: "claude-3-5-haiku-latest",
    apiKey: ANTHROPIC_KEY,
  },
  {
    slug: "sonnet-4.6",
    type: "anthropic",
    model: "claude-sonnet-4-6",
    apiKey: ANTHROPIC_KEY,
  },
  {
    slug: "opus-4",
    type: "anthropic",
    model: "claude-opus-4-0-20250514",
    apiKey: ANTHROPIC_KEY,
  },
];

// ── Generation functions ──────────────────────────────────────
async function generateOpenAI(cfg, userPrompt) {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
  });
  // o3-mini doesn't support response_format, temperature, or system messages the same way
  const isO3 = cfg.model.startsWith("o3");
  const messages = isO3
    ? [{ role: "user", content: SYSTEM_PROMPT + "\n\n" + userPrompt }]
    : [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ];
  const completion = await client.chat.completions.create({
    model: cfg.model,
    ...(isO3 ? {} : { temperature: 0.3 }),
    ...(isO3 ? {} : { response_format: { type: "json_object" } }),
    messages,
  });
  return completion.choices[0]?.message?.content ?? null;
}

async function generateAnthropic(cfg, userPrompt) {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const message = await client.messages.create({
    model: cfg.model,
    max_tokens: 16000,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text ?? null;
}

function extractCode(raw) {
  // Strip all markdown fences (models sometimes wrap despite instructions)
  let cleaned = raw
    .replace(/^```(?:json)?\s*/gim, "")
    .replace(/\s*```\s*/gm, "")
    .trim();

  // Try parsing the whole thing as JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.manimCode) return parsed.manimCode;
  } catch {}

  // Try to find the JSON object containing manimCode
  // Find the first { and the last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substr = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed2 = JSON.parse(substr);
      if (parsed2.manimCode) return parsed2.manimCode;
    } catch {}
  }

  // Last resort: find "manimCode": " and extract the string value
  const match = raw.match(/"manimCode"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (match) {
    try {
      return JSON.parse('"' + match[1] + '"');
    } catch {}
  }

  return null;
}

// ── Render function ───────────────────────────────────────────
const MANIM_PYTHON = "/Users/nicholasdixon/anaconda3/envs/prop_api/bin/python";

function renderManim(pyFile, outDir) {
  try {
    execSync(
      `cd "${EXAMPLES_DIR}" && "${MANIM_PYTHON}" -m manim -ql --format mp4 "${pyFile}" Lesson 2>&1`,
      { timeout: 120_000, stdio: "pipe" },
    );
    // Find the generated video
    const videoDir = path.join(
      EXAMPLES_DIR,
      "media",
      "videos",
      path.basename(pyFile, ".py"),
      "480p15",
    );
    const videoFile = path.join(videoDir, "Lesson.mp4");
    if (fs.existsSync(videoFile)) {
      const dest = path.join(outDir, path.basename(pyFile, ".py") + ".mp4");
      fs.copyFileSync(videoFile, dest);
      return { success: true, path: dest };
    }
    return { success: false, error: "Video file not found after render" };
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message;
    // Extract just the error line
    const errorLine = stderr.split("\n").find((l) => l.includes("Error")) || stderr.slice(-300);
    return { success: false, error: errorLine };
  }
}

// ── Main ──────────────────────────────────────────────────────
const OUT_ROOT = "/tmp/model-comparison";
fs.mkdirSync(OUT_ROOT, { recursive: true });

const results = [];

// Generate all models in parallel per prompt
for (const prompt of PROMPTS) {
  const promptDir = path.join(OUT_ROOT, prompt.slug);
  fs.mkdirSync(promptDir, { recursive: true });

  console.log(`\n📋 ${prompt.slug}`);

  // Launch all model generations in parallel
  const genPromises = MODELS.map(async (model) => {
    const startGen = Date.now();

    let raw;
    try {
      if (model.type === "openai") {
        raw = await generateOpenAI(model, prompt.text);
      } else {
        raw = await generateAnthropic(model, prompt.text);
      }
    } catch (err) {
      const msg = err.message || String(err);
      console.log(`  ❌ ${model.slug.padEnd(14)} API error: ${msg.slice(0, 80)}`);
      return { prompt: prompt.slug, model: model.slug, status: "api_error", error: msg.slice(0, 200), genTime: 0, renderTime: 0 };
    }

    const genTime = ((Date.now() - startGen) / 1000).toFixed(1);
    console.log(`  ✅ ${model.slug.padEnd(14)} Generated in ${genTime}s`);

    if (!raw) {
      console.log(`     ❌ Empty response`);
      return { prompt: prompt.slug, model: model.slug, status: "empty", genTime, renderTime: 0 };
    }

    const code = extractCode(raw);
    if (!code) {
      fs.writeFileSync(path.join(promptDir, `${model.slug}_raw.txt`), raw);
      console.log(`     ❌ Could not extract manimCode`);
      return { prompt: prompt.slug, model: model.slug, status: "parse_error", genTime, renderTime: 0 };
    }

    // Save python file
    const pyPath = path.join(promptDir, `${model.slug}.py`);
    fs.writeFileSync(pyPath, code);

    // Render (sequential, not parallel, to avoid resource thrashing)
    console.log(`     🎬 Rendering...`);
    const startRender = Date.now();
    const renderResult = renderManim(pyPath, promptDir);
    const renderTime = ((Date.now() - startRender) / 1000).toFixed(1);

    if (renderResult.success) {
      console.log(`     ✅ Rendered in ${renderTime}s`);
      return { prompt: prompt.slug, model: model.slug, status: "success", genTime, renderTime };
    } else {
      console.log(`     🟡 Render failed: ${renderResult.error?.slice(0, 80)}`);
      return { prompt: prompt.slug, model: model.slug, status: "render_error", error: renderResult.error?.slice(0, 200), genTime, renderTime };
    }
  });

  // Wait for all generations for this prompt to complete
  const promptResults = await Promise.all(genPromises);
  results.push(...promptResults);
}

// ── Summary ───────────────────────────────────────────────────
console.log("\n\n" + "═".repeat(80));
console.log("  MODEL COMPARISON RESULTS");
console.log("═".repeat(80));

const statusEmoji = { success: "✅", api_error: "💥", empty: "⚪", parse_error: "🔴", render_error: "🟡" };

for (const prompt of PROMPTS) {
  console.log(`\n📋 ${prompt.slug}`);
  const promptResults = results.filter((r) => r.prompt === prompt.slug);
  for (const r of promptResults) {
    const emoji = statusEmoji[r.status] || "❓";
    const times = r.status === "success" ? `gen=${r.genTime}s render=${r.renderTime}s` : `gen=${r.genTime}s`;
    const err = r.error ? ` — ${r.error.slice(0, 80)}` : "";
    console.log(`  ${emoji} ${r.model.padEnd(14)} ${r.status.padEnd(14)} ${times}${err}`);
  }
}

// Save summary
fs.writeFileSync(
  path.join(OUT_ROOT, "results.json"),
  JSON.stringify(results, null, 2),
);
console.log(`\n📁 Videos saved to: ${OUT_ROOT}/`);
console.log(`📊 Results JSON: ${OUT_ROOT}/results.json`);

// List all videos
console.log("\n📹 Generated videos:");
for (const prompt of PROMPTS) {
  const dir = path.join(OUT_ROOT, prompt.slug);
  const mp4s = fs.readdirSync(dir).filter((f) => f.endsWith(".mp4"));
  for (const f of mp4s) {
    console.log(`   ${dir}/${f}`);
  }
}
