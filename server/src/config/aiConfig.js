import { config } from './env.js';

export default {
  provider: config.llm.provider,
  model: config.llm.model,
  apiKey: config.llm.apiKey,
  baseUrl: config.llm.baseUrl,
  // Groq still generates (and counts) reasoning tokens even when
  // reasoning_format hides them from the response — 800 was tuned for a
  // plain-answer model and left a "thinking" model no room to finish
  // reasoning before running out of budget, producing empty/truncated answers.
  maxTokens: Number(process.env.AI_MAX_TOKENS || process.env.LLM_MAX_TOKEN || 2048),
  temperature: Number(process.env.AI_TEMPERATURE || 0.4),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
};