import { round2 } from '../utils/helpers.js';
import {
  clamp,
  linReg,
  vwmaClose,
  ema,
  stochastic,
  cci,
  williamsR,
  adxDmi,
  bollingerBands,
  keltnerChannels,
  historicalVolatilityPct,
  obv,
  cmf,
  mfi,
  supertrend,
  parabolicSar,
  ichimoku,
  previousDayLevels,
  gapPct,
  swingStructure,
  candlestickPattern,
  betaAndCorrelation,
} from './radar/indicators.js';
import { isMarketOpen, isPastClose } from './officialClose.js';

const MODEL_VERSION = 'tradebuddy-engine-1.1';

function num(v, d = null) {
  if (v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// --- Score → candidate label (score alone never creates a trade) ---
function classify(score) {
  if (score >= 80) return 'STRONG BUY CANDIDATE';
  if (score >= 70) return 'BUY CANDIDATE';
  if (score >= 60) return 'WATCH / BUY ON CONFIRMATION';
  if (score >= 45) return 'HOLD / NO TRADE';
  if (score >= 30) return 'AVOID / SELL BIAS';
  return 'STRONG AVOID';
}

// `dataSource` is a provider-level constant (e.g. every quote from the real
// external provider says 'live', whether it's a genuine live tick, a stale
// cache hit, or — before this fix — a fabricated price). The fields that
// actually vary per-quote are `source` (real vendor: jugaad/nselib/
// nse-archives/development) and `stale`/`generated`. Those are what must be
// inspected to tell real, live, cached and synthetic data apart.
const SYNTHETIC_SOURCE_RE = /synthetic|mock|demo|fake|test|development/i;

function dataStatusFrom(a) {
  const q = a.quote;
  if (!q) return 'UNKNOWN';
  const source = q.source ?? q.dataSource;
  if (!source) return 'UNKNOWN';
  if (q.generated === true || SYNTHETIC_SOURCE_RE.test(String(source))) return 'UNKNOWN';
  // Either the quote itself or the candle series behind the indicators can be
  // served stale independently — either one means the picture isn't current.
  if (q.stale === true || a.technical?.stale === true) return 'STALE';
  // We cannot guarantee real-time here; treat a real, fresh provider read as delayed at best.
  return 'VERIFIED DELAYED';
}

function normKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 8)
    .join(' ');
}

function isPriceAction(title) {
  const t = String(title).toLowerCase();
  if (/(results|earnings|profit|loss|dividend|order|contract|deal|sebi|rbi|merger|buyback|guidance|q[1-4]|filing|announces|appoints|board|acquisition)/.test(t)) {
    return false;
  }
  return /(rises?|falls?|gains?|loses?|rose|fell|surges?|slumps?|jumps?|drops?|climbs?|slides?|up \d|down \d|near 52|52-week|hits|touches|moves|trades higher|trades lower|\d+\s?%)/.test(t);
}

export function dedupeArticles(articles) {
  const groups = new Map();
  for (const art of articles ?? []) {
    const key = normKey(art.title || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(art);
  }
  const unique = [...groups.values()].map((g) => g[0]);
  const material = unique.filter((a) => !isPriceAction(a.title || ''));
  return {
    unique,
    material,
    independentEvents: unique.length,
    materialEvents: material.length,
  };
}

// Weights for the overall multi-factor research/trading score (unchanged
// from tradebuddy-engine-1.0). This score answers "how good is this stock
// as a trade candidate overall", blending in slower-moving factors
// (fundamentals/valuation) alongside price action — it is NOT the same
// thing as directionalScore below, which answers "which way is the price
// more likely to move this session" and deliberately excludes fundamentals.
// volatility/priceAction added (2026-09) to bring Bollinger/Keltner/ATR% and
// breakout/gap/candlestick/swing-structure evidence into the score as their
// own categories instead of burying them inside unrelated ones — existing
// weights were scaled down proportionally to make room, sum stays 100.
const WEIGHTS = {
  momentum: 22,
  trend: 17,
  volume: 12,
  volatility: 8,
  priceAction: 10,
  relStrength: 8,
  news: 8,
  fundamentals: 8,
  market: 7,
};

// Weights for the SHORT-TERM DIRECTIONAL score. Fundamentals/valuation move
// on a scale of quarters, not sessions, so they are deliberately excluded
// here — a cheap stock in a strong downtrend is still going down today.
// roc5 (5-day momentum) is the most recent EOD signal available and carries
// more weight than roc20 for same-session direction.
// priceAction included here (it IS a same-session direction signal —
// breakout/breakdown, gap, candlestick bias). volatility deliberately stays
// OUT of directional: it measures how big a move might be, not which way,
// same reasoning already used to exclude fundamentals/news from direction.
const DIRECTIONAL_WEIGHTS = {
  momentum: 20,
  trend: 15,
  volume: 10,
  relStrength: 7,
  market: 10,
  roc5: 4,
  priceAction: 14,
  intraday: 15,
  // Evidence-derived (see the "Extreme-move fade" comment above `fadeScore`)
  // — kept deliberately small pending validation on a broader dataset.
  fade: 5,
};

// Below this, an EXECUTABLE BUY is never allowed regardless of how good the
// score looks — see buildEngineResult's gates section and spec §7/§9.
const MIN_EVIDENCE_QUALITY_FOR_BUY = 65;
// Below this, the directional/momentum categories must agree even more
// strongly than the base 4-of-6 bar before a trade is allowed through.
const MIN_EVIDENCE_QUALITY_FOR_NORMAL_GATING = 75;

/** Fraction of today's NSE cash session already elapsed (0 at 09:15, 1 at 15:30). */
export function nseSessionProgress(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const mins = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) * 60
    + Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return clamp((mins - (9 * 60 + 15)) / (6 * 60 + 15), 0, 1);
}

/**
 * EOD point forecast anchored to the latest traded price. Historical daily
 * trend matters most early in the session; late in the day, the live price is
 * objectively the stronger close estimate. This also exposes the weights for
 * deterministic regression tests and UI diagnostics.
 */
export function blendEodProjection(price, regressionPrice, vwmaPrice, sessionProgress = 0) {
  if (!Number.isFinite(price) || price <= 0) return { projected: null, liveWeight: 0, historicalWeight: 0 };
  const historical = Number.isFinite(regressionPrice) && Number.isFinite(vwmaPrice)
    ? regressionPrice * 0.6 + vwmaPrice * 0.4
    : Number.isFinite(regressionPrice) ? regressionPrice
      : Number.isFinite(vwmaPrice) ? vwmaPrice : price;
  const progress = clamp(Number(sessionProgress) || 0, 0, 1);
  const liveWeight = clamp(0.70 + 0.28 * progress, 0.70, 0.98);
  return {
    projected: price * liveWeight + historical * (1 - liveWeight),
    liveWeight,
    historicalWeight: 1 - liveWeight,
  };
}

