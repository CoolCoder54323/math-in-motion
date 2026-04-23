import { createReadStream, existsSync, statSync } from "node:fs";
import { NextResponse } from "next/server";

function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || end >= size) return null;

  return { start, end };
}

export function createVideoResponse(request: Request, filePath: string): Response {
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Video not found or not yet ready." }, { status: 404 });
  }

  const size = statSync(filePath).size;
  const range = request.headers.get("range");

  if (range) {
    const parsed = parseRange(range, size);
    if (!parsed) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }

    const { start, end } = parsed;
    const chunkSize = end - start + 1;
    const nodeStream = createReadStream(filePath, { start, end });

    return new Response(nodeStream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const nodeStream = createReadStream(filePath);
  return new Response(nodeStream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
