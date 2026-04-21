import { NextResponse } from "next/server";
import { getJobDir, readManifest } from "@/lib/pipeline/job-manager";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!/^[a-f0-9-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
  }

  const jobDir = getJobDir(jobId);
  if (!jobDir) {
    return NextResponse.json(
      { error: "Job not found." },
      { status: 404 },
    );
  }

  const manifest = readManifest(jobDir);
  if (!manifest) {
    return NextResponse.json(
      { error: "Manifest not found — job may still be running." },
      { status: 404 },
    );
  }

  return NextResponse.json(manifest);
}