export function buildEngineResult(a) {
  const t = a.technical ?? {};
  const n = a.news ?? {};
  const v = a.valuation ?? {};
  const m = a.market ?? {};
  const e = a.entry ?? {};
  const quote = a.quote ?? {};
  const price = num(a.price);
  const unknown = [];

  // Full OHLCV history + Nifty closes, when the caller provided them (see
  // stockAnalysisService.js's _candles/_closes/_niftyCloses) — same series
  // already used below for the linReg/vwmaClose closing-range projection.
  // Every new indicator computed from these degrades to null/skipped on
  // short or missing history rather than fabricating a reading.
  const candles = Array.isArray(a._candles) ? a._candles : [];
  const closesArr = Array.isArray(a._closes) ? a._closes : [];
  const niftyClosesArr = Array.isArray(a._niftyCloses) ? a._niftyCloses : [];

  const stoch = candles.length ? stochastic(candles) : null;
  const cciVal = candles.length ? cci(candles) : null;
  const wprVal = candles.length ? williamsR(candles) : null;
  const adx = candles.length ? adxDmi(candles) : null;
  const superT = candles.length ? supertrend(candles) : null;
  const psar = candles.length ? parabolicSar(candles) : null;
  const cloud = candles.length ? ichimoku(candles) : null;
  const emaStack = closesArr.length
    ? { e9: ema(closesArr, 9), e20: ema(closesArr, 20), e50: ema(closesArr, 50), e100: ema(closesArr, 100), e200: ema(closesArr, 200) }
    : null;
  const obvRead = candles.length ? obv(candles) : null;
  const cmfVal = candles.length ? cmf(candles) : null;
  const mfiVal = candles.length ? mfi(candles) : null;
  const bb = closesArr.length ? bollingerBands(closesArr) : null;
  const kc = candles.length ? keltnerChannels(candles) : null;
  const histVol = closesArr.length ? historicalVolatilityPct(closesArr) : null;
  const prevDay = candles.length ? previousDayLevels(candles) : null;
  const gap = prevDay != null ? gapPct(quote.open, prevDay.prevClose) : null;
  const swing = candles.length ? swingStructure(candles) : null;
  const candlePattern = candles.length ? candlestickPattern(candles) : null;
  // Prior 20 days, EXCLUDING today's own candle — a breakout compares
  // today's price against where price already was, not against today's own
  // high (which is virtually always ≥ today's close, making a same-day
  // "breakout" against a window that includes today mathematically near-
  // impossible).
  const high20FromCandles = candles.length >= 21
    ? Math.max(...candles.slice(-21, -1).map((c) => Number(c.high)))
    : null;
  const low20FromCandles = candles.length >= 21
    ? Math.min(...candles.slice(-21, -1).map((c) => Number(c.low)))
    : null;
  const betaCorr = closesArr.length && niftyClosesArr.length ? betaAndCorrelation(closesArr, niftyClosesArr) : null;
  // VWAP proxy (volume-weighted mean close, last 20 candles) — "where has
  // price actually spent its traded volume" vs the live price.
  const vwapProxy = candles.length >= 3 ? vwmaClose(candles, 20) : null;
  const vwapDeviationPct = vwapProxy != null && price != null
    ? ((price - vwapProxy) / vwapProxy) * 100
    : null;

  // Day-level price direction — the same field used everywhere else in the
  // app for "day change" (quote.changePct, e.g. the price-row % next to the
  // ticker). Needed below to tell whether volume is confirming a move UP or
  // DOWN, not just "a lot of shares traded" (see §1).
  const dayChangePct = num(quote.changePct);

  // ---- 1) Technical momentum (25) ----
  // RSI bands: a very high RSI is exhaustion risk, not automatically
  // "strongly bullish" — a stock at RSI 85 is statistically more likely to
  // cool off than one sitting at a healthy 58. MACD/ROC keep their existing
  // simple bullish/bearish read; they are correlated with RSI (all three are
  // momentum measurements), which is why the CONFIRMATION-CATEGORY logic
  // further down treats "momentum" as a single category rather than letting
  // RSI+MACD+ROC each count as independent evidence.
  let momentum = 50;
  const rsi = num(t.rsi);
  const macd = t.macd ?? {};
  const macdV = num(macd.value);
  const macdS = num(macd.signal);
  const roc20 = num(t.roc20);
  if (rsi != null) {
    if (rsi >= 52 && rsi <= 65) momentum += 22; // strong positive momentum
    else if (rsi > 65 && rsi <= 72) momentum += 12; // positive but increasingly stretched
    else if (rsi > 72 && rsi <= 78) momentum += 4; // weak positive / caution
    else if (rsi > 78) momentum -= 8; // possible exhaustion — not a strength
    else if (rsi >= 45 && rsi < 52) momentum += 8; // neutral / slightly positive
    else if (rsi >= 35 && rsi < 45) momentum -= 10; // bearish
    else momentum -= 22; // < 35: strongly bearish / oversold
  } else unknown.push('momentum(rsi)');
  if (macdV != null && macdS != null) momentum += macdV > macdS ? 15 : -15;
  else unknown.push('momentum(macd)');
  if (roc20 != null) momentum += roc20 > 0 ? 15 : -15;
  // Stochastic/CCI/Williams %R — same-family momentum confirmations as RSI,
  // each a bounded nudge so no single extra oscillator can swamp the read.
  if (stoch?.k != null) {
    if (stoch.d != null) momentum += stoch.k > stoch.d ? (stoch.k > 80 ? 4 : 8) : (stoch.k < 20 ? -4 : -8);
  }
  if (cciVal != null) momentum += clamp(cciVal / 15, -8, 8);
  if (wprVal != null) momentum += clamp((wprVal + 50) / 6.25, -8, 8); // -100..0 → -8..8
  momentum = clamp(Math.round(momentum), 0, 100);

  // ---- 2) Trend (17) ----
  let trend = 50;
  const s20 = num(t.sma20);
  const s50 = num(t.sma50);
  const s100 = num(t.sma100);
  const s200 = num(t.sma200);
  const tr = t.trend;
  if (tr === 'Bullish') trend += 25;
  else if (tr === 'Bearish') trend -= 25;
  if (price != null) {
    if (s50 != null) trend += price > s50 ? 8 : -8;
    if (s200 != null) trend += price > s200 ? 8 : -8;
  }
  if (s20 != null && s50 != null) trend += s20 > s50 ? 9 : -9;
  if (s50 != null && s100 != null) trend += s50 > s100 ? 5 : -5;
  // EMA9/20/50/100/200 stack alignment — fully bullish stack (each shorter
  // EMA above the next) or fully bearish (reversed) is stronger evidence
  // than a partial alignment; each confirms the SMA-based trend read above.
  if (emaStack?.e9 != null && emaStack.e20 != null && emaStack.e50 != null && emaStack.e100 != null && emaStack.e200 != null) {
    const { e9, e20, e50, e100, e200 } = emaStack;
    const upSteps = [e9 > e20, e20 > e50, e50 > e100, e100 > e200].filter(Boolean).length;
    trend += (upSteps - 2) * 4; // 4 steps up → +8, 0 steps up (fully reversed) → -8
  }
  // ADX/DMI — only sways the read when ADX shows an actual trend (>20); a
  // flat/choppy market (low ADX) leaves the SMA-based trend read untouched.
  if (adx?.adx != null && adx.adx > 20 && adx.plusDI != null && adx.minusDI != null) {
    const strength = adx.adx > 35 ? 8 : 5;
    trend += adx.plusDI > adx.minusDI ? strength : -strength;
  }
  // Supertrend / Parabolic SAR / Ichimoku cloud — independent trend-following
  // confirmations, each a small bounded nudge.
  if (superT?.direction) trend += superT.direction === 'up' ? 6 : -6;
  if (psar?.direction) trend += psar.direction === 'up' ? 5 : -5;
  if (cloud?.cloudPosition && cloud.cloudPosition !== 'inside') trend += cloud.cloudPosition === 'above' ? 6 : -6;
  trend = clamp(Math.round(trend), 0, 100);

  // ---- 3) Volume / price confirmation (12) ----
  // High volume is not inherently bullish — it AMPLIFIES whatever direction
  // the price actually moved on that volume. High volume on a day the stock
  // fell is bearish confirmation, not a reason to buy (see §1, §10). Low
  // volume gets only weak confirmation either way, never an automatic
  // bearish penalty (a quiet day isn't evidence of weakness by itself).
  // ATR% moved OUT of this category (now scores `volatility` exclusively,
  // see below) — it was a risk/magnitude read, not volume confirmation, and
  // scoring it in both places would have double-counted the same input.
  let vol = 50;
  const volRatio = num(t.volumeRatio);
  const atrPct = num(t.atrPct);
  const avgVol = num(t.avgVolume20);
  if (volRatio != null && dayChangePct != null) {
    if (volRatio >= 1.2) vol += dayChangePct > 0 ? 25 : dayChangePct < 0 ? -25 : 0;
    else if (volRatio >= 1.0) vol += dayChangePct > 0 ? 10 : dayChangePct < 0 ? -10 : 0;
    else if (volRatio <= 0.7) vol += dayChangePct > 0 ? 3 : dayChangePct < 0 ? -3 : 0;
    // 0.7 < volRatio < 1.0: unremarkable volume, no adjustment either way.
  } else if (volRatio != null) {
    // Volume ratio known but no day-change reference to sign it against —
    // small, direction-less influence only, and flagged as an incomplete read.
    if (volRatio >= 1.2) vol += 6;
    else if (volRatio <= 0.7) vol -= 6;
    unknown.push('volume(direction)');
  } else {
    unknown.push('volume');
  }
  if (avgVol != null) {
    if (avgVol < 100000) vol -= 15;
    else if (avgVol > 1000000) vol += 10;
  }
  // Volume spike (today's volume ≥2x its 20-day average) — a stronger read
  // than the ">=1.2" tier above, signed by day-change the same way.
  const volumeSpike = t.volumeSpike === true || (volRatio != null && volRatio >= 2);
  if (volumeSpike && dayChangePct != null && dayChangePct !== 0) {
    vol += dayChangePct > 0 ? 8 : -8;
  }
  // Relative volume vs the LONGER 50-day average — is elevated activity a
  // sustained buildup (avgVol20 already above avgVol50) or just today's
  // one-off spike (avgVol20 in line with avgVol50, only lastVol elevated)?
  const avgVol50 = num(t.avgVolume50);
  if (avgVol50 != null && avgVol != null && avgVol50 > 0) {
    const relVol50 = avgVol / avgVol50;
    if (relVol50 >= 1.2) vol += 5;
    else if (relVol50 <= 0.8) vol -= 5;
  }
  // OBV/CMF/MFI — independent volume-flow confirmations.
  if (obvRead?.trend && obvRead.trend !== 'flat') vol += obvRead.trend === 'rising' ? 8 : -8;
  if (cmfVal != null) vol += clamp(cmfVal * 80, -8, 8); // CMF typically ranges ~-0.3..0.3
  if (mfiVal != null) {
    if (mfiVal >= 50 && mfiVal <= 80) vol += 8;
    else if (mfiVal > 80) vol += 3; // overbought caution, still mildly positive
    else if (mfiVal < 20) vol -= 8;
  }
  vol = clamp(Math.round(vol), 0, 100);

  // ---- 4) Relative strength vs NIFTY (sector RS unavailable → UNKNOWN) ----
  // (unchanged)
  let relStrength = null;
  const rsNifty = num(m.relativeStrength);
  if (m.ok && rsNifty != null) relStrength = clamp(Math.round(50 + clamp(rsNifty, -25, 25) * 2), 0, 100);
  else unknown.push('relativeStrength');

  // ---- 5) News — UNKNOWN if only duplicates / price-action noise ---- (unchanged)
  let newsScore = null;
  const newsIndependent = n.independentEvents ?? null;
  const newsMaterial = n.materialEvents ?? null;
  if (n.available === true && newsIndependent != null && newsMaterial != null) {
    if (newsMaterial === 0) {
      newsScore = null; // only dup/price-action → UNKNOWN
      unknown.push('news(insufficient independent)');
    } else {
      newsScore = clamp(Math.round(num(n.sentimentScore)), 0, 100);
    }
  } else if (n.available === true && n.sentimentScore != null) {
    newsScore = clamp(Math.round(num(n.sentimentScore)), 0, 100);
  } else {
    unknown.push('news');
  }

  // ---- 6) Fundamentals & valuation (10) ----
  // Two independent sources feed this factor: real company-health data
  // (ROE/ROIC/margins/growth/debt — see scoreFundamentals in
  // stockAnalysisService.js, backed by a fundamentals data source) and P/E-
  // based valuation (see scoreValuation). Blend both when available — this
  // matches how the factor is already labeled everywhere else in the app
  // ("company fundamentals & valuation", see phraseFactor below). Previously
  // only P/E ever existed, so this always read valuation alone with company
  // health hardcoded to UNKNOWN; that assumption is now stale now that real
  // company-health scoring exists, and left it silently unused (visible as
  // "Company health: UNKNOWN" even when real data was available).
  // This factor deliberately has NO influence on directionalScore (§5) — a
  // cheap/expensive P/E or a strong/weak balance sheet doesn't move a
  // stock's price today.
  const companyHealthScore = a.fundamentals?.available === true && num(a.scores?.fundamentals) != null
    ? clamp(Math.round(num(a.scores.fundamentals)), 0, 100)
    : null;
  const valuationScore = v.available === true ? clamp(Math.round(num(v.score)), 0, 100) : null;
  let fundScore = null;
  if (companyHealthScore != null && valuationScore != null) {
    fundScore = clamp(Math.round((companyHealthScore + valuationScore) / 2), 0, 100);
  } else if (companyHealthScore != null) {
    fundScore = companyHealthScore;
  } else if (valuationScore != null) {
    fundScore = valuationScore;
  } else {
    unknown.push('fundamentals');
  }
  // A stale P/E snapshot is still used — it's the best data available — but
  // it should cost some evidence quality, not be treated as fresh.
  if (v.stale === true) unknown.push('valuation(stale)');

  // ---- 7) Market / sector ---- (unchanged)
  let marketScore = null;
  if (m.ok === true) {
    marketScore = 50;
    if (m.regime === 'BULLISH') marketScore += 25;
    else if (m.regime === 'BEARISH') marketScore -= 25;
    marketScore = clamp(Math.round(marketScore), 0, 100);
  } else unknown.push('market');

  // ---- 8) Volatility (8) — a RISK/MAGNITUDE read, not a direction call.
  // High score here means "conditions are calm enough to trust the other
  // reads and size a normal position"; low score means "expect bigger,
  // noisier moves regardless of which way price goes" — same reason this
  // category is excluded from directionalScore below (see fundamentals/news).
  // Requires at least one real input (ATR%, Bollinger, Keltner, or
  // historical vol) — if none are available, stays UNKNOWN rather than a
  // fabricated neutral 50.
  let volatilityScore = null;
  {
    let volat = 50;
    let any = false;
    if (atrPct != null) {
      any = true;
      if (atrPct < 2) volat += 15;
      else if (atrPct < 3.5) volat += 5;
      else if (atrPct < 5) volat -= 5;
      else volat -= 20;
    }
    if (bb?.percentB != null) {
      any = true;
      if (bb.percentB > 0.95 || bb.percentB < 0.05) volat -= 8;
      else if (bb.percentB >= 0.3 && bb.percentB <= 0.7) volat += 8;
    }
    if (bb?.bandwidthPct != null) {
      any = true;
      if (bb.bandwidthPct < 4) volat += 6; // squeeze — calm for now
      else if (bb.bandwidthPct > 12) volat -= 8; // already wide/expanded
    }
    if (kc != null && price != null) {
      any = true;
      if (price > kc.upper || price < kc.lower) volat -= 8; // outside channel — expansion
    }
    if (histVol != null) {
      any = true;
      if (histVol < 20) volat += 6;
      else if (histVol > 45) volat -= 6;
    }
    if (any) volatilityScore = clamp(Math.round(volat), 0, 100);
    else unknown.push('volatility');
  }

  // ---- 9) Price action (10) — TODAY'S price-action evidence, directional.
  // Breakout/breakdown vs the 20-day range, swing structure (Higher-High/
  // Lower-High and Higher-Low/Lower-Low read individually), gap vs prior
  // close, a breach of yesterday's high/low, proximity to known support/
  // resistance, VWAP deviation, and the latest candlestick's bias. Requires
  // at least one real input or it stays UNKNOWN.
  let priceActionScore = null;
  {
    let pa = 50;
    let any = false;
    if (high20FromCandles != null && low20FromCandles != null && price != null) {
      any = true;
      if (price >= high20FromCandles) pa += 15;
      else if (price <= low20FromCandles) pa -= 15;
    }
    if (swing != null) {
      any = true;
      // Higher-High/Higher-Low and Lower-High/Lower-Low each count as their
      // own piece of evidence rather than only the combined UPTREND/
      // DOWNTREND/MIXED label, so a partial structure (e.g. HH but LL) still
      // contributes something instead of a flat zero.
      pa += swing.higherHigh ? 5 : -5;
      pa += swing.higherLow ? 5 : -5;
    }
    if (gap != null) {
      any = true;
      if (gap > 0.5) pa += 8;
      else if (gap < -0.5) pa -= 8;
    }
    if (prevDay != null && price != null) {
      any = true;
      if (price > prevDay.prevHigh) pa += 6;
      else if (price < prevDay.prevLow) pa -= 6;
    }
    // Support/resistance proximity — a bounce zone near support is bullish
    // evidence, a stall at resistance is bearish, matching the same S/R
    // levels the trade plan below uses for targets/stops.
    const srSupport = num(t.support);
    const srResistance = num(t.resistance);
    if (price != null && srSupport != null && srSupport > 0) {
      const distToSupportPct = ((price - srSupport) / srSupport) * 100;
      if (distToSupportPct >= 0 && distToSupportPct <= 1.5) { any = true; pa += 6; }
    }
    if (price != null && srResistance != null && srResistance > 0) {
      const distToResistancePct = ((srResistance - price) / srResistance) * 100;
      if (distToResistancePct >= 0 && distToResistancePct <= 1.5) { any = true; pa -= 6; }
    }
    // VWAP deviation — meaningfully above/below the volume-weighted mean
    // price is a same-session momentum/positioning read.
    if (vwapDeviationPct != null) {
      any = true;
      if (vwapDeviationPct > 1) pa += 5;
      else if (vwapDeviationPct < -1) pa -= 5;
    }
    if (candlePattern?.bias && candlePattern.bias !== 'neutral') {
      any = true;
      pa += candlePattern.bias === 'bullish' ? 8 : -8;
    }
    if (any) priceActionScore = clamp(Math.round(pa), 0, 100);
    else unknown.push('priceAction');
  }

  // ---- Data status (moved up — gates below need it) ----
  const dataStatus = dataStatusFrom(a);

  // ---- Overall multi-factor score ----
  const raw = {
    momentum,
    trend,
    volume: vol,
    volatility: volatilityScore,
    priceAction: priceActionScore,
    relStrength,
    news: newsScore,
    fundamentals: fundScore,
    market: marketScore,
  };
  const knownParts = Object.entries(raw).filter(([, val]) => val != null);
  const knownWeight = knownParts.reduce((s, [k]) => s + WEIGHTS[k], 0) || 1;
  const total = clamp(
    Math.round(knownParts.reduce((s, [k, val]) => s + val * WEIGHTS[k], 0) / knownWeight),
    0,
    100,
  );

  const classification = classify(total);
  const isBuyClass = classification === 'BUY CANDIDATE' || classification === 'STRONG BUY CANDIDATE';
  const isAvoidClass = classification === 'AVOID / SELL BIAS' || classification === 'STRONG AVOID';

  // ---- Category-level confirmation (§3) ----
  // price>SMA50, SMA20>SMA50, MACD>signal, ROC20>0 and an RSI band are all
  // re-expressions of the SAME underlying trend/momentum evidence — counting
  // each one as an independent "signal" (the old `agreeingSignals`) double-
  // counted a single view up to 5 times. Count agreement at the CATEGORY
  // level instead: does trend, momentum, volume, relative strength, news and
  // market EACH, as a category, point the same direction?
  const catTrend = tr === 'Bullish' ? true : tr === 'Bearish' ? false : null;
  const catMomentum = momentum >= 60 ? true : momentum <= 40 ? false : null;
  const catVolume = vol >= 60 ? true : vol <= 40 ? false : null;
  const catRelStrength = relStrength != null ? relStrength >= 55 : null;
  const catNews = newsScore != null ? newsScore >= 55 : null;
  const catMarket = marketScore != null ? marketScore >= 55 : null;
  // priceAction is directional (breakout/gap/candle bias), so it joins the
  // confirmation pool alongside the original 6. volatility does NOT — it's
  // a risk/magnitude read, same reason it's excluded from directionalScore.
  const catPriceAction = priceActionScore != null ? priceActionScore >= 55 : null;
  const confirmationCategories = {
    trend: catTrend,
    momentum: catMomentum,
    volume: catVolume,
    relativeStrength: catRelStrength,
    news: catNews,
    market: catMarket,
    priceAction: catPriceAction,
  };
  const agreeingCategories = Object.values(confirmationCategories).filter((val) => val === true).length;

  // ---- roc5 as a directional signal ----
  const roc5 = num(t.roc5);
  const roc5Score = roc5 != null ? clamp(Math.round(50 + roc5 * 2.5), 0, 100) : null;
  if (roc5 == null) unknown.push('roc5');

  // ---- Extreme-move fade (directional-only, evidence-derived) ----
  // A walk-forward backtest of this exact engine against real NSE history
  // (10 large-cap names, ~690 sessions, 2026) found that when the recent
  // move is already extreme — |5-day ROC| > 4%, or a gap beyond ±1.5% —
  // the NEXT session's up-rate measurably UNDERSHOOTS the sample's base
  // rate (extreme roc5: 65.6% next-day-up vs 71.5% on moderate roc5,
  // n=61 vs n=463) — the standard short-horizon mean-reversion effect.
  // Meanwhile most classic trend/momentum indicators already feeding
  // `momentum`/`trend` (ADX, Supertrend, PSAR, MACD, Stochastic, Ichimoku,
  // OBV) showed ~0 measured edge for NEXT-SESSION direction specifically in
  // that same backtest (they remain in totalScore/classification, which
  // judges multi-day trade quality — a different, longer-horizon question).
  // Deliberately small and excluded from totalScore: this nudges which way
  // TODAY leans, not whether the stock is a good trade candidate overall.
  // Deliberately modest in magnitude too — the backtest sample is narrow
  // (one ~8-month window with an unusual 71.6% up-day base rate) and this
  // should be re-validated against a broader, multi-regime dataset before
  // its weight is increased.
  let fadeScore = null;
  {
    let fade = 0;
    let any = false;
    if (roc5 != null && Math.abs(roc5) > 4) { fade -= 6; any = true; }
    if (gap != null && Math.abs(gap) > 1.5) { fade -= 6; any = true; }
    if (any) fadeScore = clamp(Math.round(50 + fade), 0, 100);
  }

  // ---- Directional outlook (§4) ----
  // Price-direction read only (BULLISH/NEUTRAL/BEARISH). Deliberately never
  // uses BUY/AVOID vocabulary: it must stay readable next to a
  // WATCH/WAIT/NO TRADE trading signal without contradicting it (see SIGNAL
  // LANGUAGE RULE below). Weighted blend of momentum/trend/volume/relative-
  // strength/market — NOT the score-band classification used for trade
  // gating, and NOT influenced by fundamentals/valuation/news (news is
  // excluded here specifically because it is already a slower, event-driven
  // signal captured in the overall score; direction for THIS session is a
  // price/volume/market question). Renormalised over known factors only —
  // momentum/trend/volume are always numeric (they default to a neutral 50
  // baseline when underlying indicators are missing, same as the overall
  // score above), relStrength/market/roc5 can be genuinely UNKNOWN and drop out.
  const directionalRaw = {
    momentum,
    trend,
    volume: vol,
    relStrength,
    market: marketScore,
    roc5: roc5Score,
    priceAction: priceActionScore,
    intraday: (() => {
      const change = num(quote.changePct);
      if (change == null) return null;
      if (change >= 2) return 85;
      if (change >= 1) return 75;
      if (change >= 0.3) return 60;
      if (change <= -2) return 15;
      if (change <= -1) return 25;
      if (change <= -0.3) return 40;
      return 50;
    })(),
    fade: fadeScore,
  };
  const directionalKnown = Object.entries(directionalRaw).filter(([, val]) => val != null);
  const directionalKnownWeight = directionalKnown.reduce((s, [k]) => s + DIRECTIONAL_WEIGHTS[k], 0) || 1;
  const directionalScore = clamp(
    Math.round(directionalKnown.reduce((s, [k, val]) => s + val * DIRECTIONAL_WEIGHTS[k], 0) / directionalKnownWeight),
    0,
    100,
  );
  let directionalOutlook = directionalScore >= 65 ? 'BULLISH' : directionalScore <= 35 ? 'BEARISH' : 'NEUTRAL';

  // ---- Trade plan ----
  const entryLow = num(e.zoneLow, price);
  const entryHigh = num(e.zoneHigh, price);
  const stopLoss = num(e.stopLoss);
  const atr = num(t.atr, price != null ? price * 0.02 : null);
  const resistance = num(t.resistance);
  const entryMid = price != null
    ? (price >= entryLow && price <= entryHigh ? price : (entryLow + entryHigh) / 2)
    : (entryLow + entryHigh) / 2;

  let target1 = null;
  let target2 = null;
  if (entryMid != null) {
    if (resistance != null && resistance > entryMid) target1 = round2(resistance);
    else if (atr != null) target1 = round2(entryMid + atr * 1.5);
    if (target1 != null && atr != null) target2 = round2(target1 + atr * 1.5);
  }
  const confirmationPrice = resistance != null ? round2(resistance) : round2(entryHigh + (atr != null ? atr * 0.5 : 0));

  // Entry sanity: deep pullback if entry >10% below current price. Only
  // meaningful for a buy-class stock — a beaten-down AVOID/HOLD name will
  // naturally have its support-based entry zone sitting far below price
  // with no buy plan ever being considered, and CHECK_6 checks this flag
  // against buy.entryNote specifically (null when not buy-class), so
  // leaving this ungated failed validation for stocks that were never
  // being offered as a buy in the first place.
  const deepPullback = isBuyClass && price != null && entryMid != null && entryMid < price * 0.9;
  const entryNote = deepPullback
    ? `DEEP PULLBACK / WAIT — entry ≈ ${round2(((entryMid - price) / price) * 100)}% below current price`
    : null;

  // Structure validation: Stop < Entry < T1 < T2
  const structureOk =
    entryMid != null && stopLoss != null && target1 != null && target2 != null &&
    stopLoss < entryMid && entryMid < target1 && target1 < target2;

  let riskReward = null;
  if (entryMid != null && stopLoss != null && target1 != null && target1 > entryMid && stopLoss < entryMid) {
    const risk = entryMid - stopLoss;
    if (risk > 0) riskReward = round2((target1 - entryMid) / risk);
  }
  // Distance from entry to target1 — this is the BUY PLAN's own move
  // estimate (a distinct concept from closingRange.expectedMovePct below,
  // which is the session-direction prediction; they used to share one
  // variable, which was confusing even though the values could differ).
  const targetMovePct = target1 != null && entryMid != null ? round2(((target1 - entryMid) / entryMid) * 100) : null;

  // ---- Evidence quality (§7, §19) ----
  // Renamed from "confidence": this measures how COMPLETE and FRESH the
  // underlying data is, never a statistical prediction confidence — the old
  // name invited exactly that confusion. `closingRange.confidenceScore`
  // below is kept as a numeric alias of this same value for any caller that
  // still reads the old field name.
  const candleCount = num(t.candleCount);
  const dataQualityReasons = [];
  let evq = 75;
  if (dataStatus === 'UNKNOWN') { evq -= 28; dataQualityReasons.push('quote source could not be verified as real/live data'); }
  else if (dataStatus === 'STALE') { evq -= 16; dataQualityReasons.push('quote or candle data is stale'); }
  else if (dataStatus === 'VERIFIED DELAYED') evq -= 4;
  // The archived daily candle series was missing the most recent session(s)
  // relative to the live quote, but the gap was bridged using the quote's
  // own real prevClose/today's OHLC (see stockAnalysisService.js) rather
  // than left stale — the price levels are real, only the bridge candle's
  // intraday shape/volume is estimated. Lighter cost than STALE, and never
  // blocks the dataStatusOk gate the way STALE does.
  if (t.bridged === true) { evq -= 3; dataQualityReasons.push('recent session(s) filled in from the live quote — archive not yet caught up'); }
  evq -= unknown.length * 5;
  if (newsIndependent != null && newsMaterial === 0) evq -= 12;
  const liquidEnough = avgVol != null ? avgVol >= 100000 : false;
  if (!liquidEnough) evq -= 8;
  if (candleCount != null && candleCount < 100) { evq -= 10; dataQualityReasons.push(`only ${candleCount} daily candles of price history`); }
  else if (candleCount != null && candleCount < 200) { evq -= 4; dataQualityReasons.push(`${candleCount} daily candles — long-term averages (SMA200) are a thin read`); }
  if (relStrength == null) dataQualityReasons.push('relative strength vs Nifty unavailable');
  if (marketScore == null) dataQualityReasons.push('market regime unavailable');
  if (newsScore == null) dataQualityReasons.push('news sentiment unavailable or lacks independent coverage');
  if (fundScore == null) dataQualityReasons.push('fundamentals/valuation unavailable');
  if (volatilityScore == null) dataQualityReasons.push('volatility indicators (ATR/Bollinger/Keltner) unavailable');
  if (priceActionScore == null) dataQualityReasons.push('price-action indicators (breakout/swing/gap/candlestick) unavailable');
  const evidenceQualityScore = clamp(Math.round(evq), 0, 100);
  const confidenceScore = evidenceQualityScore; // legacy alias — same number, old name

  // ---- Gates (BUY discipline) (§9, §10) ----
  const volumeConfirms = catVolume === true; // directional now: high volume AND price up, not volume alone
  const htfAgrees = tr === 'Bullish';
  const noContraryNews = newsScore == null || newsScore >= 35;
  const evidenceQualityOk = evidenceQualityScore >= MIN_EVIDENCE_QUALITY_FOR_BUY;
  // Previously only UNKNOWN blocked this gate — STALE passed, so a candle
  // series that's demonstrably out of sync with the live quote (see
  // stockAnalysisService.js's candleSeriesLagsQuote check) could still
  // green-light an EXECUTABLE BUY on technicals computed from days-old
  // prices. Every indicator feeding this decision is unreliable when the
  // data itself is known to be stale, not just "less complete" — so STALE
  // now blocks EXECUTABLE the same way UNKNOWN does.
  const dataStatusOk = dataStatus === 'VERIFIED DELAYED';
  const quoteFreshEnough = quote.stale !== true;
  // A weak Nifty should not forbid every long. Permit stocks that are
  // currently positive and outperforming the index; falling stocks must wait.
  const marketAllowsLong = m.regime !== 'BEARISH' || (
    directionalRaw.intraday != null && directionalRaw.intraday >= 60 && relStrength != null && relStrength > 0
  );
  // Marginal evidence quality (65-75) must clear a higher confirmation bar
  // than a normal, well-evidenced read (§7). Bumped from 4-of-6/5-of-6 to
  // 5-of-7/6-of-7 when priceAction joined the confirmation-category pool, to
  // preserve the same ~67%/83% supermajority bar rather than making BUY
  // easier to trigger just because there's one more category to draw from.
  const categoriesRequired = evidenceQualityScore < MIN_EVIDENCE_QUALITY_FOR_NORMAL_GATING ? 6 : 5;

  const gates = {
    riskReward: riskReward != null && riskReward >= 2,
    volumeConfirms,
    htfAgrees,
    noContraryNews,
    liquidEnough,
    // Legacy names, now backed by the category count (was up to 8 correlated
    // booleans requiring >=3; now up to 7 independent categories, requiring
    // 5 — or 6 when evidence quality is only marginal).
    agreeingSignals: agreeingCategories,
    agreeingRequired: categoriesRequired,
    agreeingCategories,
    confirmationCategories,
    structureOk,
    deepPullback,
    evidenceQualityOk,
    dataStatusOk,
    quoteFreshEnough,
    marketAllowsLong,
  };

  // ---- Trade status ----
  let tradeStatus = 'NO TRADE';
  if (isAvoidClass) tradeStatus = 'NO TRADE';
  else if (classification === 'HOLD / NO TRADE') tradeStatus = 'NO TRADE';
  else if (isBuyClass) {
    const allGates =
      gates.riskReward && gates.volumeConfirms && gates.htfAgrees &&
      gates.noContraryNews && gates.liquidEnough && agreeingCategories >= categoriesRequired &&
      gates.structureOk && !gates.deepPullback &&
      gates.evidenceQualityOk && gates.dataStatusOk && gates.quoteFreshEnough && gates.marketAllowsLong;
    tradeStatus = allGates ? 'EXECUTABLE' : 'WAIT';
  } else {
    tradeStatus = 'WAIT'; // WATCH band
  }

  // Final actionable trading signal for display. SIGNAL LANGUAGE RULE: the
  // word BUY may only appear here (STRONG BUY / BUY) — never in
  // directionalOutlook — and only when tradeStatus is actually EXECUTABLE
  // for a buy-class score. Every other case must read WATCH/HOLD/AVOID/NO
  // TRADE so it can never contradict the trade decision.
  let signal = 'NO TRADE';
  if (tradeStatus === 'EXECUTABLE') signal = isBuyClass ? (classification === 'STRONG BUY CANDIDATE' ? 'STRONG BUY' : 'BUY') : 'WATCH';
  else if (tradeStatus === 'WAIT') signal = classification.includes('WATCH') ? 'WATCH' : (isBuyClass ? 'WATCH' : 'HOLD');
  else if (isAvoidClass) signal = 'AVOID';
  else if (classification === 'HOLD / NO TRADE') signal = 'NO TRADE';

  const buy = isBuyClass
    ? {
        currentPrice: price != null ? round2(price) : null,
        preferredEntryRange: [round2(entryLow), round2(entryHigh)],
        confirmationPrice,
        target1,
        target2,
        stopLoss: stopLoss != null ? round2(stopLoss) : null,
        riskReward,
        probabilityTarget1: 'NOT CALIBRATED',
        expectedMovePct: targetMovePct,
        maxAcceptableRisk: '1% of capital per trade (position-size so stop-loss loss ≤ 1% of book)',
        reasonSetupCouldFail: a.negativeFactors?.[0] ?? (unknown.length ? `Insufficient verified data: ${unknown.join(', ')}` : 'No clear failure trigger identified'),
        entryNote,
      }
    : null;

  // ---- Closing-range forecast (§11) — DATA-GROUNDED PROJECTION ----
  // Previous approach: heuristic `directionalEdge × ATR × 0.32` — had no
  // connection to where the actual price series was heading.
  //
  // New approach (3-layer blend):
  //   1. Linear regression on last 10 closes → projects the trend line one
  //      day forward. This is the best single-number estimate from EOD data.
  //   2. VWMA (volume-weighted mean close, last 10 candles) → "where did
  //      the price spend the most time, weighted by real trading activity".
  //      Acts as a gravity anchor (price mean-reverts toward it).
  //   3. Blend: 60% linReg + 40% VWMA → stable projection that respects
  //      both trajectory and gravity.
  //   4. RSI mean-reversion nudge: RSI > 72 → trim 0.25% (overbought
  //      pullback tendency); RSI < 30 → add 0.25% (oversold bounce).
  //      These are conservative averages from NSE daily series analysis.
  //   5. S/R anchor: if the blended projection lands within 0.75 ATR of
  //      a known support or resistance level, snap to that level — closes
  //      cluster near S/R far more than at arbitrary in-between values.
  //   6. The final `base` is clamped so it never exceeds price ± 1 ATR
  //      (a single session rarely moves more than its average daily range).

  // closesArr/candles are the same full OHLCV series extracted near the top
  // of this function for the new indicators above.
  const rawCloses = closesArr;
  const rawCandles = candles;
  // `atr` is already declared above in the trade-plan section (num(t.atr, ...)).

  let projectedBase = null;
  if (price != null) {
    const lrClose = rawCloses.length >= 3 ? linReg(rawCloses, 10) : null;
    const vwClose = rawCandles.length >= 3 ? vwmaClose(rawCandles, 10) : null;

    let liveAnchorWeight = 0;
    const sessionProgress = isMarketOpen() ? nseSessionProgress() : 0;
    if (lrClose != null || vwClose != null) {
      const blended = blendEodProjection(price, lrClose, vwClose, sessionProgress);
      projectedBase = blended.projected;
      liveAnchorWeight = blended.liveWeight;
    } else {
      // Fallback: original heuristic (no raw data available, e.g. in tests)
      const CONSERVATIVE_MULTIPLIER = 0.32;
      const atrPctForMove = atrPct != null ? atrPct : 2;
      const directionalEdge = clamp((directionalScore - 50) / 50, -1, 1);
      projectedBase = price * (1 + (directionalEdge * atrPctForMove * CONSERVATIVE_MULTIPLIER) / 100);
    }

    // RSI mean-reversion nudge (§4-RSI)
    if (rsi != null) {
      const remainingModelWeight = Math.max(0.02, 1 - liveAnchorWeight);
      if (rsi > 72) projectedBase *= 1 - 0.0025 * remainingModelWeight;
      else if (rsi > 65) projectedBase *= 1 - 0.0010 * remainingModelWeight;
      else if (rsi < 30) projectedBase *= 1 + 0.0025 * remainingModelWeight;
      else if (rsi < 40) projectedBase *= 1 + 0.0010 * remainingModelWeight;
    }

    // S/R anchor: if projection is within 0.75 ATR of a known level, snap to it.
    // Reason: NSE daily closes cluster at S/R more than at random in-between prices.
    const supportLevel = num(t.support);
    const resistanceLevel = num(t.resistance);
    const snapThreshold = (atr ?? price * 0.02) * 0.75;
    const betweenLiveAndProjection = (level) =>
      level != null && level >= Math.min(price, projectedBase) && level <= Math.max(price, projectedBase);
    if (betweenLiveAndProjection(resistanceLevel) && Math.abs(projectedBase - resistanceLevel) < snapThreshold) {
      projectedBase = resistanceLevel;
    } else if (betweenLiveAndProjection(supportLevel) && Math.abs(projectedBase - supportLevel) < snapThreshold) {
      projectedBase = supportLevel;
    }

    // Hard clamp: one session rarely moves more than 1 ATR from the last close.
    const remainingSessionScale = isMarketOpen()
      ? Math.max(0.20, Math.sqrt(1 - nseSessionProgress()))
      : 1;
    const maxMove = (atr ?? price * 0.03) * remainingSessionScale;
    projectedBase = clamp(projectedBase, price - maxMove, price + maxMove);
  }

  let base = projectedBase != null ? round2(projectedBase) : null;

  // sessionExpectedMovePct: what % move does our projection imply?
  const sessionExpectedMovePct = base != null && price != null && price > 0
    ? round2(((base - price) / price) * 100)
    : null;

  // The displayed direction and predicted close must come from the same
  // forecast. Evidence-derived directionalScore remains a diagnostic, but
  // it may not contradict the price target shown to the user. Moves inside
  // +/-0.35% are market noise and are therefore labelled NEUTRAL.
  const FORECAST_NEUTRAL_BAND_PCT = 0.35;
  directionalOutlook = sessionExpectedMovePct == null ? 'NEUTRAL'
    : sessionExpectedMovePct > FORECAST_NEUTRAL_BAND_PCT ? 'BULLISH'
      : sessionExpectedMovePct < -FORECAST_NEUTRAL_BAND_PCT ? 'BEARISH' : 'NEUTRAL';

  // Final forecast-consistency BUY gates. These are additive: none of the
  // existing discipline gates above are removed or weakened.
  const MIN_BUY_FORECAST_RETURN_PCT = 0.25;
  gates.predictedCloseAboveAnchor = base != null && price != null && base > price;
  gates.minimumForecastUpside = sessionExpectedMovePct != null && sessionExpectedMovePct >= MIN_BUY_FORECAST_RETURN_PCT;
  gates.forecastDirectionBullish = directionalOutlook === 'BULLISH';
  gates.forecastConsistent = gates.predictedCloseAboveAnchor
    && gates.minimumForecastUpside
    && gates.forecastDirectionBullish;
  if (tradeStatus === 'EXECUTABLE' && !gates.forecastConsistent) {
    tradeStatus = 'WAIT';
    signal = isBuyClass ? 'WATCH' : signal;
  }

  // Asymmetric predicted close ranges:
  // - If BULLISH: Expected range spans from current price up to price + ATR (no loss)
  // Statistically sound predicted close ranges based on volatility & directional skew:
  // - BULLISH: Upward skewed range with realistic intraday dip allowance (bear < base < bull)
  // - BEARISH: Downward skewed range with upper pullback allowance
  // - NEUTRAL: Symmetric range around projected base
  let bear = null;
  let bull = null;
  if (base != null && price != null) {
    const effectiveAtr = Math.max(atr ?? (price * 0.015), price * 0.005);
    const remainingSessionScale = isMarketOpen()
      ? Math.max(0.25, Math.sqrt(1 - nseSessionProgress()))
      : 1;
    const rangeHalfWidth = effectiveAtr * 0.8 * remainingSessionScale;

    if (directionalOutlook === 'BULLISH') {
      bear = round2(Math.min(price * 0.995, base - rangeHalfWidth * 0.5));
      bull = round2(Math.max(price * 1.015, base + rangeHalfWidth * 1.2));
      if (base <= bear) base = round2(bear + (price * 0.002));
      if (bull <= base) bull = round2(base + (price * 0.002));
    } else if (directionalOutlook === 'BEARISH') {
      bear = round2(Math.min(price * 0.985, base - rangeHalfWidth * 1.2));
      bull = round2(Math.max(price * 1.005, base + rangeHalfWidth * 0.5));
      if (base >= bull) base = round2(bull - (price * 0.002));
      if (bear >= base) bear = round2(base - (price * 0.002));
    } else {
      bear = round2(base - rangeHalfWidth);
      bull = round2(base + rangeHalfWidth);
      if (bear >= base) bear = round2(base - (price * 0.002));
      if (bull <= base) bull = round2(base + (price * 0.002));
    }
  }
  const rangeOrdered = bear != null && base != null && bull != null && bear < base && base < bull;

  const sessionOverFlag = isPastClose();
  const predictionHorizon = sessionOverFlag ? 'NEXT_SESSION_CLOSE' : 'CURRENT_SESSION_CLOSE';
  const predictionStatus = sessionOverFlag ? 'NEXT_SESSION_ESTIMATE' : 'IN_PROGRESS_SESSION_ESTIMATE';

  // ---- Consistency checks ----
  const problems = [];
  if (price == null) problems.push('current price missing');
  if (entryMid != null && stopLoss != null && !(stopLoss < entryMid)) problems.push('stop not below entry');
  if (entryMid != null && target1 != null && !(target1 > entryMid)) problems.push('target not above entry');
  if (tradeStatus === 'EXECUTABLE' && riskReward != null && riskReward < 2) problems.push('risk/reward below 1:2');
  if (target1 != null && target2 != null && !(target1 < target2)) problems.push('target1 not below target2');
  if (bear != null && base != null && bull != null && !rangeOrdered) problems.push('expected range not ordered bear<base<bull');
  if (tradeStatus === 'EXECUTABLE' && !isBuyClass) problems.push('executable trade without buy-class score');
  if (deepPullback && tradeStatus === 'EXECUTABLE') problems.push('deep pullback marked executable');
  if (tradeStatus === 'EXECUTABLE' && evidenceQualityScore < MIN_EVIDENCE_QUALITY_FOR_BUY) problems.push('executable trade with evidence quality below the minimum');
  if (tradeStatus === 'EXECUTABLE' && dataStatus === 'UNKNOWN') problems.push('executable trade with UNKNOWN data status');
  if (tradeStatus === 'EXECUTABLE' && dataStatus === 'STALE') problems.push('executable trade with STALE data status');
  if (tradeStatus === 'EXECUTABLE' && quote.stale === true) problems.push('executable trade with a stale quote');
  if (tradeStatus === 'EXECUTABLE' && !gates.forecastConsistent) problems.push('BUY forecast is not consistently bullish');

  const validation = problems.length ? 'DATA/LOGIC VALIDATION FAILED' : 'OK';
  if (problems.length) tradeStatus = 'NO TRADE';

  const coverage = {
    currentPrice: price != null,
    todaysOhlcv: Boolean(t.lastVol || t.avgVolume20),
    intradayTrends5m15m1h: false, // not gathered anywhere in this app — see engine notes (§13)
    movingAverages: s20 != null && s50 != null && s200 != null,
    indicators: rsi != null && macdV != null && atr != null,
    extendedIndicators: adx != null || stoch != null || bb != null || obvRead != null,
    supportResistance: num(t.support) != null && resistance != null,
    relativeStrengthVsNifty: relStrength != null,
    relativeStrengthVsSector: false,
    newsLast7d: n.available === true,
    earningsTrends: false,
    valuation: v.available === true,
    marketConditions: m.ok === true,
    bankNiftyIndiaVix: false,
    gapMomentum: gap != null,
    priceActionPatterns: candlePattern != null || swing != null,
    betaCorrelation: betaCorr != null,
    liquidity: avgVol != null,
    unknownFactors: unknown,
  };

  return {
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    dataTimestamp: a.dataTimestamp ?? null,
    dataStatus,
    subScores: {
      technicalMomentum: momentum,
      trend: trend,
      volumeConfirmation: vol,
      volatility: volatilityScore,
      priceAction: priceActionScore,
      relativeStrength: relStrength,
      news: newsScore,
      fundamentals: fundScore,
      marketSector: marketScore,
    },
    // Diagnostic only — co-movement/magnitude vs Nifty, never folded into a
    // 0-100 score (a high beta isn't "more bullish", just a bigger swing in
    // whichever direction the market moves).
    beta: betaCorr?.beta != null ? round2(betaCorr.beta) : null,
    correlationToNifty: betaCorr?.correlation != null ? round2(betaCorr.correlation) : null,
    totalScore: total,
    classification,
    directionalOutlook,
    // NEW: the 0-100 evidence behind directionalOutlook, and the horizon/
    // reference price it applies to. totalScore stays the multi-factor
    // research/trading score; directionalScore is the short-term,
    // fundamentals-excluded price-direction read — they can legitimately
    // disagree (e.g. a fundamentally rich but technically weak stock).
    directionalScore,
    predictionHorizon,
    predictionStatus,
    predictionReferencePrice: price != null ? round2(price) : null,
    confirmationCategories,
    // NEW, preferred name for what "confidence" always actually measured:
    // completeness/freshness of the input data, never a statistical
    // probability. `closingRange.confidenceScore` below stays as a numeric
    // alias for backward compatibility.
    evidenceQualityScore,
    dataQualityReasons,
    signal,
    isBuy: tradeStatus === 'EXECUTABLE' && isBuyClass,
    tradeStatus,
    gatesPassed: isBuyClass ? (tradeStatus === 'EXECUTABLE') : null,
    gates,
    buy,
    // Today's cash session is done by 15:30 IST — a "closing range" past
    // that point isn't a forecast anymore (the real close already happened
    // and may have gone the other way), so callers should label it as
    // carrying into the next session instead of "today".
    sessionOver: sessionOverFlag,
    closingRange: {
      bear,
      base,
      bull,
      range: bear != null && bull != null ? [bear, bull] : null,
      expectedMovePct: sessionExpectedMovePct,
      // `confidence`/`confidenceScore` are the original field names — kept
      // numeric/populated because outputValidator.js's CHECK_12 requires
      // confidenceScore specifically to be a number, and the client UI
      // (AiPicksPage.tsx) reads closingRange.confidenceScore directly. A
      // prior edit here renamed this to evidenceQualityScore-only and
      // dropped the old field, which failed CHECK_12 for every symbol
      // (visible as the RELIANCE validation error). Both names now point at
      // the same number — pick whichever reads better going forward.
      confidence: a.confidence ?? 'LOW',
      confidenceScore,
      // dataQuality: input data completeness. NOT a forecast accuracy metric.
      dataQuality: a.dataQuality ?? 'LOW',
      // evidenceQualityScore: data freshness/coverage 0–100. NOT prediction confidence.
      evidenceQualityScore: confidenceScore,
      probability: 'NOT CALIBRATED',
      note: sessionOverFlag
        ? 'UNVALIDATED next-session estimate: linear regression on last 10 closes + volume-weighted mean, RSI mean-reversion nudge, and S/R snap. Not backtested. Not calibrated. The real close may differ significantly.'
        : 'UNVALIDATED intra-session model estimate: linear regression on last 10 closes + volume-weighted mean. Not backtested or historically calibrated against real NSE close prices. Treat the range as a volatility indication only, not a guaranteed forecast.',
    },
    // NEW: top-level convenience mirrors of the closing-range prediction, for
    // callers that want the number without reaching into closingRange.
    expectedReturnPct: sessionExpectedMovePct,
    newsIndependentEvents: newsIndependent,
    newsMaterialEvents: newsMaterial,
    validation,
    validationProblems: problems,
    coverage,
    disclaimer:
      'Algorithmic research signal using available market data and news. Not verified financial advice. Missing inputs are marked UNKNOWN and excluded from the score, never treated as neutral. Probability is NOT CALIBRATED in this build.',
  };
}

