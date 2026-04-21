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
    "deepseek-chat": {
      input: 0.28,
      cachedInput: 0.028,
      output: 0.42,
    },
  },
} as const;
