import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join(process.cwd(), ".manim-output", "assets");

function ensureDir() {
  mkdirSync(ASSETS_DIR, { recursive: true });
}

function sanitizeFilename(name: string): string {
  // Remove path traversal characters and keep only safe chars
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/* ------------------------------------------------------------------ */
/*  GET  — list all uploaded assets                                     */
/* ------------------------------------------------------------------ */
export async function GET() {
  ensureDir();
  const files = readdirSync(ASSETS_DIR).filter((f) => {
    const ext = f.split(".").pop()?.toLowerCase();
    return ext && ["png", "jpg", "jpeg", "svg", "gif", "webp"].includes(ext);
  });

  const assets = files.map((name) => {
    const path = join(ASSETS_DIR, name);
    const stats = readFileSync(path);
    return {
      name,
      size: stats.length,
      url: `/api/assets/${encodeURIComponent(name)}`,
    };
  });

  return new Response(JSON.stringify({ assets }), {
    headers: { "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/*  POST  — upload one or more asset files                              */
/* ------------------------------------------------------------------ */
export async function POST(request: Request) {
  ensureDir();

  const formData = await request.formData();
  const files: File[] = [];

  for (const [, value] of formData.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return new Response(
      JSON.stringify({ error: "No files provided." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const uploaded: string[] = [];

  for (const file of files) {
    const safeName = sanitizeFilename(file.name);
    // If file already exists, append a counter
    let finalName = safeName;
    let counter = 1;
    while (
      readdirSync(ASSETS_DIR).some(
        (f) => f.toLowerCase() === finalName.toLowerCase(),
      )
    ) {
      const parts = safeName.split(".");
      const ext = parts.pop();
      finalName = `${parts.join(".")}_${counter}.${ext}`;
      counter++;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(ASSETS_DIR, finalName), buffer);
    uploaded.push(finalName);
  }

  return new Response(JSON.stringify({ uploaded }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/*  DELETE  — remove an asset by name                                   */
/* ------------------------------------------------------------------ */
export async function DELETE(request: Request) {
  ensureDir();

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return new Response(
      JSON.stringify({ error: "Missing 'name' query parameter." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const safeName = sanitizeFilename(name);
  const filePath = join(ASSETS_DIR, safeName);

  try {
    unlinkSync(filePath);
  } catch {
    return new Response(
      JSON.stringify({ error: "File not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ deleted: safeName }), {
    headers: { "Content-Type": "application/json" },
  });
}
