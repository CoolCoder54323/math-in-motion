import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const examples = [
  "gold_v2_fraction_pizza_addition.py",
  "gold_v2_place_value_blocks.py",
  "gold_v2_distributive_property_array.py",
  "gold_v2_area_perimeter_garden.py",
  "gold_v2_fraction_to_percent_grid.py",
];

for (const filename of examples) {
  const source = readFileSync(`lib/manim-examples/${filename}`, "utf-8");
  assert.match(source, /from manim import \*/, `${filename} should be standalone Manim code.`);
  assert.match(source, /import numpy as np/, `${filename} should include numpy for geometry-compatible patterns.`);
  assert.match(source, /config\.background_color = BG/, `${filename} should set the shared background.`);
  assert.match(source, /class Lesson\(Scene\):/, `${filename} should expose class Lesson.`);
  assert.match(source, /def construct\(self\):/, `${filename} should define construct.`);
  assert.match(source, /def clean_exit\(self\):/, `${filename} should fade out at scene end.`);
  assert.match(source, /FadeOut\(mob\) for mob in self\.mobjects/, `${filename} should clean all mobjects.`);
  assert.match(source, /Visual QA notes:/, `${filename} should document visual checks.`);
  assert.doesNotMatch(source, /always_redraw|updater|ValueTracker/, `${filename} should avoid fragile dynamic constructs.`);
}

console.log("gold v2 example convention checks passed");
