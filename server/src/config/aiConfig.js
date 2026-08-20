import { config } from './env.js';

export default {
  provider: config.llm.provider,
  model: config.llm.model,
  apiKey: config.llm.apiKey,
  baseUrl: config.llm.baseUrl,
  maxTokens: Number(process.env.AI_MAX_TOKENS || 800),
  temperature: Number(process.env.AI_TEMPERATURE || 0.4),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
};