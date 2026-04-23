import { LLM_PRICING } from "./llm-pricing";

export type LLMUsage = {
  provider: "anthropic" | "openai" | "deepseek" | "kimi";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cachedTokens?: number;
};

export function calculateCost(usage: LLMUsage): number {
  const pricing = (LLM_PRICING as Record<string, Record<string, unknown>>)[usage.provider]?.[usage.model] as
    | Record<string, number>
    | undefined;
  if (!pricing) return 0;

  if (usage.provider === "anthropic") {
    return (
      (usage.inputTokens / 1_000_000) * pricing.input +
      ((usage.cacheReadTokens ?? 0) / 1_000_000) * pricing.cacheRead +
      ((usage.cacheCreationTokens ?? 0) / 1_000_000) * pricing.cacheCreation +
      (usage.outputTokens / 1_000_000) * pricing.output
    );
  }

  const cachedTokens = usage.cachedTokens ?? 0;
  const uncachedInput = usage.inputTokens - cachedTokens;
  return (
    (uncachedInput / 1_000_000) * pricing.input +
    (cachedTokens / 1_000_000) * pricing.cachedInput +
    (usage.outputTokens / 1_000_000) * pricing.output
  );
}

export function mergeUsage(a: LLMUsage | null, b: LLMUsage | null): LLMUsage | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  return {
    provider: a.provider,
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
    cacheCreationTokens: (a.cacheCreationTokens ?? 0) + (b.cacheCreationTokens ?? 0),
    cachedTokens: (a.cachedTokens ?? 0) + (b.cachedTokens ?? 0),
  };
}
