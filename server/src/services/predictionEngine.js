import { round2 } from '../utils/helpers.js';
import { clamp, linReg, vwmaClose } from './radar/indicators.js';
import { isPastClose } from './officialClose.js';

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
const WEIGHTS = {
  momentum: 25,
  trend: 20,
  volume: 15,
  relStrength: 10,
  news: 10,
  fundamentals: 10,
  market: 10,
};

// Weights for the SHORT-TERM DIRECTIONAL score. Fundamentals/valuation move
// on a scale of quarters, not sessions, so they are deliberately excluded
// here — a cheap stock in a strong downtrend is still going down today.
// roc5 (5-day momentum) is the most recent EOD signal available and carries
// more weight than roc20 for same-session direction.
const DIRECTIONAL_WEIGHTS = {
  momentum: 30,
  trend: 22,
  volume: 15,
  relStrength: 10,
  market: 18,
  roc5: 5,
};

// Below this, an EXECUTABLE BUY is never allowed regardless of how good the
// score looks — see buildEngineResult's gates section and spec §7/§9.
const MIN_EVIDENCE_QUALITY_FOR_BUY = 65;
// Below this, the directional/momentum categories must agree even more
// strongly than the base 4-of-6 bar before a trade is allowed through.
const MIN_EVIDENCE_QUALITY_FOR_NORMAL_GATING = 75;

