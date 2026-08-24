/**
 * stockAnalysisService — structured NSE stock analysis & recommendation engine.
 *
 * Scores a stock on seven weighted factors using LIVE app data only:
 *   1. News & sentiment       20%  (Google News RSS, keyword-classified)
 *   2. Technical analysis     25%  (live quote + daily candles → indicators)
 *   3. Fundamentals           25%  (P/E snapshot only; growth/margin data may be unavailable)
 *   4. Valuation              15%  (P/E vs rough NSE fair-value band)
 *   5. Market & sector trend   5%  (live Nifty trend + relative strength)
 *   6. Risk                   10%  (volatility, drawdown, liquidity)
 *
 * Overall = weighted sum. Overrides: RSI>75 → BUY ON DIP (OVERBOUGHT);
 * strongly negative news downgrades; missing fundamentals/valuation caps the
 * signal at BUY and flags the data gap. Missing data is stated, never guessed.
 *
 * This is an algorithmic research signal, not a guaranteed prediction.
 */

import { getMarketDataProvider } from '../providers/marketData/index.js';
import { sma, ema, rsi, atr, roc, clamp } from './radar/indicators.js';
import { fetchStockNews } from './newsService.js';
import { round2 } from '../utils/helpers.js';

const NUMBER_TO_SIGNAL = [
  [85, 'STRONG BUY'],
  [75, 'BUY'],
  [65, 'BUY ON DIP'],
  [50, 'HOLD'],
  [35, 'AVOID'],
  [0, 'STRONG AVOID'],
];

function signalForScore(score) {
  for (const [threshold, signal] of NUMBER_TO_SIGNAL) {
    if (score >= threshold) return signal;
  }
  return 'STRONG AVOID';
}

function downgrade(signal) {
  const order = ['STRONG BUY', 'BUY', 'BUY ON DIP', 'HOLD', 'AVOID', 'STRONG AVOID'];
  const i = order.indexOf(signal);
  return i >= order.length - 1 ? signal : order[i + 1];
}

// ---------------------------------------------------------------------------
// Data gathering (each block degrades gracefully)
// ---------------------------------------------------------------------------

