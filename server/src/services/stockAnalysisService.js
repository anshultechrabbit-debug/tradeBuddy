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
import { recordIntradayPrediction } from './intradayPredictionTimeline.js';
import { buildMultiTimeframePredictions } from './multiTimeframePredictionEngine.js';
import { validateAnalysis } from './outputValidator.js';
import { round2 } from '../utils/helpers.js';
import { isPastClose, isMarketOpen, dayKey } from './officialClose.js';
import { recordFromAnalysis } from './predictionTracker.js';

// ---------------------------------------------------------------------------
// Data gathering (each block degrades gracefully)
// ---------------------------------------------------------------------------

export async function gatherTechnical(provider, symbol) {
  // Independent fetches — used to run one after the other, doubling the
  // wait on every analyzeStock() call (which itself is the slowest step
  // in most /ai callers, e.g. AI Picks and /ai/ask's per-symbol lookups).
  const [q, candlesResult] = await Promise.all([
    provider.getQuote(symbol, 'NSE').catch(() => null),
    provider.getCandles(symbol, '1d', 280, 'NSE').catch(() => []),
  ]);
  const fetchedCandles = candlesResult ?? [];
  if (!fetchedCandles.length && !q) return { ok: false };

  const fetchedCloses = fetchedCandles.map((c) => Number(c.close)).filter(Number.isFinite);
  if (!fetchedCloses.length) return { ok: false };

  // The provider flags candles `stale: true` ONLY when the fetch itself
  // failed and it fell back to old cached data (see
  // RealDevelopmentMarketDataProvider.getCandles) — that flag stays false
  // when the fetch "succeeds" but the underlying series simply hasn't been
  // synced past a few days ago. In practice this is the free NSE archive
  // source (jugaad/nselib) itself lagging its own live-quote feed by one or
  // more real sessions — confirmed by calling the adapter directly and
  // seeing the same cutoff — not a caching bug in this app.
  //
  // Directly catch that case: the live quote's own `prevClose` is what the
  // market really closed at last session. If the last daily candle's close
  // doesn't match it (beyond normal rounding), the candle series is missing
  // at least one real session the quote already knows about.
  const lastCandleClose = fetchedCloses[fetchedCloses.length - 1];
  const quotePrevClose = q?.prevClose != null ? Number(q.prevClose) : null;
  const candleSeriesLagsQuote =
    quotePrevClose != null &&
    Number.isFinite(quotePrevClose) &&
    lastCandleClose > 0 &&
    Math.abs(quotePrevClose - lastCandleClose) / lastCandleClose > 0.003;

  // Bridge the gap with data we DO have, instead of leaving every indicator
  // computed on a price level that's several sessions stale. We can't
  // reconstruct the real day-by-day OHLCV for whatever sessions the archive
  // is missing (that data simply isn't available from this source), but we
  // do have two real anchors: the live quote's own `prevClose` (last
  // session's real close, wherever it landed) and today's live OHLC
  // (open/high/low/lastPrice — genuinely observed, not synthetic). One
  // bridge candle spans the unknown gap at the correct price level; one
  // real candle represents today. Volume for the bridge candle is
  // unknowable, so it borrows the last archived day's volume as a neutral
  // placeholder rather than a distorting zero. This still gets flagged
  // stale below — it's the best available approximation, not verified data.
  let candles = fetchedCandles;
  let candlesBridged = false;
  if (candleSeriesLagsQuote && quotePrevClose != null && q?.open != null && q?.lastPrice != null) {
    const lastReal = fetchedCandles[fetchedCandles.length - 1];
    const bridge = {
      date: new Date((lastReal?.date ? new Date(lastReal.date).getTime() : Date.now() - 172800000) + 86400000),
      open: lastCandleClose,
      high: Math.max(lastCandleClose, quotePrevClose),
      low: Math.min(lastCandleClose, quotePrevClose),
      close: quotePrevClose,
      volume: Number(lastReal?.volume) || 0,
      bridged: true,
    };
    const today = {
      date: new Date(),
      open: Number(q.open),
      high: Number(q.high ?? Math.max(q.open, q.lastPrice)),
      low: Number(q.low ?? Math.min(q.open, q.lastPrice)),
      close: Number(q.lastPrice),
      volume: Number(q.volume) || 0,
      bridged: true,
    };
    candles = [...fetchedCandles, bridge, today];
    candlesBridged = true;
  }
  const closes = candles.map((c) => Number(c.close)).filter(Number.isFinite);

  // Every indicator below is computed from `candles`/`closes` above. A gap
  // we could NOT bridge (no live quote OHLC to anchor it) is genuinely
  // stale — every reading from it is unreliable, and downstream BUY gates
  // must treat it that way. A gap we DID bridge is different: the close
  // prices at both ends (last archived close → quote's real prevClose →
  // today's real live close) are verified, real numbers — only the
  // intraday shape and volume *within* the bridge candle are estimated.
  // That's meaningfully better than stale, so it does NOT trip the same
  // "block BUY" gate; it's surfaced instead via `bridged` (see
  // predictionEngine.js's dataQualityReasons) as a lighter-weight caveat.
  const candlesStale =
    (fetchedCandles.length > 0 && fetchedCandles[fetchedCandles.length - 1]?.stale === true) ||
    (candleSeriesLagsQuote && !candlesBridged);

  const price = q?.lastPrice ?? closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s100 = sma(closes, 100);
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
  const vol50 = candles.slice(-50).map((c) => Number(c.volume) || 0);
  const avgVol50 = vol50.length >= 50 ? vol50.reduce((a, b) => a + b, 0) / vol50.length : null;
  const lastVol = Number(candles[candles.length - 1].volume) || 0;
  const volRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;
  const volumeSpike = avgVol20 > 0 && lastVol >= avgVol20 * 2;

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
    candlesBridged,
    s20: s20 == null ? null : round2(s20),
    s50: s50 == null ? null : round2(s50),
    s100: s100 == null ? null : round2(s100),
    s200: s200 == null ? null : round2(s200),
    rsi: rsi14 == null ? null : round2(rsi14),
    macdValue,
    macdSignal,
    atr: atr14 == null ? null : round2(atr14),
    atrPct,
    roc10: roc(closes, 10),
    roc20: roc(closes, 20),
    roc5: roc(closes, 5),
    volRatio: round2(volRatio),
    avgVol20,
    avgVol50,
    volumeSpike,
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

export async function gatherMarket(provider, tech) {
  const out = { ok: false, available: false, partial: false, regime: 'NEUTRAL', niftyRoc20: null, relativeStrength: null, niftyCloses: [], note: '' };
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
    niftyCloses,
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
  // Rich fundamentals now available from yfinance:
  // ROE, ROA, ROIC, profit/operating/gross margins, revenue/earnings growth,
  // debt/equity, current/quick ratios, cash flow, per-share metrics
  if (!f) return { score: null, available: false };

  // Extract key metrics (yfinance returns decimals like 0.15 for 15%)
  const roe = f.roe;           // Return on Equity
  const roa = f.roa;           // Return on Assets
  const roic = f.roic;         // Return on Invested Capital
  const profitMargin = f.profit_margin;
  const operatingMargin = f.operating_margin;
  const grossMargin = f.gross_margin;
  const revenueGrowth = f.revenue_growth;
  const earningsGrowth = f.earnings_growth;
  const debtToEquity = f.debt_to_equity;
  const currentRatio = f.current_ratio;
  const quickRatio = f.quick_ratio;
  const freeCashflow = f.free_cashflow;
  const operatingCashflow = f.operating_cashflow;

  // Check if we have enough data to score
  const hasProfitability = roe != null || roa != null || profitMargin != null || operatingMargin != null;
  const hasGrowth = revenueGrowth != null || earningsGrowth != null;
  const hasHealth = debtToEquity != null || currentRatio != null || freeCashflow != null;

  if (!hasProfitability && !hasGrowth && !hasHealth) {
    return { score: null, available: false };
  }

  let score = 50; // Base score
  const factors = [];

  // --- Profitability (max ±25) ---
  if (roe != null) {
    const roePct = roe * 100; // Convert to percentage
    if (roePct >= 20) { score += 10; factors.push('ROE ≥ 20%'); }
    else if (roePct >= 15) { score += 7; factors.push('ROE ≥ 15%'); }
    else if (roePct >= 10) { score += 4; factors.push('ROE ≥ 10%'); }
    else if (roePct >= 5) { score += 1; }
    else if (roePct < 0) { score -= 10; factors.push('Negative ROE'); }
    else { score -= 5; factors.push('Low ROE'); }
  }

  if (roic != null) {
    const roicPct = roic * 100;
    if (roicPct >= 15) { score += 8; factors.push('ROIC ≥ 15%'); }
    else if (roicPct >= 10) { score += 5; factors.push('ROIC ≥ 10%'); }
    else if (roicPct < 0) { score -= 5; factors.push('Negative ROIC'); }
  } else if (roa != null) {
    const roaPct = roa * 100;
    if (roaPct >= 10) { score += 5; factors.push('ROA ≥ 10%'); }
    else if (roaPct >= 5) { score += 2; }
    else if (roaPct < 0) { score -= 5; factors.push('Negative ROA'); }
  }

  if (profitMargin != null) {
    const pmPct = profitMargin * 100;
    if (pmPct >= 20) { score += 7; factors.push('Profit margin ≥ 20%'); }
    else if (pmPct >= 10) { score += 4; factors.push('Profit margin ≥ 10%'); }
    else if (pmPct >= 5) { score += 1; }
    else if (pmPct < 0) { score -= 8; factors.push('Negative profit margin'); }
  } else if (operatingMargin != null) {
    const omPct = operatingMargin * 100;
    if (omPct >= 20) { score += 5; factors.push('Op margin ≥ 20%'); }
    else if (omPct >= 10) { score += 2; }
    else if (omPct < 0) { score -= 5; factors.push('Negative operating margin'); }
  }

  // --- Growth (max ±15) ---
  if (revenueGrowth != null) {
    const rgPct = revenueGrowth * 100;
    if (rgPct >= 20) { score += 8; factors.push('Revenue growth ≥ 20%'); }
    else if (rgPct >= 10) { score += 5; factors.push('Revenue growth ≥ 10%'); }
    else if (rgPct >= 5) { score += 2; }
    else if (rgPct < 0) { score -= 5; factors.push('Revenue declining'); }
  }

  if (earningsGrowth != null) {
    const egPct = earningsGrowth * 100;
    if (egPct >= 20) { score += 7; factors.push('Earnings growth ≥ 20%'); }
    else if (egPct >= 10) { score += 4; factors.push('Earnings growth ≥ 10%'); }
    else if (egPct < 0) { score -= 4; factors.push('Earnings declining'); }
  }

  // --- Financial Health (max ±20) ---
  if (debtToEquity != null) {
    if (debtToEquity <= 0.3) { score += 8; factors.push('Low debt (D/E ≤ 0.3)'); }
    else if (debtToEquity <= 0.5) { score += 4; factors.push('Moderate debt (D/E ≤ 0.5)'); }
    else if (debtToEquity <= 1) { score += 1; }
    else if (debtToEquity <= 2) { score -= 4; factors.push('High debt (D/E > 1)'); }
    else { score -= 10; factors.push('Very high debt (D/E > 2)'); }
  }

  if (currentRatio != null) {
    if (currentRatio >= 2) { score += 5; factors.push('Current ratio ≥ 2'); }
    else if (currentRatio >= 1.5) { score += 3; factors.push('Current ratio ≥ 1.5'); }
    else if (currentRatio >= 1) { score += 1; }
    else { score -= 5; factors.push('Current ratio < 1 (liquidity risk)'); }
  }

  if (freeCashflow != null && freeCashflow > 0) {
    score += 5; factors.push('Positive free cash flow');
  } else if (freeCashflow != null && freeCashflow < 0) {
    score -= 5; factors.push('Negative free cash flow');
  }

  if (operatingCashflow != null && operatingCashflow > 0) {
    score += 2; factors.push('Positive operating cash flow');
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    available: true,
    factors: factors.slice(0, 5), // Top 5 contributing factors
    metrics: {
      roe: roe != null ? round2(roe * 100) : null,
      roic: roic != null ? round2(roic * 100) : null,
      profitMargin: profitMargin != null ? round2(profitMargin * 100) : null,
      revenueGrowth: revenueGrowth != null ? round2(revenueGrowth * 100) : null,
      earningsGrowth: earningsGrowth != null ? round2(earningsGrowth * 100) : null,
      debtToEquity: debtToEquity != null ? round2(debtToEquity) : null,
      currentRatio: currentRatio != null ? round2(currentRatio) : null,
      freeCashflow: freeCashflow != null ? round2(freeCashflow / 1e7) : null, // in crores
    },
  };
}

// NSE's daily P/E snapshot can be up to 12 days old before the fetch gives
// up (see server/python/market_data.py nselib_fundamentals). Past ~5
// trading days it's stale enough that it shouldn't be treated as identical
// to a same-day read — flagged, not discarded, since it's still the best
// data available.
const VALUATION_STALE_DAYS = 7;

function scoreValuation(f) {
  // Yahoo Finance (the preferred, richer fundamentals source — see
  // getFundamentals in RealDevelopmentMarketDataProvider.js) returns the P/E
  // ratio as `pe_ratio` (see market_data.py); only the secondary NSE-only
  // fallback path uses `pe`/`adjustedPe`. Reading `f.pe` alone meant
  // valuation came back UNKNOWN for nearly every stock whenever the
  // preferred source succeeded — which is most of the time.
  const pe = f?.pe_ratio ?? f?.pe ?? f?.adjustedPe;
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
// Keep Radar and AI Strategy on the same validated verdict for one scan cycle.
// Market quotes continue updating independently; a full seven-factor analysis
// (including news/fundamentals) does not need to be recomputed every 2 seconds.
const ANALYSIS_CACHE_TTL_OK = 60_000;
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

  // dataQuality: how complete and fresh the input data is.
  // NOT a prediction confidence — this measures data coverage only.
  // HIGH = 150+ candles + news + fresh valuation.
  // MEDIUM = 100+ candles + some news.
  // LOW = thin data, stale or missing factors.
  const valuationFresh = valResult.available && !valResult.stale;
  let dataQuality = 'LOW';
  if (tech.closes.length >= 100 && newsResult.articles?.length >= 3) dataQuality = 'MEDIUM';
  if (fundResult.available && valuationFresh && tech.closes.length >= 150 && newsResult.articles?.length >= 3) dataQuality = 'HIGH';

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
      ? (fundResult.metrics
        ? `Company health score: ${fundResult.score}/100. ROE: ${fundResult.metrics.roe ?? 'n/a'}%, ROIC: ${fundResult.metrics.roic ?? 'n/a'}%, Profit Margin: ${fundResult.metrics.profitMargin ?? 'n/a'}%, Revenue Growth: ${fundResult.metrics.revenueGrowth ?? 'n/a'}%, Earnings Growth: ${fundResult.metrics.earningsGrowth ?? 'n/a'}%, Debt/Equity: ${fundResult.metrics.debtToEquity ?? 'n/a'}, Current Ratio: ${fundResult.metrics.currentRatio ?? 'n/a'}. Key factors: ${fundResult.factors?.join('; ') || 'n/a'}.`
        : `Company health score: ${fundResult.score}/100. Full financial statements, ratios (ROE, ROIC, margins, growth, debt/equity), and analyst estimates from Yahoo Finance.`)
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
    // dataQuality measures input data completeness/freshness — NOT prediction accuracy.
    // Do not display this as "confidence" in the UI.
    dataQuality,
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
      bridged: tech.candlesBridged,
      trend: tech.trend,
      rsi: tech.rsi,
      macd: { value: round2(tech.macdValue), signal: round2(tech.macdSignal) },
      sma20: tech.s20,
      sma50: tech.s50,
      sma100: tech.s100,
      sma200: tech.s200,
      roc10: round2(tech.roc10),
      roc20: round2(tech.roc20),
      roc5: round2(tech.roc5),
      volume: tech.lastVol,
      avgVolume20: tech.avgVol20,
      avgVolume50: tech.avgVol50,
      volumeRatio: tech.volRatio,
      volumeSpike: tech.volumeSpike,
      atr: tech.atr,
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
      pe: fundamentals?.pe_ratio ?? fundamentals?.pe ?? null,
      adjustedPe: fundamentals?.adjustedPe ?? null,
      tradeDate: fundamentals?.tradeDate ?? null,
      roe: fundamentals?.roe ?? null,
      roic: fundamentals?.roic ?? null,
      profitMargin: fundamentals?.profit_margin ?? null,
      operatingMargin: fundamentals?.operating_margin ?? null,
      grossMargin: fundamentals?.gross_margin ?? null,
      revenueGrowth: fundamentals?.revenue_growth ?? null,
      earningsGrowth: fundamentals?.earnings_growth ?? null,
      debtToEquity: fundamentals?.debt_to_equity ?? null,
      currentRatio: fundamentals?.current_ratio ?? null,
      quickRatio: fundamentals?.quick_ratio ?? null,
      freeCashflow: fundamentals?.free_cashflow ?? null,
      operatingCashflow: fundamentals?.operating_cashflow ?? null,
      bookValuePerShare: fundamentals?.book_value_per_share ?? null,
      earningsPerShare: fundamentals?.earnings_per_share ?? null,
      revenuePerShare: fundamentals?.revenue_per_share ?? null,
      dividendYield: fundamentals?.dividend_yield ?? null,
      dividendRate: fundamentals?.dividend_rate ?? null,
      payoutRatio: fundamentals?.payout_ratio ?? null,
      targetMeanPrice: fundamentals?.target_mean_price ?? null,
      recommendation: fundamentals?.recommendation ?? null,
      note: fundResult.available
        ? (fundResult.metrics
          ? `Company health scored ${fundResult.score}/100 based on: ${fundResult.metrics.roe != null ? `ROE ${fundResult.metrics.roe}%` : ''}${fundResult.metrics.profitMargin != null ? `, Profit Margin ${fundResult.metrics.profitMargin}%` : ''}${fundResult.metrics.revenueGrowth != null ? `, Rev Growth ${fundResult.metrics.revenueGrowth}%` : ''}${fundResult.metrics.debtToEquity != null ? `, D/E ${fundResult.metrics.debtToEquity}` : ''}${fundResult.metrics.currentRatio != null ? `, Current Ratio ${fundResult.metrics.currentRatio}` : ''}. ${fundResult.factors?.join('; ') || ''}.`
          : 'Full financial statements, ratios (ROE, margins, growth, debt/equity), and analyst estimates available from Yahoo Finance.')
        : 'Fundamentals data not available from current sources.',
    },
    valuation: {
      available: valResult.available,
      score: valResult.score ?? null,
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
    // Raw price / candle series for the engine's linReg & vwmaClose projection,
    // plus the Nifty closes series for the beta/correlation diagnostic.
    // NOT published in the API response — engine-internal only.
    _closes: tech.closes,
    _candles: tech.candles,
    _niftyCloses: market.niftyCloses ?? [],
    disclaimer:
      'This is an algorithmic research signal using live market data and news, not a guaranteed prediction of future price movement.',
  };

  // Spec-compliant prediction engine: 0-100 weighted score (renormalised over
  // known factors — UNKNOWN factors are excluded, never treated as neutral),
  // classification, BUY discipline gates, trade plan and closing-range
  // forecast. This is the SINGLE authority for the published overall score
  // and signal — nothing above this line is user-facing yet.
  result.engine = buildEngineResult(result);
  result.engineWhy = buildWhySection(result);
  result.overallScore = result.engine.totalScore;
  result.finalSignal = result.engine.signal;
  // Was never set here, so every symbol's top-level confidence silently
  // fell back to the client's hardcoded 'LOW' default forever — the engine
  // computed a real evidence-quality label but nothing published it. Mirror
  // it up the same way overallScore/finalSignal are, right after the engine
  // runs, so the top-level field and engine.closingRange.confidence (which
  // reads this same value) can never disagree.
  result.confidence = result.engine.confidenceLabel;

  // NOTE: this used to also compute result.nextClosePrediction via a second,
  // fully independent price-prediction model (nextClosePredictionModel.js) —
  // same input price as the engine above, completely different math, so it
  // could (and did) produce a different "predicted close" for the same
  // stock at the same instant. It was never read by any client or route —
  // dead compute shipped in every /ai/analyze response as a landmine for
  // any future code that reached into it expecting a second opinion. Removed
  // from the live pipeline; the module itself stays for its own tests and
  // for predictionEngineV3.js's offline backtesting, where a second model
  // being compared against the live one is the point.
  result.intradayPrediction = recordIntradayPrediction(result);
  result.multiTimeframePredictions = buildMultiTimeframePredictions(result);

  // Auto-record morning baseline snapshot if during market hours and not yet recorded today
  const today = dayKey();
  if (isMarketOpen()) {
    recordFromAnalysis(result, today);
  }

  // NOTE: this used to also attach a `result.morningBaseline` (single frozen
  // morning snapshot + a locally-derived ON_TRACK/PULLBACK/INVALIDATED
  // trajectory read). Removed — `result.intradayPrediction` above already
  // covers the same need with a real, versioned, multi-checkpoint timeline
  // and material-change detection (intradayPredictionTimeline.js), so the
  // two were duplicating one concept with the timeline strictly more
  // capable. The `getPredictions()`-backed snapshot recorded just above is
  // still used — predictionTracker.js's EOD accuracy grading/stats
  // (allStats/weeklyStats/evaluatePredictions) still read it — only this
  // redundant UI-facing re-derivation was removed.

  // Canonical intraday prediction numbers: prefer the recorded/versioned
  // snapshot (intradayPredictionTimeline.js) over the raw engine output.
  // Both start out equal at generation time, but engine.closingRange keeps
  // recomputing fresh on every analyzeStock() call — its ATR projection is
  // scaled by remaining-session-progress, so once the market closes
  // (isMarketOpen() flips false) it produces a materially different number
  // than what was last recorded while the market was still open.
  // recordIntradayPrediction() correctly freezes the snapshot at that point
  // (so "the current prediction" doesn't keep silently changing after
  // hours); without reading it here too, the numeric top-level fields kept
  // drifting from the frozen prediction shown in the timeline/prediction
  // card, showing two different "predicted close" values for what looked
  // like the same prediction.
  // Within an open session, latestObservation is a lighter-weight refresh
  // of price/predictedClose/expectedReturnPct that doesn't create a new
  // timeline version (see intradayPredictionTimeline.js) — prefer it over
  // the version's own (slightly older) fields when present, since it's
  // recorded as one matched set (predictedClose alongside its own
  // expectedReturnPct, not mixed with a stale one) and it's the exact same
  // value the client's prediction-card header displays.
  const intradaySnapshotForClose = result.intradayPrediction?.current ?? result.intradayPrediction?.latest ?? null;
  const intradayObservation = intradaySnapshotForClose?.latestObservation;
  result.expectedClose = intradayObservation?.predictedClose ?? intradaySnapshotForClose?.predictedClose ?? result.engine.closingRange?.base ?? null;
  result.expectedPct = intradayObservation?.expectedReturnPct ?? intradaySnapshotForClose?.expectedReturnPct ?? result.engine.closingRange?.expectedMovePct ?? null;

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
  lines.push(`DATA QUALITY (input completeness, NOT prediction accuracy): ${result.dataQuality}`);
  lines.push(`EVIDENCE QUALITY SCORE: ${result.engine?.evidenceQualityScore ?? 'n/a'}/100 — measures data freshness/coverage, not forecast reliability`);
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

// Plain-English phrase for each raw internal flag — never show the raw
// ALL-CAPS code (e.g. "PRICE RAN UP FAST") in a sentence a user reads.
const FLAG_PHRASES = {
  'PRICE RAN UP FAST': 'the price has climbed quickly lately, so it may be due for a pause',
  'WEAK MARKET': 'the broader market is weak right now, which adds risk for every stock',
  'LIMITED COMPANY DATA': "we don't have much financial data on this company yet",
  'STALE VALUATION DATA': 'our value-for-money read on this stock is a bit outdated',
  EXPENSIVE: 'the stock looks expensive relative to its earnings',
};
function humanizeFlag(flag) {
  return FLAG_PHRASES[flag] ?? flag.toLowerCase();
}

const SIGNAL_PHRASES = {
  'STRONG BUY': "this looks like a strong buying opportunity",
  BUY: 'this looks like a good buying opportunity',
  WATCH: "this is worth keeping an eye on, but it's not quite ready to act on yet",
  AVOID: "we'd steer clear of this one for now",
  'NO TRADE': "the evidence doesn't clearly support a trade either way right now",
  HOLD: "if you already own it, there's no strong reason to change that; not a fresh buy",
};

export function oneLineExplanation(result) {
  const s = result.scores;
  const known = Object.entries(s).filter(([, v]) => v != null);
  const driver = known.length ? known.sort((a, b) => b[1] - a[1])[0] : null;
  const driverNames = { news: 'recent news', technical: 'the price action', fundamentals: "the company's financial health", valuation: 'how the price compares to value', market: 'the overall market mood', risk: 'how safe it looks' };
  const trendPhrase = result.technical.trend === 'Bullish' ? 'moving up' : result.technical.trend === 'Bearish' ? 'moving down' : 'moving sideways';
  const driverText = driver ? `mainly because of ${driverNames[driver[0]] ?? driver[0]}` : "though we don't have enough reliable data yet to point to one clear reason";
  const signalPhrase = SIGNAL_PHRASES[result.finalSignal] ?? result.finalSignal.toLowerCase();
  const flagSentence = result.flags.length
    ? ` Worth knowing: ${result.flags.map(humanizeFlag).join('; ')}.`
    : '';
  return `Our take: ${signalPhrase}, ${driverText}. The price has been ${trendPhrase} recently.${flagSentence}`;
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
    const n = result.news?.overall && !['Neutral', 'Unknown'].includes(result.news.overall)
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

  // Forward-looking UNVALIDATED model estimate.
  // Clearly labelled: this is an algorithmic projection from EOD candle data,
  // not a backtested, calibrated, or proven forecast. The range is an
  // indication of where price has historically moved given similar setups —
  // it is NOT a reliable predictor of the exact close price.
  let prediction = '';
  const marketRegime = result.market?.regime ?? 'NEUTRAL';
  // NOTE: result.technical is the display-formatted object (see the
  // `technical:` block in computeAnalysis), which renames
  // primaryResistance/primarySupport to resistance/support — the old
  // primaryResistance/primarySupport names here meant `resistance` was
  // always undefined and this branch's "upside to resistance" text never
  // actually fired.
  const resistance = result.technical?.resistance;
  const support = result.technical?.support;
  const entryMid = (Number(entry.zoneLow) + Number(entry.zoneHigh)) / 2;

  const sessionOver = isPastClose();
  const realizedPct = result.quote?.changePct;

  // Read the same recorded/frozen intraday snapshot every other prediction
  // display uses (see result.expectedClose/expectedPct above), not the raw
  // engine output directly. engine.closingRange keeps recomputing on every
  // call — its ATR projection is session-progress-scaled, so it produces a
  // materially different number once the market closes than what was last
  // recorded intraday. Without this, this plain-language note could quote
  // an expected range that disagreed with the numeric prediction cards and
  // the timeline shown elsewhere on the same page for the same prediction.
  const intradaySnapshot = result.intradayPrediction?.current ?? result.intradayPrediction?.latest ?? null;
  const intradayObs = intradaySnapshot?.latestObservation;
  const cr = result.engine?.closingRange ?? {};
  const expPct = intradayObs?.expectedReturnPct ?? intradaySnapshot?.expectedReturnPct ?? cr.expectedMovePct;
  const bear = (intradayObs?.targetZone ?? intradaySnapshot?.targetZone)?.[0] ?? cr.bear;
  const bull = (intradayObs?.targetZone ?? intradaySnapshot?.targetZone)?.[1] ?? cr.bull;

  const nifty = result.market?.niftyLevel;
  const marketWord = marketRegime === 'BULLISH' ? 'market looks like it will rise'
    : marketRegime === 'BEARISH' ? 'market looks weak'
      : 'market looks flat';
  const marketPrice = nifty != null ? ` (Nifty ${inrShort(nifty)})` : '';
  const priceLead = sessionOver ? "Today's close for" : 'Right now';
  const realizedText = sessionOver && realizedPct != null ? ` (${realizedPct >= 0 ? '+' : ''}${realizedPct}% for the day)` : '';
  const livePrice = price != null ? ` ${priceLead} ${name} is ${inrShort(price)}${realizedText},` : '';

  // Range text: clearly framed with Support and Target boundaries
  let expText = '';
  if (bear == null || bull == null) {
    expText = ' direction unclear from available data';
  } else if (buyish || dip) {
    const upsidePct = price > 0 && bull > price ? ((bull - price) / price) * 100 : Math.abs(expPct || 2.0);
    expText = ` the model projects an expected trading range of ${inrShort(bear)} (support floor) to ${inrShort(bull)} (upside target, ~+${upsidePct.toFixed(1)}%).`;
  } else if (avoid) {
    const downsidePct = price > 0 && bear < price ? ((price - bear) / price) * 100 : Math.abs(expPct || 2.0);
    expText = ` the model projects an expected range of ${inrShort(bear)} (downside risk, ~-${downsidePct.toFixed(1)}%) to ${inrShort(bull)}.`;
  } else {
    expText = ` the model projects an expected range between ${inrShort(bear)} and ${inrShort(bull)}.`;
  }

  if (buyish || dip) {
    if (resistance != null && entryMid > 0) {
      const upside = ((Number(resistance) - entryMid) / entryMid) * 100;
      prediction = ` Model estimate:${livePrice} ${marketWord}${marketPrice}, and ${name} is in an uptrend, so${expText} If you buy near ${inrShort(entryMid)}, the resistance level is ${inrShort(resistance)} (~${upside >= 0 ? '+' : ''}${upside.toFixed(0)}% away). Sell if it falls below ${inrShort(stop)}.`;
    } else {
      prediction = ` Model estimate:${livePrice} ${marketWord}${marketPrice}, and ${name} is in an uptrend, so${expText} Plan: buy near ${inrShort(entry.zoneLow)}–${inrShort(entry.zoneHigh)}, sell if below ${inrShort(stop)}.`;
    }
  } else if (avoid) {
    prediction = ` Model estimate:${livePrice} ${marketWord}${marketPrice}, and the trend is down, so${expText} Better not to buy — if you already hold, exit if it falls below ${inrShort(stop)}.`;
  } else {
    prediction = ` Model estimate:${livePrice} ${marketWord}${marketPrice}, no clear move expected so${expText} Just watch for now.`;
  }

  return `Plain talk — ${name}: ${verdict} ${reason} ${action}${priceNote}${prediction}`;
}

