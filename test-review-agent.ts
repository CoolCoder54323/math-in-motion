import { config } from "dotenv";
config({ path: ".env.local" });

import { reviewSceneCode } from "./lib/pipeline/stages/review";

async function testReview() {
  const badCode = `from manim import *

class TestScene(Scene):
    def construct(self):
        arrow = Arrow(LEFT, RIGHT)
        arrow.rotate_to_angle(PI/4)
        self.add(arrow)
        self.wait(1)
`;

  const error = `AttributeError: Arrow object has no attribute 'rotate_to_angle'`;

  console.log("Testing review agent...\n");

  const result = await reviewSceneCode({
    pythonCode: badCode,
    error,
    sceneId: "test_scene",
    apiKey: process.env.DEEPSEEK_API_KEY!,
    provider: "deepseek",
  });

  if (result.pythonCode) {
    console.log("✓ Review agent returned fixed code:\n");
    console.log(result.pythonCode);
  } else {
    console.log("✗ Review agent failed or returned null");
  }
}

testReview().catch(console.error);