async function gatherTechnical(provider, symbol) {
  const q = await provider.getQuote(symbol, 'NSE').catch(() => null);
  const candles = (await provider.getCandles(symbol, '1d', 280, 'NSE').catch(() => [])) ?? [];
  if (!candles.length && !q) return { ok: false };

  const closes = candles.map((c) => Number(c.close)).filter(Number.isFinite);
  if (!closes.length) return { ok: false };

  const price = q?.lastPrice ?? closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);

  // MACD line series → signal (EMA9 of MACD line).
  let e12 = closes[0];
  let e26 = closes[0];
  const macdLine = [];
  for (const c of closes) {
    e12 = c * (2 / 13) + e12 * (1 - 2 / 13);
    e26 = c * (2 / 27) + e26 * (1 - 2 / 27);
    macdLine.push(e12 - e26);
  }
  const macdValue = macdLine[macdLine.length - 1];
  const macdSignal = ema(macdLine, 9);

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
  const out = { ok: false, regime: 'NEUTRAL', niftyRoc20: 0, relativeStrength: 0, note: '' };
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
        return {
          ok: true,
          regime: s.changePct >= 0 ? 'NEUTRAL' : 'NEUTRAL',
          niftyRoc20: 0,
          relativeStrength: 0,
          note: `Nifty ${round2(s.level)} (${round2(s.changePct)}%)`,
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

  const relativeStrength = (tech?.roc20 ?? 0) - niftyRoc20;
  return {
    ok: true,
    regime,
    niftyRoc20: round2(niftyRoc20),
    relativeStrength: round2(relativeStrength),
    niftyLevel: round2(niftyPrice),
    note: `Nifty ${round2(niftyPrice)} (${round2(roc(niftyCloses, 5))}% 5d)`,
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
  score += t.roc20 > 0 ? 4 : -4;
  if (t.volRatio >= 1.2) score += 3;
  else if (t.volRatio <= 0.7) score -= 3;
  const fromHigh = (t.price - t.high52w) / t.high52w;
  if (fromHigh > -0.2) score += 3;
  else if (fromHigh < -0.5) score -= 3;
  return clamp(score, 0, 100);
}

function scoreFundamentals(f) {
  // Only a P/E snapshot is available — no revenue/profit growth, ROE, margins
  // or balance-sheet data. Score stays neutral and the gap is stated.
  return { score: 50, available: Boolean(f?.pe != null) };
}

function scoreValuation(f) {
  const pe = f?.pe;
  if (pe == null) return { score: 50, available: false, flag: null };
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
  return { score, available: true, pe, flag };
}

function scoreMarket(m) {
  let score = 50;
  if (m.ok) {
    if (m.regime === 'BULLISH') score += 20;
    else if (m.regime === 'BEARISH') score -= 20;
    score += clamp(m.relativeStrength, -15, 15);
  }
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

  const [news, fundamentals] = await Promise.all([
    includeNews ? fetchNewsCached(provider, sym) : Promise.resolve(null),
    getFundamentalsCached(provider, sym),
  ]);
  const market = await gatherMarket(provider, tech);

  const newsResult = news ? scoreNews(news) : { score: 50, articles: [], positive: 0, neutral: 0, negative: 0, overall: 'Neutral', available: false };
  const techScore = scoreTechnical(tech);
  const fundResult = scoreFundamentals(fundamentals);
  const valResult = scoreValuation(fundamentals);
  const marketScore = scoreMarket(market);
  const riskScore = scoreRisk(tech);

  let overall =
    newsResult.score * 0.2 +
    techScore * 0.25 +
    fundResult.score * 0.2 +
    valResult.score * 0.1 +
    marketScore * 0.15 +
    riskScore * 0.1;
  overall = clamp(Math.round(overall), 0, 100);

  let signal = signalForScore(overall);
  const flags = [];

  // Overrides.
  if (tech.rsi != null && tech.rsi > 75) {
    flags.push('PRICE RAN UP FAST');
    signal = 'BUY ON DIP';
  }
  if (market.ok && market.regime === 'BEARISH') {
    signal = downgrade(signal);
    flags.push('WEAK MARKET');
  }
  if (newsResult.score < 35) signal = downgrade(signal);
  const fundamentalsAvailable = fundResult.available && valResult.available;
  if (!fundamentalsAvailable) {
    signal = downgrade(signal); // missing data → no STRONG BUY
    flags.push('LIMITED COMPANY DATA');
  }
  if (valResult.flag) flags.push(valResult.flag);

  const entry = entryAndStop(tech);

  // Confidence.
  let confidence = 'LOW';
  if (tech.closes.length >= 100 && newsResult.articles?.length >= 3) confidence = 'MEDIUM';
  if (fundamentalsAvailable && tech.closes.length >= 150 && newsResult.articles?.length >= 3) confidence = 'HIGH';

  const positiveFactors = [];
  const negativeFactors = [];

  if (tech.trend === 'Bullish') positiveFactors.push('Price is in an uptrend, trading above its 50-day average');
  if (tech.price > tech.s200) positiveFactors.push('Above its 200-day average — long-term trend is up');
  if (tech.rsi != null && tech.rsi >= 45 && tech.rsi <= 70) positiveFactors.push(`Buying pressure is healthy (${round2(tech.rsi)}/100) — not overheated`);
  if (tech.roc20 > 0) positiveFactors.push(`Price moved up ${round2(tech.roc20)}% over the last month`);
  if (tech.macdValue > tech.macdSignal) positiveFactors.push('Short-term momentum is turning up');
  if (market.regime === 'BULLISH') positiveFactors.push('Market mood is positive (Nifty is in an uptrend)');
  if (market.ok && market.regime === 'BEARISH') negativeFactors.push('Market mood is weak (Nifty is in a downtrend) — this drags on the whole market, so be extra careful');
  if (market.relativeStrength > 0) positiveFactors.push(`Doing better than the Nifty by +${round2(market.relativeStrength)}% over a month`);
  if (newsResult.score >= 60) positiveFactors.push(`News is positive (${newsResult.score}/100)`);

  if (tech.rsi != null && tech.rsi > 75) negativeFactors.push('Price has run up fast — may be overheated, waiting for a dip is safer');
  if (tech.rsi != null && tech.rsi < 35) negativeFactors.push(`Buying pressure is weak (${round2(tech.rsi)}/100)`);
  if (tech.trend === 'Bearish') negativeFactors.push('Price is in a downtrend, below its 50-day average');
  if (tech.price < tech.s200) negativeFactors.push('Below its 200-day average — long-term trend is down');
  if (tech.drawdownFromHigh < -30) negativeFactors.push(`Price is ${Math.abs(tech.drawdownFromHigh)}% below its 1-year high`);
  if (tech.volRatio < 0.7) negativeFactors.push('Trading activity is low — the move is not strongly confirmed');
  if (newsResult.score <= 40) negativeFactors.push(`News is negative (${newsResult.score}/100)`);
  if (valResult.flag) negativeFactors.push('Price looks expensive compared to company earnings');
  if (!fundamentalsAvailable) negativeFactors.push('Limited company data available — company-health score is neutral, not verified');

  const newsAvailable = Boolean(newsResult.available ?? newsResult.articles?.length);

  const reasons = {
    news: newsAvailable
      ? `${newsResult.positive ?? 0} positive, ${newsResult.neutral ?? 0} neutral and ${newsResult.negative ?? 0} negative news articles. Overall mood: ${newsResult.overall ?? 'Neutral'} (score ${newsResult.score}/100).`
      : 'We could not fetch news for this stock, so the news score is neutral.',
    technical: technicalReason(tech),
    fundamentals: fundResult.available
      ? `We have the earnings multiple (P/E ${fundamentals?.pe}). We do not have growth, profit-margin or debt data from our current sources, so the company-health score stays neutral.`
      : 'We do not have company financials from our current sources, so the company-health score is neutral.',
    valuation: valResult.available
      ? `The price is ${round2(valResult.pe)}× the company's yearly earnings. Compared to typical NSE stocks, ${valuationLabel(valResult)}.`
      : 'We do not have valuation data from our current sources, so this score is neutral.',
    market: market.ok
      ? `Market mood is ${String(market.regime).toLowerCase()}${market.relativeStrength > 0 ? ` and this stock is doing better than the Nifty by ${round2(market.relativeStrength)}% over a month` : market.relativeStrength < 0 ? ` but this stock is trailing the Nifty by ${Math.abs(round2(market.relativeStrength))}% over a month` : ''}.`
      : 'We could not read the broader market trend, so this score is neutral.',
    risk: `On an average day the price swings about ${tech.atrPct != null ? round2(tech.atrPct) : 'n/a'}%. It is ${Math.abs(tech.drawdownFromHigh)}% below its 1-year high. About ${tech.avgVol20 > 0 ? `${Math.round(tech.avgVol20).toLocaleString()} shares` : 'not enough shares'} are traded daily.`,
  };

  const result = {
    symbol: sym,
    ok: true,
    companyName: tech.quote?.companyName ?? tech.quote?.symbol ?? sym,
    price: tech.price,
    quote: tech.quote ?? null,
    finalSignal: signal,
    overallScore: overall,
    confidence,
    flags,
    factorScores: {
      news: newsResult.score,
      technical: techScore,
      fundamentals: fundResult.score,
      valuation: valResult.score,
      market: Math.round(marketScore),
      risk: riskScore,
    },
    scores: {
      news: newsResult.score,
      technical: techScore,
      fundamentals: fundResult.score,
      valuation: valResult.score,
      market: Math.round(marketScore),
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
    },
    technical: {
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
      note: valResult.available
        ? `P/E ${valResult.pe} compared against a rough NSE fair-value band (15–25).`
        : 'Valuation data not available from current sources.',
    },
    market: {
      regime: market.regime,
      relativeStrength: market.relativeStrength,
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

  result.oneLiner = oneLineExplanation(result);
  result.simpleNote = simpleLanguageNote(result);

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
  lines.push(`FINAL SIGNAL: ${result.finalSignal}${result.flags.length ? ` (${result.flags.join(', ')})` : ''}`);
  lines.push(`OVERALL SCORE: ${result.overallScore}`);
  lines.push(`CONFIDENCE: ${result.confidence}`);
  lines.push('');
  lines.push('SCORES:');
  lines.push(`📰 News: ${s.news}/100`);
  lines.push(`📈 Price action: ${s.technical}/100`);
  lines.push(`💰 Company health: ${s.fundamentals}/100`);
  lines.push(`💵 Price vs value: ${s.valuation}/100`);
  lines.push(`📊 Market mood: ${s.market}/100`);
  lines.push(`⚠️ Safety: ${s.risk}/100`);
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
  if (!n.available) lines.push('- News unavailable — sentiment scored neutral.');
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
  const driver = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  const driverNames = { news: 'news', technical: 'price action', fundamentals: 'company health', valuation: 'price vs value', market: 'market mood', risk: 'safety' };
  const trend = result.technical.trend === 'Bullish' ? 'uptrend' : result.technical.trend === 'Bearish' ? 'downtrend' : 'range-bound';
  const trendPhrase = trend === 'range-bound' ? 'a range' : trend === 'uptrend' ? 'an uptrend' : 'a downtrend';
  return `${result.finalSignal} (score ${result.overallScore}) — the strongest factor is ${driverNames[driver[0]]} at ${driver[1]}/100. Price is in ${trendPhrase}, buying pressure ${result.technical.rsi != null ? `${result.technical.rsi}/100` : 'n/a'}.${result.flags.length ? ' Flags: ' + result.flags.join(', ') + '.' : ''}`;
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

export function simpleLanguageNote(result) {
  const name = result.companyName || result.symbol || 'This stock';
  const signal = result.finalSignal;
  const trend = result.technical?.trend ?? 'Range';
  const entry = result.entry ?? {};
  const stop = entry.stopLoss;
  const topPositive = result.positiveFactors?.[0];
  const topNegative = result.negativeFactors?.[0];

  const buyish = signal === 'STRONG BUY' || signal === 'BUY';
  const dip = signal === 'BUY ON DIP';
  const avoid = signal === 'AVOID' || signal === 'STRONG AVOID';

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

  return `Plain talk — ${name}: ${verdict} ${reason} ${action}`;
}