import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getJobDir } from "@/lib/pipeline/job-manager";

/**
 * GET /api/video/[jobId]/[sceneId]
 *
 * Serves individual per-scene clips from the job's clips/ directory.
 * This enables live preview of each scene as it finishes rendering,
 * before the full postprocess/compose pipeline completes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; sceneId: string }> },
) {
  const { jobId, sceneId } = await params;

  if (!/^[a-f0-9-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(sceneId)) {
    return NextResponse.json({ error: "Invalid scene ID." }, { status: 400 });
  }

  const jobDir = getJobDir(jobId);
  if (!jobDir) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const clipPath = join(jobDir, "clips", `${sceneId}.mp4`);
  if (!existsSync(clipPath)) {
    return NextResponse.json(
      { error: "Scene clip not found or not yet rendered." },
      { status: 404 },
    );
  }

  try {
    const buffer = await readFile(clipPath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read clip file." },
      { status: 500 },
    );
  }
}
