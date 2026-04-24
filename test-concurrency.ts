import { config } from "dotenv";
config({ path: ".env.local" });

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("DEEPSEEK_API_KEY missing");
  process.exit(1);
}

const SYSTEM = `You are an expert Manim Community animation programmer. Respond with JSON only matching the schema: {"scenes":[{"sceneId":"...","className":"...","pythonCode":"..."}]}`;

const TASK = `LESSON PLAN:
Title: Area vs. Perimeter: The Garden Problem
Total duration: 71s

SCENE TO GENERATE:
  sceneId: "introduce_perimeter"
  Estimated length: 10s
  Description: A bug animates a glowing path around the outer edge of the garden. The word 'Perimeter' appears with an arrow pointing to the path. Side lengths 6 m and 4 m are labeled.
  Math content: 6\\text{ m}, \\; 4\\text{ m}, \\; \\text{Perimeter}
  Role: introduce

Generate ONE self-contained Manim Python file for this scene. Respond with JSON only.`;

async function callDeepSeek(label: string): Promise<{ elapsed: number; promptTokens: number; completionTokens: number; ok: boolean }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
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
          { role: "system", content: SYSTEM },
          { role: "user", content: TASK },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await resp.json();
    const elapsed = Date.now() - start;

    if (data.error) {
      console.log(`${label} ERROR:`, JSON.stringify(data.error).slice(0, 200));
      return { elapsed: -1, promptTokens: 0, completionTokens: 0, ok: false };
    }

    const usage = data.usage || {};
    return {
      elapsed,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      ok: true,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    console.log(`${label} FAILED:`, err.name, err.message?.slice(0, 100));
    return { elapsed: -1, promptTokens: 0, completionTokens: 0, ok: false };
  }
}

async function main() {
  console.log("=== DEEPSEEK CONCURRENCY TEST (7 parallel calls) ===\n");

  const start = Date.now();

  // Fire all 7 calls in parallel
  const promises = Array.from({ length: 7 }, (_, i) =>
    callDeepSeek(`Scene ${i + 1}`)
  );

  const results = await Promise.all(promises);
  const totalElapsed = Date.now() - start;

  const okResults = results.filter((r) => r.ok);
  const failedResults = results.filter((r) => !r.ok);

  console.log("\n=== RESULTS ===");
  console.log(`Total wall-clock time for 7 parallel calls: ${totalElapsed}ms (${(totalElapsed / 1000).toFixed(1)}s)`);
  console.log(`Successful: ${okResults.length}/7`);
  console.log(`Failed: ${failedResults.length}/7`);

  if (okResults.length > 0) {
    const avgElapsed = okResults.reduce((s, r) => s + r.elapsed, 0) / okResults.length;
    const minElapsed = Math.min(...okResults.map((r) => r.elapsed));
    const maxElapsed = Math.max(...okResults.map((r) => r.elapsed));
    const totalPromptTokens = okResults.reduce((s, r) => s + r.promptTokens, 0);
    const totalCompletionTokens = okResults.reduce((s, r) => s + r.completionTokens, 0);

    console.log(`\nPer-call stats:`);
    console.log(`  Average: ${avgElapsed.toFixed(0)}ms`);
    console.log(`  Min: ${minElapsed}ms`);
    console.log(`  Max: ${maxElapsed}ms`);
    console.log(`  Spread: ${maxElapsed - minElapsed}ms`);
    console.log(`  Total prompt tokens: ${totalPromptTokens.toLocaleString()}`);
    console.log(`  Total completion tokens: ${totalCompletionTokens.toLocaleString()}`);
    console.log(`\nSpeedup vs sequential: ${((avgElapsed * 7) / totalElapsed).toFixed(2)}x`);
  }
}

main().catch((e) => {
  console.error("Test crashed:", e);
  process.exit(1);
});
