import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getVideoPath, ensureMediaDir } from "@/lib/manim-runner";

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

  const videoPath = getVideoPath(jobId);
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