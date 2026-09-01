import aiConfig from '../../config/aiConfig.js';

// Reasoning models (DeepSeek-R1 and similar) emit their chain-of-thought
// wrapped in <think>...</think> before the actual answer. Every caller of
// chat() wants the answer, never the internal reasoning, so strip it once
// here instead of relying on each call site to remember to.
function stripThinking(text) {
  return (text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export async function chat({ system, messages = [], maxTokens, temperature, stream = false }) {
  const tokens = maxTokens ?? aiConfig.maxTokens;
  const body = {
    model: aiConfig.model,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    // Groq accepts both max_tokens and max_completion_tokens; OpenAI does not.
    // Send only one based on provider.
    ...(aiConfig.provider === 'groq'
      ? { max_tokens: tokens, max_completion_tokens: tokens }
      : { max_tokens: tokens }),
    temperature: temperature ?? aiConfig.temperature,
    stream,
    ...(aiConfig.provider === 'groq'
      ? {
          // Every call this app makes is "answer from the app data given" —
          // Q&A, a structured JSON review, stock suggestions — never the kind
          // of multi-step math/coding problem thinking mode is for. Measured
          // on a real call: reasoning_effort "default" burned 1161 of 1239
          // completion tokens on hidden reasoning before answering (2.5s);
          // "none" answered directly in 68 tokens (0.14s). Beyond the latency
          // and rate-limit cost, a big enough prompt could exhaust maxTokens
          // entirely on reasoning and return an EMPTY answer — "none"
          // sidesteps that failure mode rather than just budgeting around it.
          reasoning_effort: 'none',
          // Backstop in case reasoning ever gets triggered anyway (a model
          // update, an unsupported combination, etc.) — return the answer
          // only, never the <think> block. stripThinking() below is the
          // other half of this backstop for when reasoning_format itself
          // isn't honored (a known Groq bug on some models).
          reasoning_format: 'hidden',
        }
      : {}),
  };

  if (aiConfig.provider === 'mock' || !aiConfig.apiKey) {
    return mockChat(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), aiConfig.timeoutMs);
  try {
    const res = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI api error ${res.status}: ${text.slice(0, 200)}`);
    }
    if (stream) return res.body;
    const data = await res.json();
    return stripThinking(data.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

function mockChat(body) {
  const last = [...body.messages].reverse().find((m) => m.role === 'user');
  const q = last?.content ?? '';
  return `[mock] I'd analyze "${q}" using your radar + market data. Add AI_API_KEY to enable live Groq answers.`;
}