export function buildEngineResult(a) {
  const t = a.technical ?? {};
  const n = a.news ?? {};
  const v = a.valuation ?? {};
  const m = a.market ?? {};
  const e = a.entry ?? {};
  const quote = a.quote ?? {};
  const price = num(a.price);
  const unknown = [];

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
  momentum = clamp(Math.round(momentum), 0, 100);

  // ---- 2) Trend (20) ---- (unchanged — not flagged as a problem)
  let trend = 50;
  const s20 = num(t.sma20);
  const s50 = num(t.sma50);
  const s200 = num(t.sma200);
  const tr = t.trend;
  if (tr === 'Bullish') trend += 25;
  else if (tr === 'Bearish') trend -= 25;
  if (price != null) {
    if (s50 != null) trend += price > s50 ? 8 : -8;
    if (s200 != null) trend += price > s200 ? 8 : -8;
  }
  if (s20 != null && s50 != null) trend += s20 > s50 ? 9 : -9;
  trend = clamp(Math.round(trend), 0, 100);

  // ---- 3) Volume / price confirmation (15) ----
  // High volume is not inherently bullish — it AMPLIFIES whatever direction
  // the price actually moved on that volume. High volume on a day the stock
  // fell is bearish confirmation, not a reason to buy (see §1, §10). Low
  // volume gets only weak confirmation either way, never an automatic
  // bearish penalty (a quiet day isn't evidence of weakness by itself).
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
  if (atrPct != null) {
    if (atrPct > 5) vol -= 15;
    else if (atrPct < 2) vol += 10;
  }
  if (avgVol != null) {
    if (avgVol < 100000) vol -= 15;
    else if (avgVol > 1000000) vol += 10;
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

  // ---- 6) Fundamentals — UNKNOWN when missing (never 50) ---- (unchanged)
  // f.score (company-health) is architecturally always UNKNOWN in this app —
  // only a P/E snapshot exists (see scoreFundamentals in
  // stockAnalysisService.js), never revenue/margins/ROE/debt data. The
  // sub-score is valuation alone until real company-health data exists.
  // This factor deliberately has NO influence on directionalScore (§5) — a
  // cheap or expensive P/E doesn't move a stock's price today.
  let fundScore = null;
  if (v.available === true) {
    fundScore = clamp(Math.round(num(v.score)), 0, 100);
    // A stale P/E snapshot is still used — it's the best data available —
    // but it should cost some evidence quality, not be treated as fresh.
    if (v.stale === true) unknown.push('valuation(stale)');
  } else unknown.push('fundamentals');

  // ---- 7) Market / sector ---- (unchanged)
  let marketScore = null;
  if (m.ok === true) {
    marketScore = 50;
    if (m.regime === 'BULLISH') marketScore += 25;
    else if (m.regime === 'BEARISH') marketScore -= 25;
    marketScore = clamp(Math.round(marketScore), 0, 100);
  } else unknown.push('market');

  // ---- Data status (moved up — gates below need it) ----
  const dataStatus = dataStatusFrom(a);

  // ---- Overall multi-factor score (unchanged formula/weights) ----
  const raw = { momentum, trend, volume: vol, relStrength, news: newsScore, fundamentals: fundScore, market: marketScore };
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
  const confirmationCategories = {
    trend: catTrend,
    momentum: catMomentum,
    volume: catVolume,
    relativeStrength: catRelStrength,
    news: catNews,
    market: catMarket,
  };
  const agreeingCategories = Object.values(confirmationCategories).filter((val) => val === true).length;

  // ---- roc5 as a directional signal ----
  const roc5 = num(t.roc5);
  const roc5Score = roc5 != null ? clamp(Math.round(50 + roc5 * 2.5), 0, 100) : null;
  if (roc5 == null) unknown.push('roc5');

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
  const directionalRaw = { momentum, trend, volume: vol, relStrength, market: marketScore, roc5: roc5Score };
  const directionalKnown = Object.entries(directionalRaw).filter(([, val]) => val != null);
  const directionalKnownWeight = directionalKnown.reduce((s, [k]) => s + DIRECTIONAL_WEIGHTS[k], 0) || 1;
  const directionalScore = clamp(
    Math.round(directionalKnown.reduce((s, [k, val]) => s + val * DIRECTIONAL_WEIGHTS[k], 0) / directionalKnownWeight),
    0,
    100,
  );
  const directionalOutlook = directionalScore >= 65 ? 'BULLISH' : directionalScore <= 35 ? 'BEARISH' : 'NEUTRAL';

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

  // Entry sanity: deep pullback if entry >10% below current price.
  const deepPullback = price != null && entryMid != null && entryMid < price * 0.9;
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
  let evq = 72;
  if (dataStatus === 'UNKNOWN') { evq -= 28; dataQualityReasons.push('quote source could not be verified as real/live data'); }
  else if (dataStatus === 'STALE') { evq -= 16; dataQualityReasons.push('quote or candle data is stale'); }
  else if (dataStatus === 'VERIFIED DELAYED') evq -= 6;
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
  const evidenceQualityScore = clamp(Math.round(evq), 0, 100);
  const confidenceScore = evidenceQualityScore; // legacy alias — same number, old name

  // ---- Gates (BUY discipline) (§9, §10) ----
  const volumeConfirms = catVolume === true; // directional now: high volume AND price up, not volume alone
  const htfAgrees = tr === 'Bullish';
  const noContraryNews = newsScore == null || newsScore >= 35;
  const evidenceQualityOk = evidenceQualityScore >= MIN_EVIDENCE_QUALITY_FOR_BUY;
  const dataStatusOk = dataStatus !== 'UNKNOWN';
  const quoteFreshEnough = quote.stale !== true;
  // Marginal evidence quality (65-75) must clear a higher confirmation bar
  // than a normal, well-evidenced read (§7).
  const categoriesRequired = evidenceQualityScore < MIN_EVIDENCE_QUALITY_FOR_NORMAL_GATING ? 5 : 4;

  const gates = {
    riskReward: riskReward != null && riskReward >= 2,
    volumeConfirms,
    htfAgrees,
    noContraryNews,
    liquidEnough,
    // Legacy names, now backed by the category count (was up to 8 correlated
    // booleans requiring >=3; now up to 6 independent categories, requiring
    // 4 — or 5 when evidence quality is only marginal).
    agreeingSignals: agreeingCategories,
    agreeingRequired: categoriesRequired,
    agreeingCategories,
    confirmationCategories,
    structureOk,
    deepPullback,
    evidenceQualityOk,
    dataStatusOk,
    quoteFreshEnough,
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
      gates.evidenceQualityOk && gates.dataStatusOk && gates.quoteFreshEnough;
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

  const rawCloses = a._closes ?? [];
  const rawCandles = a._candles ?? [];
  // `atr` is already declared above in the trade-plan section (num(t.atr, ...)).

  let projectedBase = null;
  if (price != null) {
    const lrClose = rawCloses.length >= 3 ? linReg(rawCloses, 10) : null;
    const vwClose = rawCandles.length >= 3 ? vwmaClose(rawCandles, 10) : null;

    if (lrClose != null && vwClose != null) {
      projectedBase = lrClose * 0.6 + vwClose * 0.4;
    } else if (lrClose != null) {
      projectedBase = lrClose;
    } else if (vwClose != null) {
      projectedBase = vwClose;
    } else {
      // Fallback: original heuristic (no raw data available, e.g. in tests)
      const CONSERVATIVE_MULTIPLIER = 0.32;
      const atrPctForMove = atrPct != null ? atrPct : 2;
      const directionalEdge = clamp((directionalScore - 50) / 50, -1, 1);
      projectedBase = price * (1 + (directionalEdge * atrPctForMove * CONSERVATIVE_MULTIPLIER) / 100);
    }

    // RSI mean-reversion nudge (§4-RSI)
    if (rsi != null) {
      if (rsi > 72) projectedBase *= 1 - 0.0025;       // overbought: slight pullback bias
      else if (rsi > 65) projectedBase *= 1 - 0.0010;  // stretched: very mild
      else if (rsi < 30) projectedBase *= 1 + 0.0025;  // oversold: slight bounce bias
      else if (rsi < 40) projectedBase *= 1 + 0.0010;  // softening: very mild
    }

    // S/R anchor: if projection is within 0.75 ATR of a known level, snap to it.
    // Reason: NSE daily closes cluster at S/R more than at random in-between prices.
    const supportLevel = num(t.support);
    const resistanceLevel = num(t.resistance);
    const snapThreshold = (atr ?? price * 0.02) * 0.75;
    if (resistanceLevel != null && Math.abs(projectedBase - resistanceLevel) < snapThreshold) {
      projectedBase = resistanceLevel;
    } else if (supportLevel != null && Math.abs(projectedBase - supportLevel) < snapThreshold) {
      projectedBase = supportLevel;
    }

    // Hard clamp: one session rarely moves more than 1 ATR from the last close.
    const maxMove = atr ?? price * 0.03;
    projectedBase = clamp(projectedBase, price - maxMove, price + maxMove);
  }

  let base = projectedBase != null ? round2(projectedBase) : null;

  // sessionExpectedMovePct: what % move does our projection imply?
  const sessionExpectedMovePct = base != null && price != null && price > 0
    ? round2(((base - price) / price) * 100)
    : null;

  // Asymmetric predicted close ranges:
  // - If BULLISH: Expected range spans from current price up to price + ATR (no loss)
  // - If BEARISH: Expected range spans from price - ATR up to current price (no gain)
  // - If NEUTRAL: Symmetric range (±0.5 ATR) around projected base
  let bear = null;
  let bull = null;
  if (base != null && price != null) {
    const rangeHalfWidth = Math.max(atr ?? price * 0.01, price * 0.005) * 0.7; // tighter: 70% of ATR
    if (directionalOutlook === 'BULLISH') {
      bear = round2(price);                    // floor: won't close below current
      bull = round2(price + rangeHalfWidth * 2); // ceiling: up to ~1 ATR above
      if (base <= bear) base = round2(bear + (price * 0.001));
      if (bull <= base) bull = round2(base + (price * 0.001));
    } else if (directionalOutlook === 'BEARISH') {
      bear = round2(price - rangeHalfWidth * 2); // floor: down ~1 ATR
      bull = round2(price);                      // ceiling: won't close above current
      if (base >= bull) base = round2(bull - (price * 0.001));
      if (bear >= base) bear = round2(base - (price * 0.001));
    } else {
      bear = round2(base - rangeHalfWidth);
      bull = round2(base + rangeHalfWidth);
      if (bear >= base) bear = round2(base - (price * 0.001));
      if (bull <= base) bull = round2(base + (price * 0.001));
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
  if (tradeStatus === 'EXECUTABLE' && quote.stale === true) problems.push('executable trade with a stale quote');

  const validation = problems.length ? 'DATA/LOGIC VALIDATION FAILED' : 'OK';
  if (problems.length) tradeStatus = 'NO TRADE';

  const coverage = {
    currentPrice: price != null,
    todaysOhlcv: Boolean(t.lastVol || t.avgVolume20),
    intradayTrends5m15m1h: false, // not gathered anywhere in this app — see engine notes (§13)
    movingAverages: s20 != null && s50 != null && s200 != null,
    indicators: rsi != null && macdV != null && atr != null,
    supportResistance: num(t.support) != null && resistance != null,
    relativeStrengthVsNifty: relStrength != null,
    relativeStrengthVsSector: false,
    newsLast7d: n.available === true,
    earningsTrends: false,
    valuation: v.available === true,
    marketConditions: m.ok === true,
    bankNiftyIndiaVix: false,
    gapMomentum: false, // opening-gap/VWAP data is not gathered anywhere in this app
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
      relativeStrength: relStrength,
      news: newsScore,
      fundamentals: fundScore,
      marketSector: marketScore,
    },
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
