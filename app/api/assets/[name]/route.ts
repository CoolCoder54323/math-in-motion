import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join(process.cwd(), ".manim-output", "assets");

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const filePath = join(ASSETS_DIR, decoded);

  // Security: prevent path traversal
  if (!filePath.startsWith(ASSETS_DIR)) {
    return new Response("Not found", { status: 404 });
  }

  if (!existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const ext = decoded.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const buffer = readFileSync(filePath);

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
