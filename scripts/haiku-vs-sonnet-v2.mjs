#!/usr/bin/env node
/**
 * Quick Haiku vs Sonnet comparison on 2 default examples
 * Tests animation quality difference between models
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Read env
let envContent = "";
try {
  envContent = fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8");
} catch {
  console.warn("Warning: .env.local not found");
}

const ANTHROPIC_KEY =
  process.env.ANTHROPIC_API_KEY ||
  envContent.match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();

if (!ANTHROPIC_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not found");
  process.exit(1);
}

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

// Load system prompt
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

const SYSTEM_PROMPT = `You are an expert K-8 math educator and Manim Community animation director. You write flawless, mathematically precise Manim Python code.

Return ONLY valid Python code that can be executed by Manim. No JSON, no markdown, no explanation. Just the code.

Your code MUST:
- Import from manim at the top: from manim import *
- Define exactly ONE class that extends Scene
- Use MathTex (NOT MathTeX) for math
- Be syntactically correct Python
- Have proper indentation
- Include config.background_color if needed

Here are 5 gold v2 examples of the format:

EXAMPLE 1:
\`\`\`python
${EF}
\`\`\`

EXAMPLE 2:
\`\`\`python
${EP}
\`\`\`

EXAMPLE 3:
\`\`\`python
${ED}
\`\`\`

EXAMPLE 4:
\`\`\`python
${EA}
\`\`\`

EXAMPLE 5:
\`\`\`python
${EC}
\`\`\`

Generate code in this exact format. Nothing else.`;

// 2 test prompts
const PROMPTS = [
  {
    slug: "fractions",
    text: "Show me how to add fractions with unlike denominators, step by step, using a visual pizza-slice example.",
  },
  {
    slug: "area-perimeter",
    text: "Help students understand the difference between area and perimeter using a rectangular garden example.",
  },
];

// Generate code for a single prompt + model
async function generateCode(prompt, model) {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract Python code - remove markdown fences and get the code
    let code = text
      .replace(/```python\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Ensure it starts with an import
    if (!code.startsWith("from manim import") && !code.startsWith("import")) {
      // Try to extract from markdown or JSON
      const match = code.match(/(?:from manim import|import)[\s\S]*?(?=\nclass|\Z)/);
      if (match) code = match[0];
    }

    return { code, length: code.length };
  } catch (error) {
    console.error(`  ❌ Generation failed: ${error.message}`);
    return null;
  }
}

// Render Manim animation
function renderAnimation(pythonCode, outputPath) {
  try {
    const scriptPath = `/tmp/${Date.now()}_manim_${Math.random().toString(36).slice(2)}.py`;
    fs.writeFileSync(scriptPath, pythonCode);

    const pythonBin = "/Users/nicholasdixon/anaconda3/envs/prop_api/bin/python";
    execSync(
      `${pythonBin} -m manim -ql --disable_caching ${scriptPath} 2>&1`,
      {
        stdio: "pipe",
        timeout: 120000,
      }
    );

    // Find the generated video
    const videoDir = path.dirname(scriptPath);
    const candidates = [
      path.join(videoDir, "videos/1080p60/partial_movie_file_list.txt"),
      path.join(videoDir, "videos/1080p60/*.mp4"),
    ];

    let found = false;
    for (const cand of candidates) {
      try {
        if (cand.includes("*")) {
          // glob pattern
          const files = fs.readdirSync(path.dirname(cand)).filter(f => f.endsWith(".mp4"));
          if (files.length > 0) {
            const src = path.join(path.dirname(cand), files[0]);
            fs.copyFileSync(src, outputPath);
            found = true;
            break;
          }
        } else if (fs.existsSync(cand)) {
          fs.copyFileSync(cand, outputPath);
          found = true;
          break;
        }
      } catch {}
    }

    fs.unlinkSync(scriptPath);
    return found;
  } catch (error) {
    console.error(`    Render error: ${error.message}`);
    return false;
  }
}

// Main
async function main() {
  const outDir = "/tmp/haiku-vs-sonnet";
  fs.mkdirSync(outDir, { recursive: true });

  console.log("🧪 Haiku vs Sonnet Comparison\n");

  for (const prompt of PROMPTS) {
    console.log(`📝 ${prompt.slug}`);

    const models = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"];

    for (const model of models) {
      const modelName = model.includes("haiku") ? "haiku" : "sonnet";
      process.stdout.write(`  ${modelName}: `);

      const result = await generateCode(prompt.text, model);
      if (!result) continue;

      const pyPath = path.join(outDir, `${prompt.slug}_${modelName}.py`);
      fs.writeFileSync(pyPath, result.code);
      console.log(`✓ code (${result.length} chars)`);

      // Now render
      process.stdout.write(`         rendering... `);
      const mp4Path = path.join(outDir, `${prompt.slug}_${modelName}.mp4`);
      const rendered = renderAnimation(result.code, mp4Path);
      if (rendered && fs.existsSync(mp4Path)) {
        const size = (fs.statSync(mp4Path).size / 1024).toFixed(1);
        console.log(`✓ (${size}KB)`);
      } else {
        console.log(`✗ (render failed)`);
      }
    }

    console.log();
  }

  console.log(`✅ Files in /tmp/haiku-vs-sonnet:`);
  const files = fs.readdirSync(outDir).sort();
  files.forEach((f) => {
    const stat = fs.statSync(path.join(outDir, f));
    const size = stat.isFile() ? ` (${(stat.size / 1024).toFixed(1)}KB)` : "";
    console.log(`  - ${f}${size}`);
  });
}

main().catch(console.error);
