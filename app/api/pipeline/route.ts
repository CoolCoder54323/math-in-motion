import { executePipeline } from "@/lib/pipeline/executor";
import { cleanupStaleJobs } from "@/lib/pipeline/job-manager";
import { saveToGallery } from "@/lib/gallery";
import type {
  GeneratedScene,
  PipelineEvent,
  PipelineInput,
  PipelineMode,
  PipelineStage,
  PlanOutput,
} from "@/lib/pipeline/types";

export const maxDuration = 300;

type Body = {
  conceptText?: string;
  latexProblem?: string;
  mode?: PipelineMode;
  resumeFrom?: PipelineStage;
  cachedPlan?: PlanOutput;
  cachedScenes?: GeneratedScene[];
  options?: {
    quality?: "l" | "m" | "h";
    skipPostProcess?: boolean;
    provider?: "anthropic" | "openai" | "deepseek";
  };
};

export async function POST(request: Request) {
  cleanupStaleJobs();

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Expected a JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const conceptText = (body.conceptText ?? "").trim();
  const latexProblem = (body.latexProblem ?? "").trim();

  if (!conceptText && !latexProblem) {
    return new Response(
      JSON.stringify({ error: "Provide either 'conceptText' or 'latexProblem'." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const mode: PipelineMode = body.mode === "viz" ? "viz" : "lesson";

  const input: PipelineInput = {
    conceptText: conceptText || undefined,
    latexProblem: latexProblem || undefined,
    mode,
    resumeFrom: body.resumeFrom,
    cachedPlan: body.cachedPlan,
    cachedScenes: body.cachedScenes,
    options: body.options,
  };

  const encoder = new TextEncoder();

  // The pipeline runs independently — client disconnect does NOT abort it.
  // Gallery entries are updated at each stage transition inside the executor.
  // The gallery is the source of truth for job status, allowing users to
  // leave and come back later.
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream already closed — pipeline continues in background
        }
      };

      const onEvent = (event: PipelineEvent) => {
        send(event);
        if (event.type === "pipeline-complete") {
          try {
            const manifest = event.manifest;
            if (manifest.status === "complete" && manifest.finalArtifact) {
              saveToGallery(manifest.jobId, manifest, conceptText || undefined);
            }
          } catch {
            // Gallery save is best-effort
          }
          try { controller.close(); } catch {}
        }
        if (event.type === "pipeline-error") {
          try { controller.close(); } catch {}
        }
      };

      // Run the pipeline — runs to completion regardless of client connection.
      // The onEvent callback sends SSE events to the connected client.
      // If the client disconnects, send() silently fails and pipeline continues.
      executePipeline(input, onEvent).catch(() => {
        // Unhandled errors are already signaled via pipeline-error event
      });
    },
    cancel() {
      // Client disconnected — pipeline continues running in background.
      // Status is persisted to gallery.json at each stage transition.
      // User can resume from the gallery later.
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}