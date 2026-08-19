import aiConfig from '../../config/aiConfig.js';

export async function chat({ system, messages = [], maxTokens, temperature, stream = false }) {
  const body = {
    model: aiConfig.model,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    max_tokens: maxTokens ?? aiConfig.maxTokens,
    temperature: temperature ?? aiConfig.temperature,
    stream,
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
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function mockChat(body) {
  const last = [...body.messages].reverse().find((m) => m.role === 'user');
  const q = last?.content ?? '';
  return `[mock] I'd analyze "${q}" using your radar + market data. Add AI_API_KEY to enable live Groq answers.`;
}