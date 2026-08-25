/**
 * stockAnalysisService — structured NSE stock analysis & recommendation engine.
 *
 * Gathers seven factors from LIVE app data only (news sentiment, technicals,
 * fundamentals, valuation, market/sector trend, risk), each scored or left
 * UNKNOWN (null) when its underlying data is unavailable — never a fabricated
 * neutral placeholder. The single published overall score, signal, and trade
 * decision come from predictionEngine.buildEngineResult (see below), which
 * renormalises over known factors and gates BUY calls on real discipline
 * rules. Every result passes through outputValidator before it may be
 * published (see analyzeStock / computeAnalysis).
 *
 * This is an algorithmic research signal, not a guaranteed prediction.
 */

import { getMarketDataProvider } from '../providers/marketData/index.js';
import { sma, ema, rsi, atr, roc, clamp } from './radar/indicators.js';
import { fetchStockNews } from './newsService.js';
import { buildEngineResult, buildWhySection } from './predictionEngine.js';
import { validateAnalysis } from './outputValidator.js';
import { round2 } from '../utils/helpers.js';
import { isPastClose } from './officialClose.js';

// ---------------------------------------------------------------------------
// Data gathering (each block degrades gracefully)
// ---------------------------------------------------------------------------

async function gatherTechnical(provider, symbol) {
  // Independent fetches — used to run one after the other, doubling the
  // wait on every analyzeStock() call (which itself is the slowest step
  // in most /ai callers, e.g. AI Picks and /ai/ask's per-symbol lookups).
  const [q, candlesResult] = await Promise.all([
    provider.getQuote(symbol, 'NSE').catch(() => null),
    provider.getCandles(symbol, '1d', 280, 'NSE').catch(() => []),
  ]);
  const candles = candlesResult ?? [];
  if (!candles.length && !q) return { ok: false };

  const closes = candles.map((c) => Number(c.close)).filter(Number.isFinite);
  if (!closes.length) return { ok: false };

  // The provider flags candles `stale: true` when it had to fall back to an
  // old cached series (see RealDevelopmentMarketDataProvider.getCandles).
  // Every indicator below is computed from `candles`/`closes`, so if the
  // most recent candle is stale, all of them are — surface that instead of
  // silently scoring multi-day-old data as if it were current.
  const candlesStale = candles.length > 0 && candles[candles.length - 1]?.stale === true;

  const price = q?.lastPrice ?? closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);

  // MACD line series → signal (EMA9 of MACD line). Both EMA legs need at
  // least their own period of history to mean anything; with fewer candles
  // than the slow (26) leg, "e12"/"e26" are still anchored on the seed value
  // and macdValue would be a confident-looking number computed from noise.
  let e12 = closes[0];
  let e26 = closes[0];
  const macdLine = [];
  for (const c of closes) {
    e12 = c * (2 / 13) + e12 * (1 - 2 / 13);
    e26 = c * (2 / 27) + e26 * (1 - 2 / 27);
    macdLine.push(e12 - e26);
  }
  const macdValue = closes.length >= 26 ? macdLine[macdLine.length - 1] : null;
  const macdSignal = closes.length >= 26 ? ema(macdLine, 9) : null;

  const recent = candles.slice(-20);
  const low20 = Math.min(...recent.map((c) => Number(c.low)));
  const high20 = Math.max(...recent.map((c) => Number(c.high)));
  const high52w = Math.max(...candles.map((c) => Number(c.high)));
  const low52w = Math.min(...candles.map((c) => Number(c.low)));

  const vol20 = candles.slice(-20).map((c) => Number(c.volume) || 0);
  const avgVol20 = vol20.length ? vol20.reduce((a, b) => a + b, 0) / vol20.length : 0;
  const lastVol = Number(candles[candles.length - 1].volume) || 0;
  const volRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;

  // Support: nearest candidate below price (low20, SMA50, 52w low).
  const supportCandidates = [low20, s50, low52w].filter((v) => v != null && v < price);
  const primarySupport = supportCandidates.length
    ? Math.max(...supportCandidates)
    : low52w;
  const secondarySupport = supportCandidates.length
    ? Math.min(...supportCandidates)
    : low52w;

  // Resistance: nearest level above price (high20, SMA200 if above, 52w high).
  const resistanceCandidates = [high20, s200, high52w].filter((v) => v != null && v > price);
  const primaryResistance = resistanceCandidates.length
    ? Math.min(...resistanceCandidates)
    : high52w;

  const drawdownFromHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : 0;
  const atrPct = price > 0 && atr14 != null ? (atr14 / price) * 100 : null;

  let trend = 'Neutral';
  if (s50 != null) {
    if (price > s50 && s20 > s50) trend = 'Bullish';
    else if (price < s50 && s20 < s50) trend = 'Bearish';
  }

  return {
    ok: true,
    price: round2(price),
    candles,
    closes,
    candlesStale,
    s20: s20 == null ? null : round2(s20),
    s50: s50 == null ? null : round2(s50),
    s200: s200 == null ? null : round2(s200),
    rsi: rsi14 == null ? null : round2(rsi14),
    macdValue,
    macdSignal,
    atr: atr14 == null ? null : round2(atr14),
    atrPct,
    roc10: roc(closes, 10),
    roc20: roc(closes, 20),
    volRatio: round2(volRatio),
    avgVol20,
    lastVol,
    high52w: round2(high52w),
    low52w: round2(low52w),
    high20: round2(high20),
    low20: round2(low20),
    primarySupport: round2(primarySupport),
    secondarySupport: round2(secondarySupport),
    primaryResistance: round2(primaryResistance),
    drawdownFromHigh: round2(drawdownFromHigh),
    trend,
    quote: q,
  };
}

