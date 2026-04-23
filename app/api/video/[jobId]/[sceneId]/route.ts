import { NextResponse } from "next/server";
import { existsSync } from "node:fs";

import { getJobDir } from "@/lib/pipeline/job-manager";
import { createVideoResponse } from "@/lib/pipeline/video-response";
import { safeJobPath } from "@/lib/pipeline/fs-paths";
import { parseSceneId } from "@/lib/pipeline/contracts";

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

  const parsedSceneId = parseSceneId(sceneId);
  if (!parsedSceneId) {
    return NextResponse.json({ error: "Invalid scene ID." }, { status: 400 });
  }

  const jobDir = getJobDir(jobId);
  if (!jobDir) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const clipPath = safeJobPath(jobDir, "clips", parsedSceneId, "mp4");
  if (!existsSync(clipPath)) {
    return NextResponse.json(
      { error: "Scene clip not found or not yet rendered." },
      { status: 404 },
    );
  }

  try {
    return createVideoResponse(_request, clipPath);
  } catch {
    return NextResponse.json(
      { error: "Failed to stream clip file." },
      { status: 500 },
    );
  }
}
