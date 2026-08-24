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
    'Answer directly — no <think> tags, no chain-of-thought, no internal reasoning shown. Just the answer.',
    'Talk like you would to a friend who does not know trading jargon, in plain everyday language — but give',
    'a PROPER, DETAILED answer, not just a one-line verdict: lead with the bottom line in the first sentence',
    '("Better to wait — TCS is down today and looks weak", not "Based on the data provided, I cannot',
    'recommend..."), then walk through the actual reasons behind it one by one — price/trend, momentum,',
    'news, valuation, risk, whichever of these the data actually covers — explaining each in a full plain-',
    'English sentence (e.g. "It is trading below its 200-day average, which means the longer-term trend is',
    'down" instead of just stating a number with no explanation of what it means). Cover every relevant',
    'factor present in the data, not just one. End with the practical numbers that matter (entry zone,',
    'stop-loss, support/resistance) if the data has them, and one short risk reminder — do not repeat',
    'disclaimers or re-explain the same point twice. Skip formal headers, bullet lists, and bold labels —',
    'write it as natural paragraphs, the way you would actually explain it to someone out loud.',
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