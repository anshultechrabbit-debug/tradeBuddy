import { topOpportunities } from '../../services/radarService.js';
import { getMarketDataProvider } from '../../providers/marketData/index.js';

// Structured top picks: radar scan data + live price, with a confidence %.
export async function recommend(userId, limit = 3) {
  const opps = (await topOpportunities(limit * 2)).slice(0, limit);
  const provider = getMarketDataProvider();
  const picks = [];
  for (const o of opps) {
    let price = null;
    try {
      const q = await provider.getQuote(o.symbol, 'NSE');
      price = q?.lastPrice ?? null;
    } catch {
      // quote unavailable
    }
    const score = Number(o.convictionScore ?? 0);
    picks.push({
      symbol: o.symbol,
      price,
      score,
      confidence: Math.min(99, Math.max(5, Math.round(score))),
      signal: o.signal,
      reason: o.explanation,
    });
  }
  return picks;
}