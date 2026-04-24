import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Completions } from "openai/resources/completions";
import type { PipelineInput } from "./types";
import type { LLMUsage } from "./llm-usage";

/* ------------------------------------------------------------------ */
/*  Shared LLM client — single source of truth for provider resolution  */
/*  and streaming API calls across plan, codegen, and viz-codegen.    */
/* ------------------------------------------------------------------ */

export type LLMProvider = "anthropic" | "openai" | "deepseek" | "kimi";

export type ResolvedProvider = {
  provider: LLMProvider;
  key: string;
};

export type UserPromptParts = {
  cacheable: string;
  variable: string;
};

/* ------------------------------------------------------------------ */
/*  Provider resolution                                                 */
/* ------------------------------------------------------------------ */

export function resolveProvider(
  options?: PipelineInput["options"],
): ResolvedProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const moonshotKey = process.env.MOONSHOT_API_KEY;
  const requested =
    options?.provider ?? process.env.ANIMATION_PROVIDER?.toLowerCase();

  if (requested === "anthropic" && anthropicKey)
    return { provider: "anthropic", key: anthropicKey };
  if (requested === "deepseek" && deepseekKey)
    return { provider: "deepseek", key: deepseekKey };
  if (requested === "openai" && openaiKey)
    return { provider: "openai", key: openaiKey };
  if (requested === "kimi" && moonshotKey)
    return { provider: "kimi", key: moonshotKey };

  // Fallback chain
  if (anthropicKey) return { provider: "anthropic", key: anthropicKey };
  if (deepseekKey) return { provider: "deepseek", key: deepseekKey };
  if (openaiKey) return { provider: "openai", key: openaiKey };
  if (moonshotKey) return { provider: "kimi", key: moonshotKey };

  throw new Error(
    "No AI credentials configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, or MOONSHOT_API_KEY.",
  );
}

/* ------------------------------------------------------------------ */
/*  Default model per provider                                          */
/* ------------------------------------------------------------------ */

export function getProviderModel(provider: LLMProvider, requestedModel?: string): string {
  if (requestedModel) return requestedModel;
  switch (provider) {
    case "anthropic":
      return "claude-opus-4-7";
    case "deepseek":
      return "deepseek-v4-pro";
    case "openai":
      return "gpt-4o";
    case "kimi":
      return "kimi-k2.6";
  }
}

/* ------------------------------------------------------------------ */
/*  Unified streaming LLM call                                          */
/* ------------------------------------------------------------------ */

