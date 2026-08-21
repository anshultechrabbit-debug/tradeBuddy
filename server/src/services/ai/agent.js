import { chat } from './llmClient.js';
import { buildMessages, buildSystemPrompt } from './promptBuilder.js';
import { buildContext } from './contextBuilder.js';
import { topOpportunities } from '../../services/radarService.js';
import { getMarketDataProvider } from '../../providers/marketData/index.js';
import { analyzeStock, formatAnalysis } from '../../services/stockAnalysisService.js';
import { getHoldings } from '../portfolioService.js';
import { prisma } from '../../config/prisma.js';

// In-memory cache for AI reviews to make API instant and prevent Groq overloading
// Key: userId, Value: { review, timestamp, holdingsHash }
const reviewCache = new Map();

function generateHoldingsHash(holdings) {
  return holdings
    .map((h) => `${h.symbol}:${h.quantity}:${Number(h.averagePrice).toFixed(2)}`)
    .sort()
    .join('|');
}

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
    const analysisIntent = /\b(ANALYZE|ANALYSIS|RECOMMEND|SHOULD I (BUY|SELL|HOLD|INVEST)|FUNDAMENTAL|VALUATION|TARGET|STOP.?LOSS|ENTRY)\b/.test(uq);
    for (const sym of symbols) {
      if (analysisIntent) {
        try {
          const analysis = await analyzeStock(sym);
          if (analysis.ok) {
            extra.push(`STRUCTURED ANALYSIS ${sym}:`);
            extra.push(formatAnalysis(analysis));
            continue;
          }
        } catch {
          // fall through to quote/candles below
        }
      }
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

/**
 * Auto-reviews the user's portfolio and returns:
 *  - overallNarrative: 2-3 sentence summary
 *  - holdings: per-stock { symbol, action, reason } where action ∈ BUY_MORE | HOLD | TRIM | SELL
 *  - rebalancing: plain text suggestions
 *
 * Uses the LLM with full portfolio context + live radar signals.
 * Returns a structured JSON response parsed from the LLM output.
 */
export async function portfolioReview(userId) {
  const ctx = await buildContext(userId);
  const system = buildSystemPrompt(ctx);

  // Build a detailed holdings list and check for scanner signals in the DB
  let holdingLines = 'No holdings data available.';
  let holdings = [];
  let signalMap = new Map();
  try {
    holdings = await getHoldings(userId);

    // Cache check: if holdings are unchanged and cache is under 5 mins old, return cached review instantly
    const newHash = generateHoldingsHash(holdings);
    const cached = reviewCache.get(userId);
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const isGenericFallback = cached?.review?.holdings?.[0]?.reason === 'Awaiting AI signal — refresh to update';
    if (cached && !isGenericFallback && cached.holdingsHash === newHash && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[AI Review Cache] Serving cached review for user ${userId} (instant)`);
      return cached.review;
    }
    if (isGenericFallback) {
      console.log(`[AI Review Cache] Invalidating generic fallback cache for user ${userId}`);
      reviewCache.delete(userId);
    }

    if (holdings.length) {
      const symbols = holdings.map((h) => h.symbol);
      const signals = await prisma.scanSignal.findMany({
        where: { symbol: { in: symbols } },
        orderBy: { timestamp: 'desc' },
      });
      // Group by symbol to get the latest signal for each symbol
      signalMap = new Map();
      for (const sig of signals) {
        if (!signalMap.has(sig.symbol)) {
          signalMap.set(sig.symbol, sig);
        }
      }

      holdingLines = holdings.map((h) => {
        const sig = signalMap.get(h.symbol);
        const sigStr = sig
          ? `[RADAR SIGNAL: ${sig.signal}, Conviction: ${sig.convictionScore}%, Regime: ${sig.regime}, Reason: ${sig.reason}]`
          : '[No current radar signal available]';
        return `${h.symbol}: qty=${h.quantity}, avgPrice=\u20b9${Number(h.averagePrice).toFixed(2)}, livePrice=\u20b9${Number(h.currentPrice).toFixed(2)}, pnl=${(h.pnlPct ?? 0).toFixed(2)}%, ${sigStr}`;
      }).join('\n');
    }
  } catch (err) {
    console.error('Error fetching holdings or scan signals:', err);
  }

  // Build deterministic fallback so user always gets useful BUY/SELL reasons even if LLM fails
  function buildDeterministicReview() {
    if (!holdings.length) {
      return {
        overallNarrative: 'No holdings found. Connect your broker and sync to get an AI portfolio review.',
        portfolioScore: null,
        rebalancing: '',
        holdings: [],
      };
    }
    // Use signalMap built above (if available)
    const map = signalMap || new Map();
    const avgPnl = holdings.reduce((s, h) => s + (Number(h.pnlPct) || 0), 0) / holdings.length;
    const winners = holdings.filter((h) => (Number(h.pnlPct) || 0) > 5).length;
    const losers = holdings.filter((h) => (Number(h.pnlPct) || 0) < -3).length;
    let score = 50;
    if (avgPnl > 8) score = 78;
    else if (avgPnl > 3) score = 68;
    else if (avgPnl > 0) score = 60;
    else if (avgPnl > -5) score = 45;
    else score = 32;
    if (winners > losers + 5) score = Math.min(85, score + 8);
    if (losers > winners + 5) score = Math.max(25, score - 10);

    const sortedByPnl = [...holdings].sort((a, b) => (Number(b.pnlPct) || 0) - (Number(a.pnlPct) || 0));
    const best = sortedByPnl[0];
    const worst = sortedByPnl[sortedByPnl.length - 1];
    const overallNarrative =
      `Your ${holdings.length}-stock portfolio is ${avgPnl >= 0 ? `up ${avgPnl.toFixed(1)}% on average` : `down ${Math.abs(avgPnl).toFixed(1)}% on average`}, with ${winners} winner${winners !== 1 ? 's' : ''} and ${losers} loser${losers !== 1 ? 's' : ''}. ` +
      `${best ? `${best.symbol} leads at ${Number(best.pnlPct).toFixed(1)}%` : ''}${worst && worst.symbol !== best.symbol ? `, while ${worst.symbol} lags at ${Number(worst.pnlPct).toFixed(1)}%` : ''}. ` +
      `Portfolio score ${score}/100 reflects overall health and diversification.`;

    let rebalancing = 'No urgent rebalancing needed — maintain current allocation.';
    if (holdings.length >= 18) rebalancing = 'Portfolio has 18+ positions — consider consolidating to 12-15 high-conviction names to improve focus.';
    else if (losers > 5) rebalancing = `Trim ${losers} underperformers and rotate into stronger momentum names with better radar signals.`;
    else if (winners > losers) rebalancing = 'Book partial profits on top winners and add to quality laggards on dips.';

    const holdingsReview = holdings.map((h) => {
      const sig = map.get(h.symbol);
      const pnl = Number(h.pnlPct) || 0;
      let action = 'HOLD';
      let reason = 'Stable momentum, hold position';
      if (sig) {
        const sigUpper = String(sig.signal || '').toUpperCase();
        const conv = Number(sig.convictionScore) || 0;
        if (sigUpper === 'BUY' && conv >= 65) {
          action = 'BUY_MORE';
          reason = (sig.reason || `Strong BUY ${conv}% conviction`).split(/\s+/).slice(0, 7).join(' ');
        } else if (sigUpper === 'SELL' || conv <= 30) {
          action = pnl < -8 ? 'SELL' : 'TRIM';
          reason = (sig.reason || 'Weak sell signal momentum').split(/\s+/).slice(0, 7).join(' ');
        } else if (pnl > 15) {
          action = 'TRIM';
          reason = `Up ${pnl.toFixed(1)}%, book partial profits`;
        } else {
          action = 'HOLD';
          reason = (sig.reason || 'Neutral signal, hold position').split(/\s+/).slice(0, 7).join(' ');
        }
      } else {
        if (pnl > 12) {
          action = 'TRIM';
          reason = `Up ${pnl.toFixed(1)}%, consider trimming profits`;
        } else if (pnl < -15) {
          action = 'SELL';
          reason = `Down ${pnl.toFixed(1)}%, weak underperformer exit`;
        } else if (pnl < -8) {
          action = 'TRIM';
          reason = `Down ${pnl.toFixed(1)}%, review stop loss`;
        } else if (pnl > 6) {
          action = 'HOLD';
          reason = `Positive momentum, hold for upside`;
        } else {
          action = 'HOLD';
          reason = `${pnl >= 0 ? 'Positive' : 'Negative'} momentum, hold position`;
        }
      }
      let words = reason.trim().split(/\s+/);
      if (words.length < 5) reason = `${reason} hold cautiously for now`.trim();
      words = reason.trim().split(/\s+/);
      if (words.length > 8) reason = words.slice(0, 8).join(' ');
      return { symbol: h.symbol, action, reason };
    });

    return { overallNarrative, portfolioScore: score, rebalancing, holdings: holdingsReview };
  }

  const question = `You are a portfolio analyst. Output ONLY valid JSON, no markdown, no <think> tags, no reasoning, no extra text.

Your goal is to provide a portfolio review. Check the RADAR SIGNAL data provided for each holding:
- If a holding has a strong BUY signal and positive regime, suggest BUY_MORE to invest more.
- If a holding has a SELL/bearish signal or is performing poorly, suggest TRIM or SELL.
- Otherwise suggest HOLD.
Explain the reason in EXACTLY 5 to 8 words based on the RADAR SIGNAL reason or portfolio metrics.

Desired JSON structure:
{
  "overallNarrative": "2-3 sentence portfolio health summary",
  "portfolioScore": 72,
  "rebalancing": "Brief rebalancing suggestion",
  "holdings": [
    { "symbol": "RELIANCE", "action": "HOLD", "reason": "Weak momentum, trading below SMA50" }
  ]
}

Action must be one of: BUY_MORE, HOLD, TRIM, SELL.
portfolioScore must be 0-100.

MY CURRENT HOLDINGS:
${holdingLines}`;

  const raw = await chat({
    system: system + '\n\nCRITICAL: You MUST NOT output <think> tags or any reasoning. Output ONLY the JSON object defined above, nothing else.',
    messages: [{ role: 'user', content: question }],
    maxTokens: 4096,
    temperature: 0.2,
  });

  console.log('[AI Review] Raw LLM response length:', raw?.length ?? 0);
  console.log('[AI Review] Raw LLM response preview:', (raw || '').slice(0, 800));
  if ((raw || '').length > 800) console.log('[AI Review] Raw LLM response tail:', (raw || '').slice(-800));

  let parsedReview = null;

  // Robust JSON extraction handling <think> blocks and markdown
  try {
    let jsonStr = raw || '';
    // Remove markdown fences first
    jsonStr = jsonStr.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    // Remove complete <think>...</think> blocks
    jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // If still contains unclosed <think>, treat as truncated - try to recover JSON before it
    if (jsonStr.includes('<think>')) {
      console.warn('[AI Review] Detected unclosed <think> tag - response likely truncated');
      const thinkIdx = jsonStr.indexOf('<think>');
      const beforeThink = jsonStr.slice(0, thinkIdx).trim();
      // Try to find JSON before think; if found use it, otherwise consider failed
      if (beforeThink.includes('{') && beforeThink.includes('}')) {
        jsonStr = beforeThink;
      } else {
        // Check if raw contains JSON after </think> - take after last </think>
        const closeIdx = raw.lastIndexOf('</think>');
        if (closeIdx !== -1) {
          jsonStr = raw.slice(closeIdx + 8).replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
        } else {
          jsonStr = ''; // truncated, will fallback
        }
      }
    }

    if (jsonStr) {
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const candidate = jsonStr.slice(firstBrace, lastBrace + 1);
        parsedReview = JSON.parse(candidate);
        // Basic validation
        if (
          typeof parsedReview.overallNarrative !== 'string' ||
          !Array.isArray(parsedReview.holdings) ||
          (parsedReview.portfolioScore != null && (parsedReview.portfolioScore < 0 || parsedReview.portfolioScore > 100))
        ) {
          console.warn('[AI Review] Parsed JSON failed validation', parsedReview);
          parsedReview = null;
        } else {
          console.log('[AI Review] Successfully parsed LLM JSON with', parsedReview.holdings?.length, 'holdings');
        }
      } else {
        console.warn('[AI Review] No JSON braces found after cleaning');
      }
    }
  } catch (err) {
    console.error('AI portfolio review parse failed:', err);
    console.error('Raw snippet:', (raw || '').slice(0, 1000));
  }

  const review = parsedReview || buildDeterministicReview();
  if (!parsedReview) {
    console.log('[AI Review] Using deterministic fallback review');
  }

  // Save to cache before returning
  if (holdings.length) {
    reviewCache.set(userId, {
      review,
      timestamp: Date.now(),
      holdingsHash: generateHoldingsHash(holdings),
    });
  }

  return review;
}
