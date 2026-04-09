import { NextResponse } from "next/server";

/**
 * POST /api/ocr
 *
 * Accepts a multipart/form-data request with a single `file` field (PNG, JPG,
 * or PDF). Forwards the image to the Mathpix `v3/text` endpoint and returns a
 * normalized `{ success, latex, text }` payload.
 */
export async function POST(request: Request) {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;

  if (!appId || !appKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Mathpix credentials are not configured. Set MATHPIX_APP_ID and MATHPIX_APP_KEY in .env.local.",
      },
      { status: 500 },
    );
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected multipart/form-data body." },
      { status: 400 },
    );
  }

  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Missing 'file' field." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Uploaded file is empty." },
      { status: 400 },
    );
  }

  // Mathpix accepts the image as `file` in multipart form-data along with an
  // `options_json` field describing the desired output formats.
  const mathpixForm = new FormData();
  mathpixForm.append("file", file, file.name || "upload");
  mathpixForm.append(
    "options_json",
    JSON.stringify({
      formats: ["text", "latex_styled"],
      data_options: { include_latex: true, include_asciimath: false },
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
      rm_spaces: true,
    }),
  );

  try {
    const upstream = await fetch("https://api.mathpix.com/v3/text", {
      method: "POST",
      headers: {
        app_id: appId,
        app_key: appKey,
      },
      body: mathpixForm,
    });

    const data: {
      text?: string;
      latex_styled?: string;
      error?: string;
      error_info?: { message?: string };
    } = await upstream.json();

    if (!upstream.ok || data.error) {
      return NextResponse.json(
        {
          success: false,
          error:
            data.error_info?.message ||
            data.error ||
            `Mathpix request failed with status ${upstream.status}.`,
        },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      );
    }

    return NextResponse.json({
      success: true,
      latex: data.latex_styled ?? "",
      text: data.text ?? "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Failed to reach Mathpix: ${message}` },
      { status: 502 },
    );
  }
}
