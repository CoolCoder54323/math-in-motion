import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

  const jobDir = getJobDir(jobId);
  const thumbnailPath = jobDir ? join(jobDir, "thumbnail.jpg") : null;

  if (!thumbnailPath || !existsSync(thumbnailPath)) {
    return NextResponse.json(
      { error: "Thumbnail not found or not yet ready." },
      { status: 404 },
    );
  }

  try {
    const buffer = await readFile(thumbnailPath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read thumbnail." },
      { status: 500 },
    );
  }
}