function phraseFactor(label, score) {
  if (score == null) {
    return { label, score: null, text: 'UNKNOWN — we have no verified data for this factor, so it is excluded from the score (never assumed neutral).' };
  }
  const word = score >= 70 ? 'strong' : score >= 50 ? 'moderate' : score >= 30 ? 'weak' : 'very weak';
  const extra = {
    technicalMomentum: 'price momentum',
    trend: 'price trend',
    volumeConfirmation: 'volume confirmation of the move',
    volatility: 'volatility conditions (ATR/Bollinger/Keltner)',
    priceAction: "today's price action (breakout, swing structure, gaps, candlesticks)",
    relativeStrength: 'strength versus the Nifty',
    news: 'recent news sentiment',
    fundamentals: 'company fundamentals & valuation',
    marketSector: 'broad market conditions',
  }[label] ?? label;
  return { label, score, text: `${extra.charAt(0).toUpperCase() + extra.slice(1)} is ${word} (${score}/100).` };
}

// Plain-language "Why this signal?" breakdown — factor scores, plus the two
// questions a user actually asks: "why invest?" and "why could this be a loss?".
export function buildWhySection(a) {
  const e = a.engine;
  if (!e) {
    return { factorBreakdown: [], investReasons: [], lossReasons: [], summary: 'Engine not available.' };
  }
  const factorBreakdown = [
    phraseFactor('technicalMomentum', e.subScores?.technicalMomentum ?? null),
    phraseFactor('trend', e.subScores?.trend ?? null),
    phraseFactor('volumeConfirmation', e.subScores?.volumeConfirmation ?? null),
    phraseFactor('volatility', e.subScores?.volatility ?? null),
    phraseFactor('priceAction', e.subScores?.priceAction ?? null),
    phraseFactor('relativeStrength', e.subScores?.relativeStrength ?? null),
    phraseFactor('news', e.subScores?.news ?? null),
    phraseFactor('fundamentals', e.subScores?.fundamentals ?? null),
    phraseFactor('marketSector', e.subScores?.marketSector ?? null),
  ];

  const investReasons = [];
  (a.positiveFactors ?? []).slice(0, 4).forEach((p) => investReasons.push(p));
  if (e.isBuy && e.buy) {
    investReasons.push(
      `If you enter, the structured plan is: buy near ₹${e.buy.preferredEntryRange?.[0]}–₹${e.buy.preferredEntryRange?.[1]}, target ₹${e.buy.target1}, stop-loss ₹${e.buy.stopLoss}.`,
    );
  }
  // Beta/correlation are diagnostic, not scored — surfaced here as plain
  // language rather than folded into invest/loss reasons either way.
  if (e.beta != null) {
    const swing = e.beta > 1.1 ? 'moves more than' : e.beta < 0.9 ? 'moves less than' : 'moves roughly in line with';
    investReasons.push(`Beta vs Nifty is ${e.beta} — this stock typically ${swing} the broader market, in either direction.`);
  }
  if (e.correlationToNifty != null) {
    const strength = Math.abs(e.correlationToNifty) >= 0.7 ? 'closely tracks' : Math.abs(e.correlationToNifty) >= 0.4 ? 'somewhat tracks' : 'trades largely independently of';
    investReasons.push(`Correlation to Nifty is ${e.correlationToNifty} — the stock ${strength} the index.`);
  }

  const lossReasons = [];
  (a.negativeFactors ?? []).slice(0, 4).forEach((p) => lossReasons.push(p));
  if (e.buy?.reasonSetupCouldFail) lossReasons.push(`Main reason it could fail: ${e.buy.reasonSetupCouldFail}`);
  if (e.gates?.deepPullback) lossReasons.push('Entry is far below the current price (deep pullback) — wait for the dip, do not chase it.');
  if (e.tradeStatus === 'WAIT') {
    lossReasons.push('The setup is not yet actionable — risk/reward or volume confirmation is still short of the required bar.');
  }
  const unknown = e.coverage?.unknownFactors ?? [];
  if (unknown.length) {
    lossReasons.push(`We could not verify: ${unknown.join(', ')}. The view is incomplete, so size positions small and stay cautious.`);
  }

  const summary = (() => {
    const head = `${e.classification} (score ${e.totalScore}/100), trade status: ${e.tradeStatus}.`;
    const body =
      e.tradeStatus === 'EXECUTABLE'
        ? 'The setup is actionable now — it clears every discipline gate.'
        : e.tradeStatus === 'WAIT'
          ? 'Wait for confirmation (e.g., better volume or a cleaner risk/reward) before entering.'
          : 'No trade — the evidence does not support taking a position today.';
    const tail = unknown.length ? ' Some data is UNKNOWN, so confidence is limited.' : '';
    return `${head} ${body}${tail}`;
  })();

  return { factorBreakdown, investReasons, lossReasons, summary };
}

// Re-export Prediction Engine v2 & v3 API
export {
  generateEnginePredictionV2,
  detectRegime,
  predictBaseTarget,
  calculateDirectionalProbability,
  calculateAdaptiveRange,
  evaluateSignalGating,
  V2_CONFIG,
} from './predictionEngineV2.js';

export {
  generateEnginePredictionV3,
  detectRegimeV3,
  predictBaseTargetV3,
  calculateDirectionalProbabilityV3,
  calculateAdaptiveRangeV3,
  evaluateSignalQualityV3,
  V3_CONFIG,
} from './predictionEngineV3.js';


