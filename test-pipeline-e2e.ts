import { config } from "dotenv";
config({ path: ".env.local" });

// Test the full pipeline end-to-end with auto-approval
async function testPipeline() {
  const start = Date.now();
  const events: { type: string; sceneId?: string; stage?: string; timestamp: number }[] = [];

  const body = {
    conceptText: "Area vs. Perimeter: The Garden Problem — Taylor wants to build a rectangular garden that is 6 meters by 4 meters. She needs fence to go around the outside and seeds to fill the inside. How much fence does she need? How many square meters of seeds?",
    mode: "lesson",
    options: {
      quality: "l",
      provider: "deepseek",
    },
  };

  console.log("=== FULL PIPELINE E2E TEST ===\n");
  console.log("Step 1: Starting pipeline...");

  // Start the pipeline (SSE stream)
  const streamResp = await fetch("http://localhost:3000/api/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!streamResp.ok) {
    console.error("Failed to start pipeline:", streamResp.status, await streamResp.text());
    console.error("\nMake sure the dev server is running: npm run dev");
    process.exit(1);
  }

  const reader = streamResp.body?.getReader();
  if (!reader) {
    console.error("No response body");
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let jobId: string | null = null;
  let plan: any = null;
  let pipelineDone = false;

  // Read events until plan-awaiting-approval
  while (!plan) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;

      try {
        const event = JSON.parse(json);
        const ts = Date.now() - start;
        events.push({ type: event.type, sceneId: event.sceneId, stage: event.stage, timestamp: ts });

        if (event.type === "pipeline-started") {
          jobId = event.jobId;
          console.log(`  Pipeline started: jobId=${jobId} (${ts}ms)`);
        } else if (event.type === "plan-ready") {
          console.log(`  Plan ready: "${event.plan?.title}" — ${event.plan?.sceneBreakdown?.length} scenes (${ts}ms)`);
        } else if (event.type === "plan-awaiting-approval") {
          plan = event.plan;
          jobId = event.jobId || jobId;
          console.log(`  Plan awaiting approval (${ts}ms)`);
        } else if (event.type === "pipeline-error") {
          console.log(`\n  ✗ Pipeline error during plan: ${event.error} (${ts}ms)`);
          process.exit(1);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // Step 2: Auto-approve the plan
  console.log("\nStep 2: Auto-approving plan...");
  const approveStart = Date.now();
  const approveResp = await fetch(`http://localhost:3000/api/pipeline/${jobId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve-plan", plan }),
  });

  if (!approveResp.ok) {
    console.error("Failed to approve plan:", approveResp.status, await approveResp.text());
    process.exit(1);
  }
  console.log(`  Plan approved (${Date.now() - approveStart}ms)`);

  // Step 3: Reconnect to SSE stream for build phase
  console.log("\nStep 3: Listening to build events...");
  const buildStart = Date.now();
  const buildResp = await fetch(`http://localhost:3000/api/pipeline/${jobId}/stream`);

  if (!buildResp.ok) {
    console.error("Failed to connect to build stream:", buildResp.status);
    process.exit(1);
  }

  const buildReader = buildResp.body?.getReader();
  if (!buildReader) {
    console.error("No build stream body");
    process.exit(1);
  }

  let buildBuffer = "";
  const sceneStates: Record<string, string> = {};

  while (!pipelineDone) {
    const { done, value } = await buildReader.read();
    if (done) break;

    buildBuffer += decoder.decode(value, { stream: true });
    const lines = buildBuffer.split("\n");
    buildBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;

      try {
        const event = JSON.parse(json);
        const ts = Date.now() - buildStart;
        events.push({ type: event.type, sceneId: event.sceneId, stage: event.stage, timestamp: ts });

        if (event.type === "scene-generating") {
          sceneStates[event.sceneId] = "generating";
          console.log(`  Scene generating: ${event.sceneId} (${ts}ms)`);
        } else if (event.type === "scene-ready") {
          sceneStates[event.sceneId] = "ready";
          console.log(`  ✓ Scene ready: ${event.sceneId} (${ts}ms)`);
        } else if (event.type === "scene-failed") {
          sceneStates[event.sceneId] = "failed";
          console.log(`  ✗ Scene failed: ${event.sceneId} — ${event.error} (${ts}ms)`);
        } else if (event.type === "pipeline-complete") {
          pipelineDone = true;
          console.log(`\n  Pipeline complete! (${ts}ms)`);
        } else if (event.type === "pipeline-error") {
          pipelineDone = true;
          console.log(`\n  ✗ Pipeline error: ${event.error} (${ts}ms)`);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  const total = Date.now() - start;

  console.log("\n=== SUMMARY ===");
  console.log(`Total time: ${total}ms (${(total / 1000).toFixed(1)}s)`);
  console.log(`Job ID: ${jobId}`);

  const readyScenes = Object.entries(sceneStates).filter(([, s]) => s === "ready");
  const failedScenes = Object.entries(sceneStates).filter(([, s]) => s === "failed");
  console.log(`Scenes ready: ${readyScenes.length}`);
  console.log(`Scenes failed: ${failedScenes.length}`);

  if (readyScenes.length > 0) {
    const firstSceneTime = events.find((e) => e.type === "scene-ready")?.timestamp ?? 0;
    console.log(`Time to first scene: ${firstSceneTime}ms (${(firstSceneTime / 1000).toFixed(1)}s)`);
    const lastSceneTime = [...events].reverse().find((e) => e.type === "scene-ready")?.timestamp ?? 0;
    console.log(`Time to last scene: ${lastSceneTime}ms (${(lastSceneTime / 1000).toFixed(1)}s)`);
  }

  const fs = await import("node:fs");
  fs.writeFileSync(
    "pipeline-test-results.json",
    JSON.stringify({ total, jobId, sceneStates, events }, null, 2)
  );
  console.log("\nResults saved to pipeline-test-results.json");
}

testPipeline().catch((e) => {
  console.error("Test crashed:", e);
  process.exit(1);
});
