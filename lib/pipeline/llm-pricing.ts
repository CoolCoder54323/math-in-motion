/* ------------------------------------------------------------------ */
/*  LLM pricing constants (per 1M tokens, USD)                         */
/*                                                                      */
/*  Keep these in sync with provider pricing pages:                    */
/*    Anthropic: https://claude.com/pricing#api                        */
/*    OpenAI:    https://openai.com/api/pricing/                       */
/*    DeepSeek:  https://api-docs.deepseek.com/quick_start/pricing     */
/* ------------------------------------------------------------------ */

export const LLM_PRICING = {
  anthropic: {
    "claude-sonnet-4-6": {
      input: 3.0,
      cacheRead: 0.3,
      cacheCreation: 3.75,
      output: 15.0,
    },
  },
  openai: {
    "gpt-4o": {
      input: 2.5,
      cachedInput: 0.25,
      output: 10.0,
    },
  },
  deepseek: {
    "deepseek-v4-flash": {
      input: 0.14,
      cachedInput: 0.028,
      output: 0.28,
    },
    "deepseek-v4-pro": {
      input: 1.74,
      cachedInput: 0.145,
      output: 3.48,
    },
  },
  kimi: {
    "kimi-k2.6": {
      input: 2.0,
      cachedInput: 0.2,
      output: 8.0,
    },
  },
} as const;
