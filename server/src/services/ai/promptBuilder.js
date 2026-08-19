import { readFileSync } from 'node:fs';
import knowledgeBase from '../../data/ai/knowledgeBase.js';
import { formatContext } from './contextBuilder.js';

const qaExamples = JSON.parse(
  readFileSync(new URL('../../data/ai/qaExamples.json', import.meta.url), 'utf8'),
);

export function buildSystemPrompt(ctx) {
  const parts = [
    "You are TradeBuddy's AI trading analyst for Indian NSE markets.",
    'Answer ONLY from the data given below. Never invent prices or scores.',
    '',
    'APP KNOWLEDGE:',
    ...knowledgeBase.app.map((f) => `- ${f}`),
    'TRADING RULES:',
    ...knowledgeBase.trading.map((f) => `- ${f}`),
  ];
  const context = formatContext(ctx);
  if (context) {
    parts.push('', 'LIVE APP DATA (current):', context);
  }
  return parts.join('\n');
}

export function buildMessages(ctx, userQuestion) {
  const system = buildSystemPrompt(ctx);
  const fewShot = [];
  for (const ex of qaExamples.slice(0, 3)) {
    fewShot.push({ role: 'user', content: ex.question });
    fewShot.push({ role: 'assistant', content: ex.answer });
  }
  return {
    system,
    messages: [...fewShot, { role: 'user', content: userQuestion }],
  };
}