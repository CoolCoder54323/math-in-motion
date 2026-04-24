import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const existingPlan = fs.readFileSync("./opus.out", "utf-8");
const feedback = fs.readFileSync("./PIPELINE_REDESIGN_PROMPT.md", "utf-8");

const prompt = `Here is the initial plan from a previous conversation:

${existingPlan}

---

Now consider this critical feedback about where LLMs fail and how to split responsibilities:

${feedback}

---

## Your Task

Incorporate the parts that make sense and are doable into a DETAILED, ACTIONABLE plan. Focus on:

1. **Hard constraints** - What MUST be enforced by a deterministic validator/compiler (NOT LLM)
2. **LLM policy layer** - What the LLM should handle (probabilistic creativity)
3. **Architectural split** - How to implement the 3-layer system (Policy → Compiler → Runtime)
4. **Failure modes** - Specific validators to catch LLM failures

Be specific about:
- What constraint-checking code looks like
- The state machine for beat execution
- The exact schema changes needed
- How to validate at each stage
- What can actually ship in 2-4 weeks

Respond with a detailed implementation plan suitable for engineering.`;

const message = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 10000,
  messages: [
    { role: "user", content: prompt }
  ],
});

console.log(message.content[0].text);