export type CallLLMParams = {
  systemPrompt: string;
  userPrompt: string | UserPromptParts;
  provider: ResolvedProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export async function callLLM(
  params: CallLLMParams,
): Promise<{ text: string; usage: LLMUsage | null }> {
  const {
    systemPrompt,
    userPrompt,
    provider,
    model,
    maxTokens = 8000,
    temperature = 0.3,
    signal,
  } = params;

  if (provider.provider === "anthropic") {
    return callAnthropic({
      systemPrompt,
      userPrompt,
      provider,
      model,
      maxTokens,
      temperature,
      signal,
    });
  }

  return callOpenAICompatible({
    systemPrompt,
    userPrompt,
    provider,
    model,
    maxTokens,
    temperature,
    signal,
  });
}

/* ------------------------------------------------------------------ */
/*  Retry helpers for rate-limit errors                                 */
/* ------------------------------------------------------------------ */

const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (err == null) return false;

  // Anthropic SDK error
  if (typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 429) return true;
  }

  // OpenAI SDK error
  if (typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "rate_limit_exceeded" || code === "insufficient_quota") return true;
  }

  // Generic error message check
  const msg = String(err);
  return (
    msg.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("429")
  );
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err)) throw err;

      attempt++;
      if (attempt > MAX_RETRIES) {
        console.error(`[${label}] Rate limit exceeded after ${MAX_RETRIES} retries.`);
        throw err;
      }

      if (signal?.aborted) {
        throw new Error(`${label} aborted during rate-limit retry.`);
      }

      const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[${label}] Rate limit hit (attempt ${attempt}/${MAX_RETRIES + 1}), retrying in ${delay}ms…`,
      );
      await sleep(delay);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Anthropic branch (with prompt caching support)                      */
/* ------------------------------------------------------------------ */

async function callAnthropic(
  params: CallLLMParams,
): Promise<{ text: string; usage: LLMUsage | null }> {
  const { systemPrompt, userPrompt, provider, model, maxTokens = 8000, signal } =
    params;

  return withRetry(
    "callAnthropic",
    async () => {
      const client = new Anthropic({ apiKey: provider.key });
      const resolvedModel = getProviderModel("anthropic", model);

      let fullText = "";

      const isParts = typeof userPrompt !== "string";
      const cacheable = isParts ? userPrompt.cacheable : userPrompt;
      const variable = isParts ? userPrompt.variable : "";

      const stream = client.messages.stream(
        {
          model: resolvedModel,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: cacheable,
                  ...(isParts ? { cache_control: { type: "ephemeral" } } : {}),
                },
                ...(variable ? [{ type: "text" as const, text: variable }] : []),
              ],
            },
          ],
        },
        { signal },
      );

      stream.on("text", (text) => {
        fullText += text;
      });

      const finalMsg = await stream.finalMessage();

      return {
        text: fullText,
        usage: {
          provider: "anthropic",
          model: resolvedModel,
          inputTokens: finalMsg.usage.input_tokens,
          outputTokens: finalMsg.usage.output_tokens,
          cacheReadTokens: finalMsg.usage.cache_read_input_tokens ?? undefined,
          cacheCreationTokens:
            finalMsg.usage.cache_creation_input_tokens ?? undefined,
        },
      };
    },
    signal,
  );
}

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible branch (OpenAI / DeepSeek / Kimi)                 */
/* ------------------------------------------------------------------ */

async function callOpenAICompatible(
  params: CallLLMParams,
): Promise<{ text: string; usage: LLMUsage | null }> {
  const { systemPrompt, userPrompt, provider, model, maxTokens = 8000, temperature, signal } =
    params;

  return withRetry(
    "callOpenAICompatible",
    async () => {
      const baseURLs: Record<string, string> = {
        deepseek: "https://api.deepseek.com",
        kimi: "https://api.moonshot.ai/v1",
      };

      const client = new OpenAI({
        apiKey: provider.key,
        ...(baseURLs[provider.provider]
          ? { baseURL: baseURLs[provider.provider] }
          : {}),
      });

      const resolvedModel = getProviderModel(provider.provider, model);

      // Kimi k2.6 only accepts temperature=1.
      const effectiveTemperature =
        provider.provider === "kimi" ? 1 : (temperature ?? 0.3);

      const isParts = typeof userPrompt !== "string";
      const cacheable = isParts ? userPrompt.cacheable : userPrompt;
      const variable = isParts ? userPrompt.variable : "";
      const fullUserPrompt = variable
        ? `${cacheable}\n\n${variable}`
        : cacheable;

      let fullText = "";
      let lastUsage: Completions.CompletionUsage | undefined;

      const stream = await client.chat.completions.create(
        {
          model: resolvedModel,
          temperature: effectiveTemperature,
          max_tokens: maxTokens,
          ...(provider.provider === "deepseek"
            ? { extra_body: { thinking: { type: "disabled" } } }
            : {}),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: fullUserPrompt },
          ],
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) fullText += text;
        if (chunk.usage) lastUsage = chunk.usage;
      }

      return {
        text: fullText,
        usage: lastUsage
          ? {
              provider: provider.provider,
              model: resolvedModel,
              inputTokens: lastUsage.prompt_tokens,
              outputTokens: lastUsage.completion_tokens,
              cachedTokens: lastUsage.prompt_tokens_details?.cached_tokens,
            }
          : null,
      };
    },
    signal,
  );
}
