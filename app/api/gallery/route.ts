import { getGalleryEntries, getGalleryEntry, deleteGalleryEntry, type GalleryEntry } from "@/lib/gallery";
import { deleteJobDir, getJobDir, readManifest, readPlan, loadSceneStates } from "@/lib/pipeline/job-manager";
import { getController, removeController } from "@/lib/pipeline/executor";
import type { PipelineManifest, PlanOutput, PipelineStage } from "@/lib/pipeline/types";
import { existsSync } from "node:fs";
import { join } from "node:path";

type EnrichedEntry = GalleryEntry & {
  manifestStatus?: string;
  plan?: unknown;
  sceneStates?: Record<string, unknown>;
  thumbnailUrl?: string;
  failedSceneCount?: number;
};

/**
 * Derive a gallery-friendly status from the manifest.
 * If the manifest says "running", we infer "generating" or "building"
 * from which stages have completed.
 */
function deriveStatusFromManifest(manifest: PipelineManifest): GalleryEntry["status"] {
  if (manifest.status === "complete") return "complete";
  if (manifest.status === "failed") return "failed";
  if (manifest.status === "interrupted") return "failed";
  if (manifest.status === "awaiting-approval") return "awaiting-approval";
  if (manifest.status === "paused") return "generating";

  // For "running" (or legacy "generating"/"building"), derive from stages
  const planStage = manifest.stages.find((s) => s.stage === "plan");
  const planDone = planStage?.status === "success";

  if (planDone) {
    return "building";
  }
  return "generating";
}

/**
 * Derive the current stage from the manifest by looking at which stages
 * have completed and which is in-progress.
 */
function deriveCurrentStageFromManifest(manifest: PipelineManifest): PipelineStage | undefined {
  if (manifest.currentStage) return manifest.currentStage;

  const stageOrder: PipelineStage[] = ["plan", "codegen", "validate", "render", "postprocess", "compose"];
  for (const stage of stageOrder) {
    const s = manifest.stages.find((st) => st.stage === stage);
    if (!s || s.status !== "success") {
      return stage;
    }
  }
  return undefined;
}

function enrichEntry(entry: GalleryEntry): EnrichedEntry {
  let enrichedEntry: EnrichedEntry = { ...entry };
  const jobDir = getJobDir(entry.jobId);

  if (jobDir) {
    const manifest = readManifest(jobDir);
    const plan = readPlan(jobDir);

    if (manifest) {
      const derivedStatus = deriveStatusFromManifest(manifest);
      const derivedStage = deriveCurrentStageFromManifest(manifest);

      enrichedEntry = {
        ...enrichedEntry,
        status: derivedStatus,
        currentStage: derivedStage ?? enrichedEntry.currentStage,
        manifestStatus: manifest.status,
      };
    }

    // Always return plan if it exists, not just for awaiting-approval
    if (plan) {
      enrichedEntry = { ...enrichedEntry, plan };
    }

    if (enrichedEntry.status !== "complete") {
      const states = loadSceneStates(jobDir, entry.jobId, manifest, plan as PlanOutput | null);
      if (Object.keys(states).length > 0) {
        const failedSceneCount = Object.values(states).filter((s) => s.status === "failed").length;
        enrichedEntry = { ...enrichedEntry, sceneStates: states, failedSceneCount };
      }
    }

    // Add thumbnail URL if it exists
    if (existsSync(join(jobDir, "thumbnail.jpg"))) {
      enrichedEntry = { ...enrichedEntry, thumbnailUrl: `/api/thumbnail/${entry.jobId}` };
    }
  }

  return enrichedEntry;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const entry = getGalleryEntry(jobId);
    if (!entry) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const enriched = enrichEntry(entry);
    return Response.json(enriched);
  }

  const entries = getGalleryEntries();
  const enriched = entries.map(enrichEntry);

  return Response.json(enriched);
}

export async function DELETE(request: Request) {
  let jobId: string | null = null;

  try {
    const body = await request.json();
    if (body && typeof body === "object" && "jobId" in body) {
      jobId = body.jobId as string;
    }
  } catch {}

  if (!jobId) {
    const { searchParams } = new URL(request.url);
    jobId = searchParams.get("jobId");
  }

  if (!jobId || !/^[a-f0-9-]{36}$/.test(jobId)) {
    return new Response(JSON.stringify({ error: "Missing or invalid jobId." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Try to abort any active pipeline
  const controller = getController(jobId);
  if (controller) {
    try {
      controller.abort.abort();
      if (controller.pausePromise) controller.resume();
      if (controller.approvePlan && controller.currentPlan) {
        controller.approvePlan(controller.currentPlan);
      }
      if (controller.currentSceneAbort) controller.currentSceneAbort.abort();
    } catch {}
    removeController(jobId);
  }

  // Remove from gallery
  deleteGalleryEntry(jobId);

  // Remove job files
  deleteJobDir(jobId);

  return Response.json({ ok: true });
}