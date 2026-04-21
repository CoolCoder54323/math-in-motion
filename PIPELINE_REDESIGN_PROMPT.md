# Pipeline Redesign: K-8 Math Animation Generator

## Current Pipeline
Prompt → Plan (LLM creates lesson structure) → Codegen (LLM writes per-scene Manim) → Validate → Render → Postprocess

## Plan Schema Includes:
- steps (visual actions + narration)
- sceneBreakdown (3–6 scenes with descriptions + math content)

## Problem
Outputs are technically clean and mathematically correct, but feel "non-teaching" — too passive, slightly rushed, not very engaging for students. They lack clear attention direction, prediction moments, and conceptual scaffolding.

## Observed Issues:
- Animations show results but don't guide thinking
- No enforced pauses or timing for student processing
- Weak alignment between plan (pedagogy) and codegen (visual execution)
- Too many elements on screen at once in some scenes
- Colors and visuals are consistent but not semantically meaningful
- Limited use of highlighting / focus to direct attention
- No explicit handling of misconceptions or student interaction

## Question:
How would you redesign this system (especially the plan schema + codegen constraints) so that generated animations are:

1. **Pedagogically strong** (active learning, scaffolding, misconceptions)
2. **Visually clear** (no overload, strong focus, intentional pacing)
3. **Consistently high-quality** across different math topics

## Especially Interested In:
- Improvements to the planning representation
- Constraints or patterns for code generation
- Automatic validation or scoring of lesson quality

## Current Codegen System Prompt:
```
You are an expert Manim Community animation programmer. You receive a lesson plan with a scene breakdown and must produce Manim Python code for EACH scene.

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
- `from manim import *` and `import numpy as np`
- The full palette constants (BG, INK, PINK, SKY, GRASS, SUN, GRAPE, ORANGE, PANEL_BG)
- `config.background_color = BG`
- `def T(s, size=40, color=INK)` helper
- `def build_mascot()` helper
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

... (spatial precision, common pitfalls, rate_func restrictions)
```

## Examples Loaded:
- lib/manim-examples/fraction_multiply.py
- lib/manim-examples/long_division.py
- lib/manim-examples/subtraction_regrouping.py