async function gatherMarket(provider, tech) {
  const out = { ok: false, available: false, partial: false, regime: 'NEUTRAL', niftyRoc20: null, relativeStrength: null, note: '' };
  let niftyCloses = [];
  try {
    const candles = (await provider.getCandles('NIFTY', '1d', 60, 'NSE').catch(() => [])) ?? [];
    niftyCloses = candles.map((c) => Number(c.close)).filter(Number.isFinite);
  } catch {
    niftyCloses = [];
  }
  if (!niftyCloses.length) {
    try {
      const idx = await provider.getIndexData();
      const nifty = (idx ?? []).find((i) => /NIFTY|Nifty 50/i.test(i.symbol ?? ''));
      if (nifty?.level) {
        const s = nifty;
        // Only an index snapshot is available — no candle history, so the
        // 20d trend regime and relative-strength-vs-Nifty are genuinely
        // UNKNOWN. Never fabricate them as 0 (0 reads as "known, flat").
        const chgTxt = s.changePct == null ? 'n/a' : `${round2(s.changePct)}%`;
        return {
          ok: true,
          available: true,
          partial: true,
          regime: s.changePct > 0 ? 'BULLISH' : s.changePct < 0 ? 'BEARISH' : 'NEUTRAL',
          niftyRoc20: null,
          relativeStrength: null,
          note: `Nifty ${round2(s.level)} (${chgTxt}) — index snapshot only, no candle history`,
        };
      }
    } catch {
      // index data unavailable
    }
    out.note = 'Nifty candles unavailable';
    return out;
  }

  const niftySma20 = sma(niftyCloses, 20);
  const niftySma50 = sma(niftyCloses, 50);
  const niftyPrice = niftyCloses[niftyCloses.length - 1];
  const niftyRoc20 = roc(niftyCloses, 20);

  let regime = 'NEUTRAL';
  if (niftySma20 != null && niftySma50 != null) {
    if (niftyPrice > niftySma20 && niftyPrice > niftySma50) regime = 'BULLISH';
    else if (niftyPrice < niftySma20 && niftyPrice < niftySma50) regime = 'BEARISH';
  }

  // Relative strength needs BOTH sides' 20d return to be real numbers — a
  // stock or index with too little history must make this UNKNOWN, not
  // silently treat the missing side as "0% return".
  const relativeStrength =
    tech?.roc20 != null && niftyRoc20 != null ? round2(tech.roc20 - niftyRoc20) : null;
  const roc5 = roc(niftyCloses, 5);
  const roc5Txt = roc5 == null ? 'n/a' : `${round2(roc5)}%`;
  return {
    ok: true,
    available: true,
    partial: false,
    regime,
    niftyRoc20: round2(niftyRoc20),
    relativeStrength,
    niftyLevel: round2(niftyPrice),
    note: `Nifty ${round2(niftyPrice)} (${roc5Txt} 5d)`,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreNews(news) {
  return { score: news.sentimentScore, ...news };
}

function scoreTechnical(t) {
  let score = 50;
  if (t.price > t.s20) score += 6; else score -= 6;
  if (t.price > t.s50) score += 7; else score -= 7;
  if (t.s200 != null && t.price > t.s200) score += 7; else if (t.s200 != null) score -= 7;
  if (t.s20 != null && t.s50 != null) score += t.s20 > t.s50 ? 4 : -4;
  if (t.rsi != null) {
    if (t.rsi >= 45 && t.rsi <= 65) score += 5;
    else if (t.rsi > 65 && t.rsi <= 75) score += 3;
    else if (t.rsi < 35) score -= 6;
    else if (t.rsi < 45) score -= 4;
  }
  if (t.macdValue != null && t.macdSignal != null) score += t.macdValue > t.macdSignal ? 5 : -5;
  if (t.roc20 != null) score += t.roc20 > 0 ? 4 : -4;
  if (t.volRatio >= 1.2) score += 3;
  else if (t.volRatio <= 0.7) score -= 3;
  const fromHigh = (t.price - t.high52w) / t.high52w;
  if (fromHigh > -0.2) score += 3;
  else if (fromHigh < -0.5) score -= 3;
  return clamp(score, 0, 100);
}

function scoreFundamentals(f) {
  // Only a P/E snapshot is available — no revenue/profit growth, ROE, margins
  // or balance-sheet data exist in this app, ever. Company-health score is
  // genuinely UNKNOWN, never a fabricated neutral number.
  return { score: null, available: Boolean(f?.pe != null) };
}

// NSE's daily P/E snapshot can be up to 12 days old before the fetch gives
// up (see server/python/market_data.py nselib_fundamentals). Past ~5
// trading days it's stale enough that it shouldn't be treated as identical
// to a same-day read — flagged, not discarded, since it's still the best
// data available.
const VALUATION_STALE_DAYS = 7;

function scoreValuation(f) {
  const pe = f?.pe;
  if (pe == null) return { score: null, available: false, flag: null, stale: false, ageDays: null };
  const ageDays = f?.tradeDate ? Math.round((Date.now() - new Date(f.tradeDate).getTime()) / 86400000) : null;
  const stale = ageDays != null && ageDays > VALUATION_STALE_DAYS;
  let score;
  let flag = null;
  if (pe < 0) score = 30;
  else if (pe <= 15) score = 65;
  else if (pe <= 25) score = 58;
  else if (pe <= 35) score = 45;
  else if (pe <= 50) {
    score = 32;
    flag = 'EXPENSIVE';
  } else {
    score = 20;
    flag = 'EXPENSIVE';
  }
  return { score, available: true, pe, flag, stale, ageDays };
}

function scoreMarket(m) {
  // Market mood is genuinely UNKNOWN without candle history — never fake a
  // neutral 50. A partial (index-snapshot-only) read still has no relative
  // strength, so it stays UNKNOWN too.
  if (!m.ok || m.partial) return null;
  let score = 50;
  if (m.regime === 'BULLISH') score += 20;
  else if (m.regime === 'BEARISH') score -= 20;
  if (m.relativeStrength != null) score += clamp(m.relativeStrength, -15, 15);
  return clamp(score, 0, 100);
}

function scoreRisk(t) {
  let score = 50;
  if (t.atrPct != null) {
    if (t.atrPct < 2) score += 15;
    else if (t.atrPct < 3) score += 8;
    else if (t.atrPct > 5) score -= 12;
  }
  if (t.drawdownFromHigh > -10) score += 15;
  else if (t.drawdownFromHigh > -25) score += 6;
  else if (t.drawdownFromHigh > -45) score -= 5;
  else score -= 12;
  if (t.avgVol20 > 1_000_000) score += 10;
  else if (t.avgVol20 > 100_000) score += 4;
  else if (t.avgVol20 <= 10_000) score -= 8;
  return clamp(score, 0, 100);
}

function momentumWord(rsi) {
  if (rsi == null) return null;
  if (rsi >= 75) return 'very hot';
  if (rsi >= 65) return 'strong';
  if (rsi >= 45) return 'balanced';
  if (rsi >= 35) return 'softening';
  return 'weak';
}

function technicalReason(t) {
  const parts = [];
  if (t.trend === 'Bullish') {
    parts.push(`Price is in an uptrend, trading above its 50-day average (₹${round2(t.s50)}).`);
  } else if (t.trend === 'Bearish') {
    parts.push(`Price is in a downtrend, trading below its 50-day average (₹${round2(t.s50)}).`);
  } else {
    parts.push('Price is range-bound, hovering near its 50-day average.');
  }
  if (t.s200 != null) {
    parts.push(t.price > t.s200 ? 'It is also above its 200-day average, which is a good long-term sign.' : 'It is below its 200-day average, which is a long-term concern.');
  }
  if (t.rsi != null) {
    parts.push(`Buying pressure is ${momentumWord(t.rsi)} (${round2(t.rsi)}/100).`);
  }
  if (t.macdValue != null && t.macdSignal != null) {
    parts.push(t.macdValue > t.macdSignal ? 'Short-term momentum is turning up.' : 'Short-term momentum is turning down.');
  }
  if (t.roc20 != null) {
    parts.push(t.roc20 >= 0 ? `Over the last month the price rose about ${round2(t.roc20)}%.` : `Over the last month the price fell about ${Math.abs(round2(t.roc20))}%.`);
  }
  if (t.volRatio != null) {
    if (t.volRatio >= 1.2) parts.push('Trading activity is higher than usual, which shows strong interest.');
    else if (t.volRatio <= 0.7) parts.push('Trading activity is lower than usual, which shows less conviction.');
    else parts.push('Trading activity is at normal levels.');
  }
  return parts.join(' ');
}

function valuationLabel(v) {
  if (v.pe < 0) return 'the company is not currently earning a profit';
  if (v.pe <= 15) return 'the price looks cheap compared to similar NSE stocks';
  if (v.pe <= 25) return 'the price is fair, in line with similar NSE stocks';
  if (v.pe <= 35) return 'the price is on the higher side';
  return 'the price looks expensive compared to similar NSE stocks';
}

// ---------------------------------------------------------------------------
// Entry & stop-loss
// ---------------------------------------------------------------------------

function entryAndStop(t) {
  const atr = t.atr ?? t.price * 0.02;
  const overbought = t.rsi != null && t.rsi > 75;
  let entryLow;
  let entryHigh;
  let stopLoss;
  let note;

  if (overbought) {
    // Wait for a pullback instead of chasing.
    const dipTarget = t.s20 != null && t.s20 < t.price ? t.s20 : t.primarySupport;
    entryLow = Math.min(dipTarget, t.primarySupport);
    entryHigh = Math.max(dipTarget, t.primarySupport);
    stopLoss = t.primarySupport - atr;
    note = 'Price has run up fast. It is safer to buy on a small dip near the support level instead of chasing the current price.';
  } else {
    entryLow = t.primarySupport;
    entryHigh = Math.min(t.price, t.primarySupport + atr * 0.5);
    stopLoss = t.primarySupport - atr;
    note = null;
  }

  stopLoss = Math.max(stopLoss, 0.01);
  return {
    entryLow: round2(entryLow),
    entryHigh: round2(Math.max(entryLow, entryHigh)),
    stopLoss: round2(stopLoss),
    overbought,
    note,
    reason: `Stop-loss is placed just below the price floor (₹${round2(t.primarySupport)}) with a safety buffer of ₹${round2(atr)}. It triggers only if the floor truly breaks.`,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Short-TTL cache so real-time polling (news + market) stays cheap and does
// not hammer NSE / the news feed on every request.
const analysisCache = new Map();
const ANALYSIS_CACHE_TTL_OK = 2_000; // recompute price/technical/market every ~2s
const ANALYSIS_CACHE_TTL_ERR = 5_000;
// Stale-while-revalidate bound: serve the last-known result instantly while a
// background recompute runs, but never show data older than this.
const ANALYSIS_MAX_STALENESS_MS = 10_000;
const pendingRefresh = new Map();

// News and fundamentals change slowly, so cache them separately to keep the
// 2s recompute fast without hammering Google News / the PE archive.
const newsCache = new Map();
const NEWS_CACHE_TTL = 2_000; // real-time: re-fetch news every ~2s with the analysis
// NewsAPI optional key (get free key at https://newsapi.org/)
// When set, NewsAPI is used as fallback if Google News RSS returns < 2 articles.
const NEWSAPI_KEY = process.env.NEWSAPI_KEY ?? '';
const fundCache = new Map();
const FUND_CACHE_TTL = 10 * 60_000;

async function fetchNewsCached(provider, sym) {
  const hit = newsCache.get(sym);
  if (hit && Date.now() - hit.at < NEWS_CACHE_TTL) return hit.val;
  const val = await fetchStockNews(sym, { limit: 8 }).catch(() => null);
  newsCache.set(sym, { at: Date.now(), val });
  return val;
}

async function getFundamentalsCached(provider, sym) {
  const hit = fundCache.get(sym);
  if (hit && Date.now() - hit.at < FUND_CACHE_TTL) return hit.val;
  const val = await provider.getFundamentals(sym).catch(() => null);
  fundCache.set(sym, { at: Date.now(), val });
  return val;
}

function cacheResult(sym, result) {
  analysisCache.set(sym, {
    at: Date.now(),
    ttl: result.ok ? ANALYSIS_CACHE_TTL_OK : ANALYSIS_CACHE_TTL_ERR,
    result,
  });
  // Keep the cache bounded.
  if (analysisCache.size > 300) {
    const oldest = [...analysisCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) analysisCache.delete(oldest);
  }
}

export async function analyzeStock(symbol, { includeNews = true } = {}) {
  const provider = getMarketDataProvider();
  const sym = String(symbol || '').trim().toUpperCase();

  const hit = analysisCache.get(sym);
  if (hit) {
    const age = Date.now() - hit.at;
    if (age < hit.ttl) return hit.result;
    if (age < ANALYSIS_MAX_STALENESS_MS) {
      // Stale but still usable: return instantly and refresh in the background
      // so the next poll within the TTL window is already fresh.
      refreshInBackground(provider, sym, { includeNews });
      return hit.result;
    }
    // Too stale — wait for a fresh compute so we never serve outdated scores.
  }

  return computeAnalysis(provider, sym, { includeNews });
}

async function refreshInBackground(provider, sym, opts) {
  if (pendingRefresh.has(sym)) return pendingRefresh.get(sym);
  const p = computeAnalysis(provider, sym, opts)
    .catch(() => null)
    .finally(() => pendingRefresh.delete(sym));
  pendingRefresh.set(sym, p);
  return p;
}

async function computeAnalysis(provider, sym, { includeNews }) {

  const tech = await gatherTechnical(provider, sym);
  if (!tech.ok) {
    const failed = {
      symbol: sym,
      ok: false,
      error: 'No live quote or candles available for this symbol right now.',
      dataTimestamp: new Date().toISOString(),
    };
    cacheResult(sym, failed);
    return failed;
  }

  // market only needs `tech` (already available) and fetches NIFTY data
  // independently of news/fundamentals — no reason to wait for those first.
  const [news, fundamentals, market] = await Promise.all([
    includeNews ? fetchNewsCached(provider, sym) : Promise.resolve(null),
    getFundamentalsCached(provider, sym),
    gatherMarket(provider, tech),
  ]);

  const newsResult = news ? scoreNews(news) : { score: null, articles: [], positive: 0, neutral: 0, negative: 0, overall: 'Neutral', available: false };
  const techScore = scoreTechnical(tech);
  const fundResult = scoreFundamentals(fundamentals);
  const valResult = scoreValuation(fundamentals);
  const marketScore = scoreMarket(market);
  const riskScore = scoreRisk(tech);

  // Advisory flags only — NOT the published score/signal. The single
  // user-facing overall score and signal come from the engine below
  // (predictionEngine.buildEngineResult), which renormalises over known
  // factors instead of silently substituting a neutral 50 for UNKNOWN ones.
  const flags = [];
  if (tech.rsi != null && tech.rsi > 75) flags.push('PRICE RAN UP FAST');
  if (market.ok && !market.partial && market.regime === 'BEARISH') flags.push('WEAK MARKET');
  const fundamentalsAvailable = fundResult.available && valResult.available;
  if (!fundamentalsAvailable) flags.push('LIMITED COMPANY DATA');
  if (valResult.flag) flags.push(valResult.flag);
  if (valResult.stale) flags.push('STALE VALUATION DATA');

  const entry = entryAndStop(tech);

  // Confidence. A stale P/E snapshot is still the best data available, but
  // it shouldn't buy the same confidence as a fresh one.
  const valuationFresh = valResult.available && !valResult.stale;
  let confidence = 'LOW';
  if (tech.closes.length >= 100 && newsResult.articles?.length >= 3) confidence = 'MEDIUM';
  if (fundResult.available && valuationFresh && tech.closes.length >= 150 && newsResult.articles?.length >= 3) confidence = 'HIGH';

  const positiveFactors = [];
  const negativeFactors = [];

  if (tech.trend === 'Bullish') positiveFactors.push('Price is in an uptrend, trading above its 50-day average');
  if (tech.price > tech.s200) positiveFactors.push('Above its 200-day average — long-term trend is up');
  if (tech.rsi != null && tech.rsi >= 45 && tech.rsi <= 70) positiveFactors.push(`Buying pressure is healthy (${round2(tech.rsi)}/100) — not overheated`);
  if (tech.roc20 != null && tech.roc20 > 0) positiveFactors.push(`Price moved up ${round2(tech.roc20)}% over the last month`);
  if (tech.macdValue != null && tech.macdSignal != null && tech.macdValue > tech.macdSignal) positiveFactors.push('Short-term momentum is turning up');
  if (market.regime === 'BULLISH') positiveFactors.push('Market mood is positive (Nifty is in an uptrend)');
  if (market.ok && market.regime === 'BEARISH') negativeFactors.push('Market mood is weak (Nifty is in a downtrend) — this drags on the whole market, so be extra careful');
  if (market.relativeStrength > 0) positiveFactors.push(`Doing better than the Nifty by +${round2(market.relativeStrength)}% over a month`);
  if (newsResult.score != null && newsResult.score >= 60) positiveFactors.push(`News is positive (${newsResult.score}/100)`);

  if (tech.rsi != null && tech.rsi > 75) negativeFactors.push('Price has run up fast — may be overheated, waiting for a dip is safer');
  if (tech.rsi != null && tech.rsi < 35) negativeFactors.push(`Buying pressure is weak (${round2(tech.rsi)}/100)`);
  if (tech.trend === 'Bearish') negativeFactors.push('Price is in a downtrend, below its 50-day average');
  if (tech.price < tech.s200) negativeFactors.push('Below its 200-day average — long-term trend is down');
  if (tech.drawdownFromHigh < -30) negativeFactors.push(`Price is ${Math.abs(tech.drawdownFromHigh)}% below its 1-year high`);
  if (tech.volRatio < 0.7) negativeFactors.push('Trading activity is low — the move is not strongly confirmed');
  if (newsResult.score != null && newsResult.score <= 40) negativeFactors.push(`News is negative (${newsResult.score}/100)`);
  if (valResult.flag) negativeFactors.push('Price looks expensive compared to company earnings');
  if (!fundamentalsAvailable) negativeFactors.push('Limited company data available — company-health score is UNKNOWN, not verified');

  const newsAvailable = Boolean(newsResult.available ?? newsResult.articles?.length);

  const reasons = {
    news: newsAvailable
      ? `${newsResult.positive ?? 0} positive, ${newsResult.neutral ?? 0} neutral and ${newsResult.negative ?? 0} negative news articles. Overall mood: ${newsResult.overall ?? 'Neutral'} (score ${newsResult.score}/100).`
      : 'We could not fetch news for this stock, so the news score is UNKNOWN.',
    technical: technicalReason(tech),
    fundamentals: fundResult.available
      ? `We have the earnings multiple (P/E ${fundamentals?.pe}). We do not have growth, profit-margin or debt data from our current sources, so the company-health score is UNKNOWN.`
      : 'We do not have company financials from our current sources, so the company-health score is UNKNOWN.',
    valuation: valResult.available
      ? `The price is ${round2(valResult.pe)}× the company's yearly earnings. Compared to typical NSE stocks, ${valuationLabel(valResult)}.`
      : 'We do not have valuation data from our current sources, so this score is UNKNOWN.',
    market: market.ok && !market.partial
      ? `Market mood is ${String(market.regime).toLowerCase()}${market.relativeStrength > 0 ? ` and this stock is doing better than the Nifty by ${round2(market.relativeStrength)}% over a month` : market.relativeStrength < 0 ? ` but this stock is trailing the Nifty by ${Math.abs(round2(market.relativeStrength))}% over a month` : ''}.`
      : 'We could not read the broader market trend (no candle history), so this score is UNKNOWN.',
    risk: `On an average day the price swings about ${tech.atrPct != null ? round2(tech.atrPct) : 'n/a'}%. It is ${Math.abs(tech.drawdownFromHigh)}% below its 1-year high. About ${tech.avgVol20 > 0 ? `${Math.round(tech.avgVol20).toLocaleString()} shares` : 'not enough shares'} are traded daily.`,
  };

  const result = {
    symbol: sym,
    ok: true,
    companyName: tech.quote?.companyName ?? tech.quote?.symbol ?? sym,
    price: tech.price,
    quote: tech.quote ?? null,
    // finalSignal/overallScore/confidence are placeholders here — they are
    // overwritten below from result.engine, the single scoring/signal
    // authority, once it has been built. Never read these two fields before
    // that point.
    finalSignal: null,
    overallScore: null,
    confidence,
    flags,
    factorScores: {
      news: newsResult.score,
      technical: techScore,
      fundamentals: fundResult.score,
      valuation: valResult.score,
      market: marketScore,
      risk: riskScore,
    },
    scores: {
      news: newsResult.score,
      technical: techScore,
      fundamentals: fundResult.score,
      valuation: valResult.score,
      market: marketScore,
      risk: riskScore,
    },
    news: {
      positive: newsResult.positive ?? 0,
      neutral: newsResult.neutral ?? 0,
      negative: newsResult.negative ?? 0,
      overall: newsResult.overall ?? 'Neutral',
      sentimentScore: newsResult.score,
      available: Boolean(newsResult.available ?? newsResult.articles?.length),
      articles: newsResult.articles ?? [],
      positiveCatalysts: newsResult.positiveCatalysts ?? [],
      negativeCatalysts: newsResult.negativeCatalysts ?? [],
      independentEvents: newsResult.independentEvents ?? null,
      materialEvents: newsResult.materialEvents ?? null,
    },
    technical: {
      stale: tech.candlesStale,
      trend: tech.trend,
      rsi: tech.rsi,
      macd: { value: round2(tech.macdValue), signal: round2(tech.macdSignal) },
      sma20: tech.s20,
      sma50: tech.s50,
      sma200: tech.s200,
      roc10: round2(tech.roc10),
      roc20: round2(tech.roc20),
      volume: tech.lastVol,
      avgVolume20: tech.avgVol20,
      volumeRatio: tech.volRatio,
      atrPct: tech.atrPct == null ? null : round2(tech.atrPct),
      support: tech.primarySupport,
      supportSecondary: tech.secondarySupport,
      resistance: tech.primaryResistance,
      high52w: tech.high52w,
      low52w: tech.low52w,
      drawdownFromHighPct: tech.drawdownFromHigh,
      candleCount: tech.closes.length,
    },
    fundamentals: {
      available: fundResult.available,
      pe: fundamentals?.pe ?? null,
      adjustedPe: fundamentals?.adjustedPe ?? null,
      tradeDate: fundamentals?.tradeDate ?? null,
      note: fundResult.available
        ? 'P/E snapshot available; revenue growth, margins, ROE and debt data are not available from current sources.'
        : 'Fundamentals data not available from current sources.',
    },
    valuation: {
      available: valResult.available,
      pe: valResult.pe ?? null,
      flag: valResult.flag,
      stale: valResult.stale,
      ageDays: valResult.ageDays,
      note: valResult.available
        ? `P/E ${valResult.pe} compared against a rough NSE fair-value band (15–25)${valResult.stale ? ` — snapshot is ${valResult.ageDays} days old, treat as STALE` : ''}.`
        : 'Valuation data not available from current sources.',
    },
    market: {
      ok: Boolean(market.ok),
      available: Boolean(market.ok),
      partial: Boolean(market.partial),
      regime: market.regime,
      relativeStrength: market.relativeStrength,
      niftyLevel: market.niftyLevel ?? null,
      note: market.note,
    },
    risk: {
      score: riskScore,
      volatilityPct: tech.atrPct == null ? null : round2(tech.atrPct),
      drawdownFromHighPct: tech.drawdownFromHigh,
      liquidity: tech.avgVol20 > 0 ? `${Math.round(tech.avgVol20).toLocaleString()} shares/day (20d avg)` : 'n/a',
    },
    entry: {
      zoneLow: entry.entryLow,
      zoneHigh: entry.entryHigh,
      stopLoss: entry.stopLoss,
      note: entry.note,
      reason: entry.reason,
      overbought: entry.overbought,
    },
    positiveFactors: positiveFactors.slice(0, 6),
    negativeFactors: negativeFactors.slice(0, 6),
    reasons,
    dataTimestamp: new Date().toISOString(),
    disclaimer:
      'This is an algorithmic research signal using live market data and news, not a guaranteed prediction of future price movement.',
  };

  // Structured expected close so the UI can show a checkable "predicted high" list.
  const _expPct = expectedMove(tech);
  result.expectedClose = tech.price != null ? round2(tech.price * (1 + _expPct / 100)) : null;
  result.expectedPct = _expPct;

  // Spec-compliant prediction engine: 0-100 weighted score (renormalised over
  // known factors — UNKNOWN factors are excluded, never treated as neutral),
  // classification, BUY discipline gates, trade plan and closing-range
  // forecast. This is the SINGLE authority for the published overall score
  // and signal — nothing above this line is user-facing yet.
  result.engine = buildEngineResult(result);
  result.engineWhy = buildWhySection(result);
  result.overallScore = result.engine.totalScore;
  result.finalSignal = result.engine.signal;

  // Narrative text is generated AFTER the single score/signal is fixed, so
  // it can never describe a different verdict than what's published.
  result.oneLiner = oneLineExplanation(result);
  const note = simpleLanguageNote(result);
  result.simpleNote = note;
  // Pull out the forward-looking "Prediction:" sentence for a highlighted box.
  const predIdx = note.indexOf(' Prediction:');
  result.prediction = predIdx >= 0 ? note.slice(predIdx + ' Prediction:'.length).trim() : '';

  // Mandatory final consistency gate (see outputValidator.js). Callers must
  // check result.finalValidation.passed before publishing this analysis.
  result.finalValidation = validateAnalysis(result);

  cacheResult(sym, result);
  return result;
}

// ---------------------------------------------------------------------------
// Formatted text output (matches the analyst report layout)
// ---------------------------------------------------------------------------

export function formatAnalysis(result) {
  if (!result.ok) {
    return `STOCK: ${result.symbol}\nDATA: unavailable\n\n${result.error}`;
  }
  const s = result.scores;
  const t = result.technical;
  const n = result.news;
  const f = result.fundamentals;
  const v = result.valuation;
  const e = result.entry;
  const lines = [];
  lines.push(`STOCK: ${result.companyName}`);
  lines.push(`NSE SYMBOL: ${result.symbol}`);
  lines.push(`CURRENT PRICE: ₹${result.price}`);
  lines.push('');
  lines.push(`OVERALL SCORE: ${result.overallScore}`);
  lines.push(`DIRECTIONAL OUTLOOK: ${result.engine?.directionalOutlook ?? 'n/a'}`);
  lines.push(`TRADING SIGNAL: ${result.finalSignal}${result.flags.length ? ` (${result.flags.join(', ')})` : ''}`);
  lines.push(`TRADE DECISION: ${result.engine?.tradeStatus ?? 'n/a'}`);
  lines.push(`CONFIDENCE: ${result.confidence}`);
  lines.push('');
  lines.push('SCORES:');
  const sc = (v) => (v == null ? 'UNKNOWN' : `${v}/100`);
  lines.push(`📰 News: ${sc(s.news)}`);
  lines.push(`📈 Price action: ${sc(s.technical)}`);
  lines.push(`💰 Company health: ${sc(s.fundamentals)}`);
  lines.push(`💵 Price vs value: ${sc(s.valuation)}`);
  lines.push(`📊 Market mood: ${sc(s.market)}`);
  lines.push(`⚠️ Safety: ${sc(s.risk)}`);
  lines.push('');
  lines.push('KEY POSITIVE FACTORS:');
  result.positiveFactors.forEach((p) => lines.push(`- ${p}`));
  lines.push('');
  lines.push('KEY NEGATIVE FACTORS:');
  result.negativeFactors.forEach((p) => lines.push(`- ${p}`));
  lines.push('');
  lines.push('TECHNICAL STATUS:');
  lines.push(`- Trend: ${t.trend}`);
  lines.push(`- Buying pressure: ${t.rsi ?? 'n/a'}/100`);
  lines.push(`- Trading activity: ${t.volumeRatio}x usual (${t.avgVolume20 > 0 ? Math.round(t.avgVolume20).toLocaleString() : 'n/a'}/day)`);
  lines.push(`- Support (buy zone floor): ₹${t.support}`);
  lines.push(`- Resistance (sell ceiling): ₹${t.resistance}`);
  lines.push('');
  lines.push('NEWS SUMMARY:');
  lines.push(`- Positive: ${n.positive}`);
  lines.push(`- Neutral: ${n.neutral}`);
  lines.push(`- Negative: ${n.negative}`);
  lines.push(`- Overall sentiment: ${n.overall}`);
  if (!n.available) lines.push('- News unavailable — sentiment score is UNKNOWN.');
  lines.push('');
  lines.push('ENTRY:');
  lines.push(`₹${e.zoneLow} – ₹${e.zoneHigh}`);
  if (e.note) lines.push(`Note: ${e.note}`);
  lines.push('');
  lines.push('STOP-LOSS:');
  lines.push(`₹${e.stopLoss}`);
  lines.push(`(reason: ${e.reason})`);
  lines.push('');
  lines.push('MAIN RISKS:');
  const risks = result.negativeFactors.slice(0, 3);
  risks.forEach((r) => lines.push(`- ${r}`));
  if (!f.available) lines.push(`- ${f.note}`);
  if (v.flag) lines.push(`- ${v.flag}`);
  else if (v.available) lines.push(`- ${v.note}`);
  lines.push('');
  lines.push('ONE-LINE EXPLANATION:');
  lines.push(`"${oneLineExplanation(result)}"`);
  lines.push('');
  lines.push('DATA TIMESTAMP:');
  lines.push(result.dataTimestamp);
  lines.push('');
  lines.push('IMPORTANT:');
  lines.push('This is an algorithmic research signal, not a guaranteed prediction of future price movement.');
  return lines.join('\n');
}

export function oneLineExplanation(result) {
  const s = result.scores;
  const known = Object.entries(s).filter(([, v]) => v != null);
  const driver = known.length ? known.sort((a, b) => b[1] - a[1])[0] : null;
  const driverNames = { news: 'news', technical: 'price action', fundamentals: 'company health', valuation: 'price vs value', market: 'market mood', risk: 'safety' };
  const trend = result.technical.trend === 'Bullish' ? 'uptrend' : result.technical.trend === 'Bearish' ? 'downtrend' : 'range-bound';
  const trendPhrase = trend === 'range-bound' ? 'a range' : trend === 'uptrend' ? 'an uptrend' : 'a downtrend';
  const driverText = driver ? `the strongest factor is ${driverNames[driver[0]]} at ${driver[1]}/100` : 'no factor scores are known with confidence yet';
  return `${result.finalSignal} (score ${result.overallScore}) — ${driverText}. Price is in ${trendPhrase}, buying pressure ${result.technical.rsi != null ? `${result.technical.rsi}/100` : 'n/a'}.${result.flags.length ? ' Flags: ' + result.flags.join(', ') + '.' : ''}`;
}

// ---------------------------------------------------------------------------
// Plain-language ("plain talk") note — a simple, human explanation of what the
// data suggests could happen next. Intentionally non-technical so a first-time
// user can understand the gist without reading the factor breakdown.
// ---------------------------------------------------------------------------

function inrShort(n) {
  if (n == null || !Number.isFinite(Number(n))) return 'n/a';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Rough expected day move (%) from the live trend + momentum. Capped ±2% so it
// stays a sane, checkable "where should it close" estimate — not a wild target.
export function expectedMove(tech) {
  let expPct = 0;
  const trend = tech?.trend ?? 'Range';
  if (trend === 'Bullish') expPct += 0.8;
  else if (trend === 'Bearish') expPct -= 0.8;
  const rsi = tech?.rsi;
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 70) expPct += 0.4;
    else if (rsi > 70) expPct -= 0.3; // overbought → less upside
    else if (rsi < 40) expPct -= 0.4;
  }
  return Math.max(-2, Math.min(2, expPct));
}

export function simpleLanguageNote(result) {
  const name = result.companyName || result.symbol || 'This stock';
  const signal = result.finalSignal;
  const trend = result.technical?.trend ?? 'Range';
  const entry = result.entry ?? {};
  const stop = entry.stopLoss;
  const topPositive = result.positiveFactors?.[0];
  const topNegative = result.negativeFactors?.[0];

  const buyish = signal === 'BUY' || signal === 'STRONG BUY';
  const dip = signal === 'WATCH' && Boolean(entry.overbought);
  const avoid = signal === 'AVOID';

  // Clear verdict: should you buy or not?
  let verdict;
  if (buyish) verdict = 'our simple read is BUY — the data says it can go up.';
  else if (dip) verdict = 'our simple read is BUY ON DIP — you can buy it on a small fall.';
  else if (avoid) verdict = 'our simple read is DON\'T BUY — better to stay away.';
  else verdict = 'our simple read is WAIT & WATCH — don\'t buy yet.';

  // Simple reason in everyday words.
  let reason;
  if (buyish || dip) {
    const t = trend === 'Bullish' ? 'price is going up' : 'price is steady';
    const n = result.news?.overall && result.news.overall !== 'Neutral'
      ? ` and news is ${String(result.news.overall).toLowerCase()}`
      : '';
    const extra = topPositive ? ` ${topPositive.charAt(0).toLowerCase()}${topPositive.slice(1)}.` : '';
    reason = `Why: ${t}${n}.${extra}`;
  } else if (avoid) {
    reason = `Why: ${topNegative ? topNegative.charAt(0).toLowerCase() + topNegative.slice(1) + '.' : 'the data looks weak.'}`;
  } else {
    reason = 'Why: the data is mixed, so no clear up or down move yet.';
  }

  // Short plan.
  let action;
  if (buyish || dip) {
    action = `Plan: buy near ${inrShort(entry.zoneLow)}–${inrShort(entry.zoneHigh)}`;
    if (stop != null) action += `, and sell if it falls below ${inrShort(stop)}.`;
  } else if (avoid) {
    action = 'Plan: no buy. Just keep it on your watchlist.';
  } else {
    action = 'Plan: wait for a clearer signal before buying.';
  }

  // Clarify where today's price sits vs the buy zone so the call can't be
  // misread as "buy at any price".
  let priceNote = '';
  const price = result.price;
  if ((buyish || dip) && price != null && entry.zoneHigh != null && entry.zoneLow != null) {
    if (price > entry.zoneHigh) {
      priceNote = ` But today's price is ${inrShort(price)}, which is ABOVE the buy zone — so wait for it to dip to that zone; don't buy at today's price.`;
    } else if (price < entry.zoneLow) {
      priceNote = ` But today's price is ${inrShort(price)}, which is BELOW the buy zone — that is a warning, so be extra careful.`;
    } else {
      priceNote = ` Today's price ${inrShort(price)} is already inside the buy zone, so you can buy now.`;
    }
  }

  // Forward-looking, LIVE prediction: anchored to the current price and a
  // rough expected close derived from the live trend + momentum, so the user
  // gets a checkable "where should it end the day" number in plain words.
  // Once the session has closed for the day (see officialClose.isPastClose),
  // "it should close around X" is no longer a forecast — the close already
  // happened and may well have gone the other way — so switch to reporting
  // today's realized move instead of restating a now-falsified prediction.
  let prediction = '';
  const marketRegime = result.market?.regime ?? 'NEUTRAL';
  const resistance = result.technical?.primaryResistance;
  const support = result.technical?.primarySupport;
  const entryMid = (Number(entry.zoneLow) + Number(entry.zoneHigh)) / 2;

  const sessionOver = isPastClose();
  const realizedPct = result.quote?.changePct;

  const expPct = expectedMove(result.technical);
  const expClose = price != null ? price * (1 + expPct / 100) : null;

  const nifty = result.market?.niftyLevel;
  const marketWord = marketRegime === 'BULLISH' ? 'market looks like it will rise'
    : marketRegime === 'BEARISH' ? 'market looks weak'
    : 'market looks flat';
  const marketPrice = nifty != null ? ` (Nifty ${inrShort(nifty)})` : '';
  const priceLead = sessionOver ? "Today's close for" : 'Right now';
  const realizedText = sessionOver && realizedPct != null ? ` (${realizedPct >= 0 ? '+' : ''}${realizedPct}% for the day)` : '';
  const livePrice = price != null ? ` ${priceLead} ${name} is ${inrShort(price)}${realizedText},` : '';
  // Same trend+momentum estimate either way — only the framing changes.
  // Pre-close it's phrased as "today should close around X"; once today's
  // close already happened, re-anchor the same number to the NEXT session
  // instead of dropping the call entirely.
  const expText = expClose == null
    ? ' it should move up'
    : sessionOver
    ? ` for the next session, starting from today's close, the trend points to around ${inrShort(expClose)} (${expPct >= 0 ? '+' : ''}${expPct.toFixed(1)}%)`
    : ` on its trend it should close around ${inrShort(expClose)} (${expPct >= 0 ? '+' : ''}${expPct.toFixed(1)}% from here)`;

  if (buyish || dip) {
    if (resistance != null && entryMid > 0) {
      const upside = ((Number(resistance) - entryMid) / entryMid) * 100;
      prediction = ` Prediction:${livePrice} ${marketWord}${marketPrice}, and ${name} is in an uptrend, so${expText}. If you buy near ${inrShort(entryMid)} it could give about ${upside >= 0 ? '+' : ''}${upside.toFixed(0)}% up to resistance ${inrShort(resistance)}. Sell if it falls below ${inrShort(stop)}.`;
    } else {
      prediction = ` Prediction:${livePrice} ${marketWord}${marketPrice}, and ${name} is in an uptrend, so${expText}. Plan: buy near ${inrShort(entry.zoneLow)}–${inrShort(entry.zoneHigh)}, sell if below ${inrShort(stop)}.`;
    }
  } else if (avoid) {
    prediction = ` Prediction:${livePrice} ${marketWord}${marketPrice}, and the trend is down, so${expText}. Better not to buy — if you already hold, exit if it falls below ${inrShort(stop)}.`;
  } else {
    prediction = ` Prediction:${livePrice} ${marketWord}${marketPrice}, no clear move expected, so${expText}. Just watch for now.`;
  }

  return `Plain talk — ${name}: ${verdict} ${reason} ${action}${priceNote}${prediction}`;
}