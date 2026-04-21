import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getVideoPath, ensureMediaDir } from "@/lib/manim-runner";
import { getJobDir } from "@/lib/pipeline/job-manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!/^[a-f0-9-]{36}$/.test(jobId)) {
    return NextResponse.json(
      { error: "Invalid job ID." },
      { status: 400 },
    );
  }

  // Try pipeline job directory first (output.mp4 or final.mp4)
  const jobDir = getJobDir(jobId);
  let videoPath: string | null = null;

  if (jobDir) {
    const outputPath = join(jobDir, "output.mp4");
    const finalPath = join(jobDir, "final.mp4");
    if (existsSync(outputPath)) {
      videoPath = outputPath;
    } else if (existsSync(finalPath)) {
      videoPath = finalPath;
    }
  }

  // Fall back to legacy flat mp4 path
  if (!videoPath) {
    videoPath = getVideoPath(jobId);
  }

  if (!videoPath) {
    return NextResponse.json(
      { error: "Video not found or not yet ready." },
      { status: 404 },
    );
  }

  try {
    const buffer = await readFile(videoPath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read video file." },
      { status: 500 },
    );
  }
}
