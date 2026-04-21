import { getGalleryEntries, getGalleryEntry } from "@/lib/gallery";
import { readManifest, getJobDir, readPlan } from "@/lib/pipeline/job-manager";

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

    let enriched = { ...entry };
    const jobDir = getJobDir(jobId);

    if (jobDir) {
      // Enrich with live manifest data if status has changed
      const manifest = readManifest(jobDir);
      if (manifest && manifest.status !== entry.status) {
        enriched = {
          ...enriched,
          status: manifest.status === "complete" ? "complete" :
                  manifest.status === "awaiting-approval" ? "awaiting-approval" :
                  manifest.status === "failed" ? "failed" : enriched.status,
          manifestStatus: manifest.status,
        };
      }

      // Always include plan data for awaiting-approval entries (from
      // either the entry status or the enriched manifest status)
      if (enriched.status === "awaiting-approval") {
        const plan = readPlan(jobDir);
        if (plan) {
          enriched = { ...enriched, plan };
        }
      }
    }

    return Response.json(enriched);
  }

  const entries = getGalleryEntries();

  // Enrich entries with live manifest data
  const enriched = entries.map((entry) => {
    let enrichedEntry = { ...entry };
    const jobDir = getJobDir(entry.jobId);
    if (jobDir) {
      const manifest = readManifest(jobDir);
      if (manifest && manifest.status !== entry.status) {
        enrichedEntry = {
          ...enrichedEntry,
          status: manifest.status === "complete" ? "complete" :
                  manifest.status === "awaiting-approval" ? "awaiting-approval" :
                  manifest.status === "failed" ? "failed" : enrichedEntry.status,
          manifestStatus: manifest.status,
        };
      }

      // Include plan data for awaiting-approval entries
      if (enrichedEntry.status === "awaiting-approval") {
        const plan = readPlan(jobDir);
        if (plan) {
          enrichedEntry = { ...enrichedEntry, plan };
        }
      }
    }
    return enrichedEntry;
  });

  return Response.json(enriched);
}