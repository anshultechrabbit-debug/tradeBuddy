import { chat } from './llmClient.js';
import { buildMessages } from './promptBuilder.js';
import { buildContext } from './contextBuilder.js';
import { topOpportunities } from '../../services/radarService.js';
import { getMarketDataProvider } from '../../providers/marketData/index.js';

// Words never treated as stock symbols.
const STOP_WORDS = new Set([
  'BUY', 'SELL', 'BEST', 'TODAY', 'NSE', 'STOCK', 'STOCKS', 'PRICE', 'RS',
  'WHAT', 'WHY', 'HOW', 'THE', 'AND', 'FOR', 'WITH', 'TRADE', 'TRADING',
]);

function findSymbols(question) {
  const words = question.toUpperCase().match(/\b[A-Z]{2,6}\b/g) ?? [];
  return [...new Set(words)].filter((w) => !STOP_WORDS.has(w)).slice(0, 3);
}

// TOOLS: fetch live data about the question and return text lines.
async function callTools(question, ctx) {
  const extra = [];
  const uq = question.toUpperCase();

  // "best/which/buy" → latest radar scan
  if (/\b(BEST|WHICH|RECOMMEND|BUY|TOP)\b/.test(uq)) {
    try {
      const opps = await topOpportunities(5);
      extra.push('LIVE RADAR SCAN RESULTS:');
      for (const o of opps) extra.push(`- ${o.symbol}: score ${o.convictionScore}, signal ${o.signal} - ${o.explanation}`);
    } catch {
      // scan unavailable
    }
  }

  // symbol mentioned → live quote + recent daily candles
  const symbols = findSymbols(question);
  if (symbols.length) {
    const provider = getMarketDataProvider();
    for (const sym of symbols) {
      try {
        const q = await provider.getQuote(sym, 'NSE');
        if (q) extra.push(`LIVE QUOTE ${sym}: last Rs ${q.lastPrice}, change ${q.changePct}%`);
      } catch {
        // quote unavailable
      }
      try {
        const candles = await provider.getCandles(sym, '1d', 30, 'NSE');
        if (candles?.length) {
          const last = candles[candles.length - 1];
          const prev = candles[candles.length - 2]?.close ?? 'n/a';
          extra.push(`${sym} 1D: last close Rs ${last.close}, prev close Rs ${prev}`);
        }
      } catch {
        // candles unavailable
      }
    }
  }

  return extra;
}

// Main entry: answer a user question using live tool data.
export async function ask(userId, question) {
  const ctx = await buildContext(userId);
  const toolLines = await callTools(question, ctx);
  const { system, messages } = buildMessages(ctx, question);
  if (toolLines.length) {
    messages[messages.length - 1] = {
      role: 'user',
      content: `${question}\n\nTOOL DATA (fetched live just now):\n${toolLines.join('\n')}`,
    };
  }
  return chat({ system, messages });
}

// Recommend top picks (used by /api/ai/suggest).
export async function suggest(userId, limit = 3) {
  const ctx = await buildContext(userId);
  const { system, messages } = buildMessages(ctx, `Recommend the top ${limit} stocks to trade today, with reasons.`);
  return chat({ system, messages });
}