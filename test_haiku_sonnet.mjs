#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

const ANTHROPIC_KEY = fs.readFileSync(".env.local", "utf-8")
  .match(/ANTHROPIC_API_KEY=(.*)/)?.[1]?.trim();

const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

async function test() {
  const prompt = `Generate a simple Manim scene animating 1/3 + 1/4 = 7/12. Return ONLY Python code:
  
from manim import *

class AddFractions(Scene):
    def construct(self):
        frac1 = MathTex(r"\\frac{1}{3}")
        plus = MathTex("+")
        frac2 = MathTex(r"\\frac{1}{4}")
        equals = MathTex("=")
        result = MathTex(r"\\frac{7}{12}")
        
        group = VGroup(frac1, plus, frac2, equals, result).arrange(RIGHT)
        
        self.play(Write(group), run_time=2)
        self.wait(1)`;

  for (const model of ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"]) {
    console.log(`\nTesting ${model}...`);
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const code = response.content[0].text
      .replace(/```python\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    fs.writeFileSync(`/tmp/${model.split("-")[1]}_test.py`, code);
    console.log(`✓ Saved to /tmp/${model.split("-")[1]}_test.py (${code.length} chars)`);
  }
}

test().catch(console.error);
