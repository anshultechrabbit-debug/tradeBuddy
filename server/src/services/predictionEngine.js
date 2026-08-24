import { round2 } from '../utils/helpers.js';
import { clamp } from './radar/indicators.js';
import { isPastClose } from './officialClose.js';

const MODEL_VERSION = 'tradebuddy-engine-1.0';

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

export function buildEngineResult(a) {
  const t = a.technical ?? {};
  const n = a.news ?? {};
  const v = a.valuation ?? {};
  const m = a.market ?? {};
  const e = a.entry ?? {};
  const price = num(a.price);
  const unknown = [];

  // 1) Technical momentum (25)
  let momentum = 50;
  const rsi = num(t.rsi);
  const macd = t.macd ?? {};
  const macdV = num(macd.value);
  const macdS = num(macd.signal);
  const roc20 = num(t.roc20);
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 65) momentum += 20;
    else if (rsi > 65 && rsi <= 75) momentum += 12;
    else if (rsi > 75) momentum += 4;
    else if (rsi >= 35) momentum -= 10;
    else momentum -= 22;
  } else unknown.push('momentum(rsi)');
  if (macdV != null && macdS != null) momentum += macdV > macdS ? 15 : -15;
  else unknown.push('momentum(macd)');
  if (roc20 != null) momentum += roc20 > 0 ? 15 : -15;
  momentum = clamp(Math.round(momentum), 0, 100);

  // 2) Trend (20)
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

  // 3) Volume / price confirmation (15)
  let vol = 50;
  const volRatio = num(t.volumeRatio);
  const atrPct = num(t.atrPct);
  const avgVol = num(t.avgVolume20);
  if (volRatio != null) {
    if (volRatio >= 1.2) vol += 25;
    else if (volRatio >= 1.0) vol += 10;
    else if (volRatio <= 0.7) vol -= 25;
    else vol -= 10;
  } else unknown.push('volume');
  if (atrPct != null) {
    if (atrPct > 5) vol -= 15;
    else if (atrPct < 2) vol += 10;
  }
  if (avgVol != null) {
    if (avgVol < 100000) vol -= 15;
    else if (avgVol > 1000000) vol += 10;
  }
  vol = clamp(Math.round(vol), 0, 100);

  // 4) Relative strength vs NIFTY (sector RS unavailable → UNKNOWN)
  let relStrength = null;
  const rsNifty = num(m.relativeStrength);
  if (m.ok && rsNifty != null) relStrength = clamp(Math.round(50 + clamp(rsNifty, -25, 25) * 2), 0, 100);
  else unknown.push('relativeStrength');

  // 5) News — UNKNOWN if only duplicates / price-action noise
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

  // 6) Fundamentals — UNKNOWN when missing (never 50).
  // f.score (company-health) is architecturally always UNKNOWN in this app —
  // only a P/E snapshot exists (see scoreFundamentals in
  // stockAnalysisService.js), never revenue/margins/ROE/debt data. Averaging
  // it in with a `num(f.score, 50)` fallback used to silently blend a
  // phantom neutral 50 into every fundamentals sub-score whenever a P/E was
  // available — exactly the fabricated-neutral bug this file otherwise
  // guards against. The sub-score is valuation alone until real
  // company-health data exists.
  let fundScore = null;
  if (v.available === true) {
    fundScore = clamp(Math.round(num(v.score)), 0, 100);
    // A stale P/E snapshot (see MED-1) is still used — it's the best data
    // available — but it should cost some confidence, not be silently
    // treated as identical to a same-day read.
    if (v.stale === true) unknown.push('valuation(stale)');
  } else unknown.push('fundamentals');

  // 7) Market / sector
  let marketScore = null;
  if (m.ok === true) {
    marketScore = 50;
    if (m.regime === 'BULLISH') marketScore += 25;
    else if (m.regime === 'BEARISH') marketScore -= 25;
    marketScore = clamp(Math.round(marketScore), 0, 100);
  } else unknown.push('market');

  const raw = { momentum, trend, volume: vol, relStrength, news: newsScore, fundamentals: fundScore, market: marketScore };

  // Renormalise over KNOWN factors only.
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

  // Directional outlook — price-direction read only (BULLISH/NEUTRAL/BEARISH).
  // Deliberately never uses BUY/AVOID vocabulary: it must stay readable next
  // to a WATCH/WAIT/NO TRADE trading signal without contradicting it (see
  // SIGNAL LANGUAGE RULE below). Derived from trend + momentum only, not
  // from the score-band classification used for trade gating.
  const directionalScore = Math.round((trend + momentum) / 2);
  const directionalOutlook = directionalScore >= 60 ? 'BULLISH' : directionalScore <= 40 ? 'BEARISH' : 'NEUTRAL';

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
  const expectedMovePct = target1 != null && entryMid != null ? round2(((target1 - entryMid) / entryMid) * 100) : null;

  // ---- Gates (BUY discipline) ----
  const volumeConfirms = volRatio != null ? volRatio >= 1.1 : false;
  const htfAgrees = tr === 'Bullish';
  const noContraryNews = newsScore == null || newsScore >= 35;
  const liquidEnough = avgVol != null ? avgVol >= 100000 : false;
  const signals = [];
  if (price != null && s50 != null) signals.push(price > s50);
  if (s20 != null && s50 != null) signals.push(s20 > s50);
  if (macdV != null && macdS != null) signals.push(macdV > macdS);
  if (roc20 != null) signals.push(roc20 > 0);
  if (rsi != null) signals.push(rsi >= 45 && rsi <= 70);
  if (volRatio != null) signals.push(volRatio >= 1.1);
  if (relStrength != null) signals.push(relStrength >= 55);
  if (newsScore != null) signals.push(newsScore >= 55);
  const agreeing = signals.filter(Boolean).length;

  const gates = {
    riskReward: riskReward != null && riskReward >= 2,
    volumeConfirms,
    htfAgrees,
    noContraryNews,
    liquidEnough,
    agreeingSignals: agreeing,
    agreeingRequired: 3,
    structureOk,
    deepPullback,
  };

  // ---- Trade status ----
  let tradeStatus = 'NO TRADE';
  if (isAvoidClass) tradeStatus = 'NO TRADE';
  else if (classification === 'HOLD / NO TRADE') tradeStatus = 'NO TRADE';
  else if (isBuyClass) {
    const allGates =
      gates.riskReward && gates.volumeConfirms && gates.htfAgrees &&
      gates.noContraryNews && gates.liquidEnough && gates.agreeingSignals >= 3 &&
      gates.structureOk && !gates.deepPullback;
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
        expectedMovePct,
        maxAcceptableRisk: '1% of capital per trade (position-size so stop-loss loss ≤ 1% of book)',
        reasonSetupCouldFail: a.negativeFactors?.[0] ?? (unknown.length ? `Insufficient verified data: ${unknown.join(', ')}` : 'No clear failure trigger identified'),
        entryNote,
      }
    : null;

  // ---- Confidence = quality/completeness of EVIDENCE (not the score) ----
  const dataStatus = dataStatusFrom(a);
  let conf = 72;
  if (dataStatus === 'UNKNOWN') conf -= 28;
  else if (dataStatus === 'STALE') conf -= 16;
  else if (dataStatus === 'VERIFIED DELAYED') conf -= 6;
  conf -= unknown.length * 5;
  if (newsIndependent != null && newsMaterial === 0) conf -= 12;
  if (!liquidEnough) conf -= 8;
  const confidenceScore = clamp(Math.round(conf), 0, 100);

  // ---- Closing-range forecast (range, not a point) ----
  const base = a.expectedClose != null ? num(a.expectedClose) : (price != null ? round2(price * (1 + num(a.expectedPct, 0) / 100)) : null);
  let bull = null;
  let bear = null;
  if (base != null && atr != null) {
    bull = round2(base + atr * 0.5);
    bear = round2(base - atr * 0.5);
  } else if (base != null) {
    bull = round2(base * 1.01);
    bear = round2(base * 0.99);
  }
  const rangeOrdered = bear != null && base != null && bull != null && bear < base && base < bull;

  // ---- Consistency checks (spec §29) ----
  const problems = [];
  if (price == null) problems.push('current price missing');
  if (entryMid != null && stopLoss != null && !(stopLoss < entryMid)) problems.push('stop not below entry');
  if (entryMid != null && target1 != null && !(target1 > entryMid)) problems.push('target not above entry');
  if (tradeStatus === 'EXECUTABLE' && riskReward != null && riskReward < 2) problems.push('risk/reward below 1:2');
  if (target1 != null && target2 != null && !(target1 < target2)) problems.push('target1 not below target2');
  if (bear != null && base != null && bull != null && !rangeOrdered) problems.push('expected range not ordered bear<base<bull');
  if (tradeStatus === 'EXECUTABLE' && !isBuyClass) problems.push('executable trade without buy-class score');
  if (deepPullback && tradeStatus === 'EXECUTABLE') problems.push('deep pullback marked executable');

  const validation = problems.length ? 'DATA/LOGIC VALIDATION FAILED' : 'OK';
  if (problems.length) tradeStatus = 'NO TRADE';

  const coverage = {
    currentPrice: price != null,
    todaysOhlcv: Boolean(t.lastVol || t.avgVolume20),
    intradayTrends5m15m1h: false,
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
    gapMomentum: false,
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
    sessionOver: isPastClose(),
    closingRange: {
      bear,
      base: base != null ? round2(base) : null,
      bull,
      range: bear != null && bull != null ? [bear, bull] : null,
      expectedMovePct,
      confidence: a.confidence ?? 'LOW',
      confidenceScore,
      probability: 'NOT CALIBRATED',
      note: isPastClose()
        ? 'Today\'s session is already closed — this range is a next-session estimate (trend + momentum heuristic, capped ±2%), not today\'s forecast anymore.'
        : 'Experimental model estimate (trend + momentum heuristic, capped ±2%) — not backtested or historically calibrated. Not a guarantee of the exact close.',
    },
    newsIndependentEvents: newsIndependent,
    newsMaterialEvents: newsMaterial,
    validation,
    validationProblems: problems,
    coverage,
    disclaimer:
      'Algorithmic research signal using available market data and news. Not verified financial advice. Missing inputs are marked UNKNOWN and excluded from the score, never treated as neutral. Probability is NOT CALIBRATED in this build.',
  };
}

const WEIGHTS = {
  momentum: 25,
  trend: 20,
  volume: 15,
  relStrength: 10,
  news: 10,
  fundamentals: 10,
  market: 10,
};
