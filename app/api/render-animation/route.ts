import { NextResponse } from "next/server";

import {
  renderManimScene,
  cleanupStaleJobs,
  type RenderResult,
} from "@/lib/manim-runner";

export const maxDuration = 120;

type Body = {
  manimCode: string;
  quality?: "l" | "m" | "h";
};

export async function POST(request: Request) {
  cleanupStaleJobs();

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected a JSON body." },
      { status: 400 },
    );
  }

  if (!body.manimCode || typeof body.manimCode !== "string") {
    return NextResponse.json(
      { success: false, error: "Missing or invalid 'manimCode' field." },
      { status: 400 },
    );
  }

  const result: RenderResult = await renderManimScene(body.manimCode, {
    quality: body.quality ?? "l",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        stderr: result.stderr,
      },
      { status: 502 },
    );
  }

  const jobId = result.videoPath
    .split("/")
    .pop()
    ?.replace(".mp4", "") ?? "";

  return NextResponse.json({
    success: true,
    jobId,
    videoUrl: `/api/video/${jobId}`,
  });
}