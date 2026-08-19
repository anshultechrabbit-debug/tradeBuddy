export default {
  provider: process.env.AI_PROVIDER || 'groq',
  model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
  apiKey: process.env.AI_API_KEY || '',
  baseUrl: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
  maxTokens: Number(process.env.AI_MAX_TOKENS || 800),
  temperature: Number(process.env.AI_TEMPERATURE || 0.4),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
};