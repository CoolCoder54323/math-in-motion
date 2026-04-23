import type { LLMUsage } from "../llm-usage";

const REVIEW_SYSTEM_PROMPT = `You are a Manim debugging assistant. You receive Python code that failed to render with Manim and the exact error message.

Your job: fix the code so it renders successfully.

Rules:
- ONLY fix the reported error. Do NOT refactor, restructure, or change working code.
- Keep the same animation logic, scene structure, and visual intent.
- Prefer minimal surgical fixes over rewriting large sections.
- Output ONLY the fixed Python code. No markdown fences, no commentary, no explanations.
- The output must be a complete, valid Python file that can be run standalone.

Common fixes:
- rotate_to_angle → rotate
- RoundedRoundedRectangle → RoundedRectangle
- SurroundingRoundedRectangle → SurroundingRectangle
- Rectangle(corner_radius=...) → RoundedRectangle
- Sector(outer_radius=...) → Sector(radius=...)
- Missing imports → add from manim import *
- NameError on undefined variable → check spelling or define it
- AttributeError → check the correct method name in Manim docs`;

function getBaseURL(provider: string): string {
  if (provider === "deepseek") return "https://api.deepseek.com";
  if (provider === "kimi") return "https://api.moonshot.ai/v1";
  return "https://api.openai.com";
}

function getModel(provider: string): string {
  if (provider === "deepseek") return "deepseek-chat";
  if (provider === "kimi") return "kimi-k2.6";
  if (provider === "anthropic") return "claude-sonnet-4-6";
  return "gpt-4o";
}

function isRateLimitError(data: unknown): boolean {
  if (data == null || typeof data !== "object") return false;
  const d = data as { error?: { type?: string; message?: string } };
  const msg = d.error?.message ?? "";
  return (
    d.error?.type === "rate_limit_error" ||
    msg.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("429")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reviewSceneCode(params: {
  pythonCode: string;
  error: string;
  sceneId: string;
  apiKey: string;
  provider?: string;
}): Promise<{ pythonCode: string | null; usage: LLMUsage | null }> {
  const { pythonCode, error, sceneId, apiKey, provider = "deepseek" } = params;

  const userPrompt = `SCENE: ${sceneId}

ERROR:
${error}

CODE:
\`\`\`python
${pythonCode}
\`\`\`

Fix the code so it renders. Output the complete fixed Python file only.`;

  const MAX_RETRIES = 4;
  const INITIAL_BACKOFF_MS = 5000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${getBaseURL(provider)}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: getModel(provider),
          temperature: 0.1,
          max_tokens: 8000,
          messages: [
            { role: "system", content: REVIEW_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      const data = await resp.json();
      if (isRateLimitError(data)) {
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(
            `[review] ${sceneId}: rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms…`,
          );
          await sleep(delay);
          continue;
        }
        console.error(`[review] ${sceneId}: rate limit exceeded after ${MAX_RETRIES} retries.`);
        return { pythonCode: null, usage: null };
      }

      if (data.error) {
        console.warn(`[review] ${sceneId}: API error:`, JSON.stringify(data.error).slice(0, 200));
        return { pythonCode: null, usage: null };
      }

      const raw = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage;

      // Extract code from response (handle markdown fences if present)
      let fixed = raw.trim();
      if (fixed.startsWith("```python")) {
        fixed = fixed.slice(9).trim();
      } else if (fixed.startsWith("```")) {
        fixed = fixed.slice(3).trim();
      }
      if (fixed.endsWith("```")) {
        fixed = fixed.slice(0, -3).trim();
      }

      // Validate it's actually Python
      if (!fixed.includes("from manim import") && !fixed.includes("import manim")) {
        console.warn(`[review] ${sceneId}: fixed code missing manim import, rejecting`);
        return { pythonCode: null, usage: null };
      }

      return {
        pythonCode: fixed,
        usage: usage
          ? {
              provider: provider as LLMUsage["provider"],
              model: getModel(provider),
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
            }
          : null,
      };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `[review] ${sceneId}: network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms…`,
        );
        await sleep(delay);
        continue;
      }
      console.warn(`[review] ${sceneId}: review agent failed after ${MAX_RETRIES} retries:`, err);
      return { pythonCode: null, usage: null };
    }
  }

  return { pythonCode: null, usage: null };
}
