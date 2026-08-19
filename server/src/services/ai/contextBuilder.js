import { topOpportunities } from '../../services/radarService.js';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { listWatchlist } from '../../services/watchlistService.js';
import { listJournal } from '../../services/journalService.js';

// Gathers bounded real app data so the AI answers from facts, not guesses.
export async function buildContext(userId) {
  const ctx = { top: [], portfolio: null, watchlist: [], journal: [] };

  try {
    const opps = await topOpportunities(5);
    ctx.top = opps.map((o) => ({
      symbol: o.symbol,
      score: o.convictionScore,
      signal: o.signal,
      reason: o.explanation,
    }));
  } catch {
    // no scan data yet
  }

  if (userId) {
    try {
      ctx.portfolio = await getPortfolioSummary(userId);
    } catch {
      // user has no portfolio
    }
    try {
      const w = await listWatchlist(userId);
      ctx.watchlist = w.items.slice(0, 10).map((i) => i.symbol);
    } catch {
      // no watchlist
    }
    try {
      const j = await listJournal(userId, { limit: 5 });
      ctx.journal = j.rows.map((e) => `[${e.symbol}] ${e.notes ?? e.side ?? ''}`).filter(Boolean).slice(0, 5);
    } catch {
      // no journal
    }
  }

  return ctx;
}

// Turns the context object into plain text for the prompt.
export function formatContext(ctx) {
  const lines = [];
  if (ctx.top.length) {
    lines.push('TOP RADAR OPPORTUNITIES (latest scan):');
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