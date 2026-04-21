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

const EF = loadExample("fraction_multiply.py");
const ED = loadExample("long_division.py");
const ES = loadExample("subtraction_regrouping.py");

const SYSTEM_PROMPT = `You are an expert K-8 math educator and Manim Community animation director. You write flawless, mathematically precise Manim Python code. Accuracy and polish come first.

You MUST respond with a single JSON object matching this schema EXACTLY — no markdown fences, no commentary outside the JSON:

{
  "title": string,
  "estimatedDuration": number,
  "steps": [
    { "action": string, "duration": number, "description": string, "manimCode": string }
  ]
}

Here are 3 gold-standard examples:

EXAMPLE 1 — Fraction Multiplication:
\`\`\`python
${EF}
\`\`\`

EXAMPLE 2 — Long Division:
\`\`\`python
${ED}
\`\`\`

EXAMPLE 3 — Subtraction with Regrouping:
\`\`\`python
${ES}
\`\`\`

Requirements:
- ALWAYS use MathTex (NOT MathTeX) for math text
- ALWAYS use FadeIn, FadeOut, Write, Indicate for standard animations
- NEVER use deprecated or non-existent Manim objects
- ALWAYS validate your code for correctness before outputting
- Ensure mathematical accuracy and pedagogical clarity
- Output ONLY the JSON object, nothing else`;

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

    // Extract Python code directly - look for indented Python code blocks
    // Strategy: Extract content between "manimCode" key and the next key or end
    const codeBlocks = [];

    // Find all Python code blocks (after "manimCode": and before the next key)
    const codeRegex = /"manimCode"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let match;
    while ((match = codeRegex.exec(text)) !== null) {
      // Unescape the string
      const escaped = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      codeBlocks.push(escaped);
    }

    // If regex didn't work, try extracting Python code blocks (lines starting with spaces/self.play)
    if (codeBlocks.length === 0) {
      const lines = text.split("\n");
      let currentBlock = "";
      for (const line of lines) {
        // Collect lines that look like Python code
        if (/^\s*(from|import|class|def|self\.|    )/.test(line) && line.trim().length > 0) {
          currentBlock += line + "\n";
        } else if (currentBlock.length > 0 && line.trim().length === 0) {
          // Empty line might be code separator
          codeBlocks.push(currentBlock.trim());
          currentBlock = "";
        }
      }
      if (currentBlock.length > 0) {
        codeBlocks.push(currentBlock.trim());
      }
    }

    // Combine all code blocks
    const code = codeBlocks.length > 0
      ? codeBlocks.join("\n\n")
      : "# No Manim code generated";

    return { code, metadata: { text: text.substring(0, 500) } };
  } catch (error) {
    console.error(`  ❌ Generation failed: ${error.message}`);
    return null;
  }
}

// Render Manim animation
function renderAnimation(pythonCode, outputPath) {
  try {
    const scriptPath = `/tmp/${Date.now()}_manim.py`;
    fs.writeFileSync(scriptPath, pythonCode);

    const pythonBin =
      "/Users/nicholasdixon/anaconda3/envs/prop_api/bin/python";
    execSync(
      `${pythonBin} -m manim -ql --disable_caching -o render.mp4 ${scriptPath}`,
      {
        cwd: "/tmp",
        stdio: "pipe",
      }
    );

    const srcVideo = "/tmp/videos/1080p60/partial_movie_file_list.txt";
    if (fs.existsSync(srcVideo)) {
      fs.copyFileSync(srcVideo, outputPath);
    }

    fs.unlinkSync(scriptPath);
    return true;
  } catch {
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
      console.log(`✓ (${result.code.length} chars)`);
    }

    console.log();
  }

  console.log(`✅ Generated code saved to: ${outDir}`);
  console.log("\nGenerated files:");
  fs.readdirSync(outDir).forEach((f) => {
    console.log(`  - ${f}`);
  });
}

main().catch(console.error);
