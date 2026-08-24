import { topOpportunities } from '../../services/radarService.js';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { listWatchlist } from '../../services/watchlistService.js';
import { listJournal } from '../../services/journalService.js';

// Gathers bounded real app data so the AI answers from facts, not guesses.
// The four fetches below don't depend on each other, so they run
// concurrently — this used to be four sequential awaits stacking their
// latencies on every single /ai/ask and /ai/portfolio-review call.
export async function buildContext(userId) {
  const ctx = { top: [], portfolio: null, watchlist: [], journal: [] };

  const [topResult, portfolioResult, watchlistResult, journalResult] = await Promise.allSettled([
    topOpportunities(5),
    userId ? getPortfolioSummary(userId) : Promise.resolve(null),
    userId ? listWatchlist(userId) : Promise.resolve(null),
    userId ? listJournal(userId, { limit: 5 }) : Promise.resolve(null),
  ]);

  if (topResult.status === 'fulfilled') {
    ctx.top = topResult.value.map((o) => ({
      symbol: o.symbol,
      score: o.convictionScore,
      signal: o.signal,
      reason: o.explanation,
    }));
  }
  if (userId) {
    if (portfolioResult.status === 'fulfilled') ctx.portfolio = portfolioResult.value;
    if (watchlistResult.status === 'fulfilled' && watchlistResult.value) {
      ctx.watchlist = watchlistResult.value.items.slice(0, 10).map((i) => i.symbol);
    }
    if (journalResult.status === 'fulfilled' && journalResult.value) {
      ctx.journal = journalResult.value.rows.map((e) => `[${e.symbol}] ${e.notes ?? e.side ?? ''}`).filter(Boolean).slice(0, 5);
    }
  }

  return ctx;
}

// Turns the context object into plain text for the prompt.
export function formatContext(ctx) {
  const lines = [];
  if (ctx.top.length) {
    // Only the top 5 scanned candidates, not every stock the scanner looked
    // at — a stock missing from this list was never evaluated here, that's
    // not evidence against it. Only use this for "what should I buy"-style
    // questions with no stock named; for a question about a specific stock,
    // judge it on its own data below, never on whether it's in this list.
    lines.push('TOP RADAR OPPORTUNITIES (latest scan, top 5 only — NOT a ranking of all stocks; absence here is not a negative signal):');
    for (const t of ctx.top) lines.push(`- ${t.symbol}: score ${t.score}, signal ${t.signal} - ${t.reason}`);
  }
  if (ctx.portfolio) {
    const p = ctx.portfolio;
    lines.push(`PORTFOLIO: ${p.holdingsCount} holdings, invested Rs ${p.invested}, current Rs ${p.currentValue}, P&L ${p.pnlPct}%`);
  }
  if (ctx.watchlist.length) lines.push(`WATCHLIST: ${ctx.watchlist.join(', ')}`);
  if (ctx.journal.length) lines.push(`RECENT JOURNAL:\n${ctx.journal.join('\n')}`);
  return lines.join('\n');
}