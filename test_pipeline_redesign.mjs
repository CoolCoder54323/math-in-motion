import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const prompt = fs.readFileSync("./PIPELINE_REDESIGN_PROMPT.md", "utf-8");

const message = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 8000,
  messages: [
    { role: "user", content: prompt }
  ],
});

console.log(message.content[0].text);
