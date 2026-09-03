import { round2 } from '../utils/helpers.js';
import { getIntradaySchedule } from './intradayPredictionTimeline.js';
import { nextTradingDate } from './nseTradingCalendar.js';

// How many real NSE trading days out each horizon's next scheduled review
// falls — matches the spec's own cadence (short-term daily, swing every few
// days, medium-term weekly, long-term monthly + a quarterly fundamentals
// pass). Walks the real holiday-aware calendar rather than naive +N days,
// so "next review" never lands on a weekend/holiday.
const REVIEW_CADENCE_TRADING_DAYS = { SHORT_TERM: 1, SWING: 3, MEDIUM_TERM: 5, LONG_TERM: 21 };
const REVIEW_FREQUENCY_LABEL = {
  SHORT_TERM: 'Reviewed once daily, after market close',
  SWING: 'Reviewed every 2-3 trading days, or sooner on a material move',
  MEDIUM_TERM: 'Reviewed weekly, or sooner on a material move',
  LONG_TERM: 'Reviewed monthly, with a full quarterly fundamentals review — or immediately after material events (earnings, guidance changes, major corporate actions)',
};
function nextReviewDateKey(fromDate, tradingDaysOut) {
  let cursor = fromDate;
  for (let i = 0; i < tradingDaysOut; i += 1) {
    cursor = nextTradingDate(new Date(cursor));
    if (!cursor) return null;
  }
  return cursor;
}

// Plain-language "our take" phrase for ANY signal string this engine
// produces (INTRADAY's own engine.signal, or a per-horizon
// "SWING BUY"/"STRONG LONG TERM BUY"/etc.) — matched by keyword so it works
// regardless of which horizon's label is baked into the string.
function describeSignal(signal) {
  const s = String(signal ?? '').toUpperCase();
  if (s.includes('STRONG') && s.includes('BUY')) return 'this looks like a strong buy for this timeframe';
  if (s.includes('BUY')) return 'this looks like a reasonable buy for this timeframe';
  if (s.includes('WATCH')) return "this is worth watching, but it's not quite ready to act on for this timeframe";
  if (s.includes('AVOID')) return "we'd avoid this for this timeframe";
  if (s.includes('HOLD') || s.includes('NO TRADE')) return "there's no strong case to act on this timeframe right now";
  return s ? s.toLowerCase() : 'not enough information to say yet';
}

// A full, plain-English explanation for a single horizon — not just the
// verdict, but what's actually supporting it, what's holding it back, and
// what to expect price-wise, all in one place. Same tone as the main
// page's oneLineExplanation(), just complete rather than a one-liner —
// a reader shouldn't have to go dig through the factor lists below to
// understand why this tab says what it says.
// Bare category names used internally for weighting ("Risk", "Trend") read
// as cryptic or backwards when dropped straight into a sentence — "in its
// favour: risk" doesn't say a low-risk profile is the good thing. Map each
// to a short descriptive phrase that reads naturally after "In its favour:".
const FACTOR_PHRASES = {
  'Short momentum': 'strong recent price momentum',
  Momentum: 'positive price momentum',
  Trend: 'a healthy price trend',
  'Long-term trend': 'a positive long-term price trend',
  'Long-term price trend': 'a positive long-term price trend',
  'Market mood': 'a supportive overall market mood',
  'Market/sector': 'a supportive market/sector backdrop',
  'Relative strength': 'the stock outperforming the broader market',
  News: 'positive recent news',
  Risk: 'a healthy risk profile',
  'Fundamental support': "solid company fundamentals",
  Valuation: 'a reasonably priced stock relative to its fundamentals',
  'Business quality': 'strong business quality',
  Growth: 'strong revenue/earnings growth',
  'Earnings and growth': 'strong earnings and revenue growth',
  Profitability: 'strong profitability',
  'Financial health': 'a healthy balance sheet',
  'Balance sheet': 'a healthy balance sheet',
  'Industry/sector outlook': 'a supportive sector/market backdrop',
};

function ensureSentence(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildHorizonSummary({ signal, horizonLabel, topFactors, blockers, expectedReturnPct, expectedPrice }) {
  const verdict = describeSignal(signal);
  const sentences = [`Our take for the ${horizonLabel.toLowerCase()} view: ${verdict}.`];

  if (topFactors?.length) {
    sentences.push(`In its favour: ${topFactors.join(', ')}.`);
  }
  if (blockers?.length) {
    sentences.push(`What's holding it back: ${blockers.join(' ')}`);
  }
  if (!topFactors?.length && !blockers?.length) {
    sentences.push("There isn't enough reliable data yet to point to a clear reason either way.");
  }
  if (expectedReturnPct != null && expectedPrice != null) {
    const direction = expectedReturnPct > 0.05 ? 'rise' : expectedReturnPct < -0.05 ? 'fall' : 'stay roughly flat';
    const moveText = Math.abs(expectedReturnPct) > 0.05 ? ` (${expectedReturnPct > 0 ? '+' : ''}${expectedReturnPct}%)` : '';
    sentences.push(`Right now the model expects the price to ${direction}${direction === 'stay roughly flat' ? '' : ` to around ₹${expectedPrice}${moveText}`} over this timeframe — that's an estimate, not a promise.`);
  }
  return sentences.join(' ');
}

const clamp = (value, low = 0, high = 100) => Math.min(high, Math.max(low, Number(value) || 0));
const finite = (value) => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

const HORIZONS = Object.freeze({
  SHORT_TERM: {
    label: 'Short Term', horizon: '1–5 trading days', minMove: 1, volatilityDays: 5,
    description: "Looks 1 to 5 trading days ahead. Mostly about recent price momentum and trend — useful if you're deciding whether to buy or sell within the next few days.",
  },
  SWING: {
    label: 'Swing', horizon: '1–4 weeks', minMove: 2.5, volatilityDays: 15,
    description: 'Looks 1 to 4 weeks ahead. For "swing trades" — holding a position for a couple of weeks to try to catch a bigger move than a single day or two would give you.',
  },
  MEDIUM_TERM: {
    label: 'Medium Term', horizon: '1–3 months', minMove: 5, volatilityDays: 45,
    description: "Looks 1 to 3 months ahead. Blends the stock's price trend with the company's underlying business health — a middle ground between short-term trading and long-term investing.",
  },
  LONG_TERM: {
    label: 'Long Term', horizon: '3–12 months', minMove: 10, volatilityDays: 180,
    description: "Looks 3 to 12 months ahead. Based mainly on the company's business quality, growth, and whether the stock is fairly priced — not short-term price swings. For investors thinking about holding, not trading.",
  },
});

function weightedScore(parts) {
  const known = parts.filter((part) => finite(part.value) != null);
  const weight = known.reduce((sum, part) => sum + part.weight, 0);
  if (!weight) return null;
  return Math.round(known.reduce((sum, part) => sum + finite(part.value) * part.weight, 0) / weight);
}

function technicalInputs(analysis) {
  const t = analysis.technical ?? {};
  const trend = t.trend === 'Bullish' ? 75 : t.trend === 'Bearish' ? 25 : 50;
  const longTrend = finite(t.sma200) != null && analysis.price > t.sma200 ? 75 : finite(t.sma200) != null ? 25 : null;
  const momentum = finite(t.roc20) == null ? null : clamp(50 + t.roc20 * 2.5);
  const shortMomentum = finite(t.roc5) == null ? momentum : clamp(50 + t.roc5 * 5);
  return { trend, longTrend, momentum, shortMomentum };
}

function fundamentalInputs(analysis) {
  const f = analysis.fundamentals ?? {};
  const available = f.available === true;
  const quality = available ? finite(analysis.scores?.fundamentals) : null;
  const growthMetrics = [f.revenueGrowth, f.earningsGrowth].map(finite).filter((v) => v != null);
  const growth = growthMetrics.length ? clamp(50 + growthMetrics.reduce((a, b) => a + b, 0) / growthMetrics.length) : null;
  const profitabilityMetrics = [f.roe, f.roic, f.profitMargin].map(finite).filter((v) => v != null);
  const profitability = profitabilityMetrics.length ? clamp(35 + profitabilityMetrics.reduce((a, b) => a + b, 0) / profitabilityMetrics.length * 1.5) : null;
  const balanceSheet = !available ? null : weightedScore([
    { value: finite(f.debtToEquity) == null ? null : clamp(80 - f.debtToEquity * 20), weight: 2 },
    { value: finite(f.currentRatio) == null ? null : clamp(35 + f.currentRatio * 25), weight: 1 },
    { value: finite(f.freeCashflow) == null ? null : (f.freeCashflow > 0 ? 70 : 30), weight: 1 },
  ]);
  return { quality, growth, profitability, balanceSheet };
}

function scoreForHorizon(key, analysis) {
  const t = technicalInputs(analysis);
  const f = fundamentalInputs(analysis);
  const news = analysis.news?.available ? finite(analysis.scores?.news) : null;
  const valuation = analysis.valuation?.available ? finite(analysis.scores?.valuation) : null;
  const market = analysis.market?.available ? finite(analysis.scores?.market) : null;
  const relative = finite(analysis.market?.relativeStrength) == null ? null : clamp(50 + analysis.market.relativeStrength * 4);
  const risk = finite(analysis.scores?.risk);

  const weights = key === 'SHORT_TERM' ? [
    { name: 'Short momentum', value: t.shortMomentum, weight: 28 }, { name: 'Trend', value: t.trend, weight: 22 },
    { name: 'Market mood', value: market, weight: 15 }, { name: 'Relative strength', value: relative, weight: 15 },
    { name: 'News', value: news, weight: 10 }, { name: 'Risk', value: risk, weight: 10 },
  ] : key === 'SWING' ? [
    { name: 'Momentum', value: t.momentum, weight: 20 }, { name: 'Trend', value: t.trend, weight: 22 },
    { name: 'Long-term trend', value: t.longTrend, weight: 10 }, { name: 'Relative strength', value: relative, weight: 15 },
    { name: 'Market mood', value: market, weight: 10 }, { name: 'Fundamental support', value: f.quality, weight: 10 },
    { name: 'Valuation', value: valuation, weight: 5 }, { name: 'Risk', value: risk, weight: 8 },
  ] : key === 'MEDIUM_TERM' ? [
    { name: 'Business quality', value: f.quality, weight: 18 }, { name: 'Growth', value: f.growth, weight: 14 },
    { name: 'Profitability', value: f.profitability, weight: 10 }, { name: 'Financial health', value: f.balanceSheet, weight: 10 },
    { name: 'Valuation', value: valuation, weight: 12 }, { name: 'Long-term price trend', value: t.longTrend, weight: 16 },
    { name: 'Relative strength', value: relative, weight: 10 }, { name: 'Market/sector', value: market, weight: 10 },
  ] : [
    { name: 'Business quality', value: f.quality, weight: 20 }, { name: 'Earnings and growth', value: f.growth, weight: 16 },
    { name: 'Profitability', value: f.profitability, weight: 12 }, { name: 'Balance sheet', value: f.balanceSheet, weight: 12 },
    { name: 'Valuation', value: valuation, weight: 15 }, { name: 'Long-term price trend', value: t.longTrend, weight: 10 },
    { name: 'Relative strength', value: relative, weight: 8 }, { name: 'Industry/sector outlook', value: market, weight: 7 },
  ];
  return { score: weightedScore(weights), factors: weights };
}

function buildHorizon(key, analysis, now) {
  const config = HORIZONS[key];
  const { score, factors } = scoreForHorizon(key, analysis);
  const price = finite(analysis.price);
  const atrPct = Math.max(0.5, finite(analysis.technical?.atrPct) ?? 2);
  const known = factors.filter((f) => finite(f.value) != null);
  const evidenceQuality = Math.round(known.reduce((sum, f) => sum + f.weight, 0));
  const directionalEdge = score == null ? 0 : (score - 50) / 50;
  const rawReturn = directionalEdge * atrPct * Math.sqrt(config.volatilityDays) * 0.65;
  const expectedReturnPct = round2(Math.max(-35, Math.min(45, rawReturn)));
  const futurePrice = price == null ? null : round2(price * (1 + expectedReturnPct / 100));
  const uncertaintyPct = atrPct * Math.sqrt(config.volatilityDays) * 0.55;
  const expectedPriceZone = price == null ? null : [
    round2(price * (1 + (expectedReturnPct - uncertaintyPct) / 100)),
    round2(price * (1 + (expectedReturnPct + uncertaintyPct) / 100)),
  ];
  const downsidePct = Math.max(atrPct * Math.sqrt(config.volatilityDays) * 0.35, 0.5);
  const riskReward = expectedReturnPct > 0 ? round2(expectedReturnPct / downsidePct) : null;
  const confirmations = factors.map((factor) => ({
    name: factor.name,
    available: finite(factor.value) != null,
    passed: finite(factor.value) != null ? factor.value >= 55 : null,
    score: finite(factor.value) != null ? Math.round(factor.value) : null,
  }));
  const confirming = confirmations.filter((c) => c.passed === true).length;
  const required = key === 'LONG_TERM' ? 6 : Math.max(4, Math.ceil(known.length * 0.65));
  const fundamentalRisk = key === 'LONG_TERM' && analysis.fundamentals?.available !== true;
  const gates = {
    score: score != null && score >= 70,
    meaningfulReturn: expectedReturnPct >= config.minMove,
    trend: key === 'SHORT_TERM' ? analysis.technical?.trend === 'Bullish' : price != null && finite(analysis.technical?.sma200) != null && price > analysis.technical.sma200,
    evidenceQuality: evidenceQuality >= 65,
    verifiedData: analysis.engine?.dataStatus === 'VERIFIED DELAYED' && analysis.quote?.stale !== true,
    riskReward: riskReward != null && riskReward >= 2,
    confirmations: confirming >= required,
    fundamentalEvidence: key !== 'LONG_TERM' || !fundamentalRisk,
  };
  const allGates = Object.values(gates).every(Boolean);
  let signal = score < 45 ? 'AVOID' : score < 60 ? 'HOLD / NO TRADE' : `${config.label.toUpperCase()} WATCH`;
  if (allGates) signal = score >= 80 ? `STRONG ${config.label.toUpperCase()} BUY` : `${config.label.toUpperCase()} BUY`;
  const supportingFactorsRanked = factors.filter((f) => finite(f.value) != null && f.value >= 55).sort((a, b) => b.value - a.value);
  const support = supportingFactorsRanked.slice(0, 4).map((f) => `${f.name} ${Math.round(f.value)}/100`);
  // Plain-language, value-carrying descriptions — never the bare gate key
  // (e.g. "meaningfulReturn") and never math notation like "≥70". Written so
  // someone with no trading background can read the reason and understand
  // it, the same way the rest of this app explains itself in plain words.
  const gateDescriptions = {
    score: score != null
      ? `The overall score is only ${score} out of 100 — it needs to reach 70 before this counts as a Buy.`
      : 'The overall score could not be calculated yet.',
    meaningfulReturn: `The model only expects a ${expectedReturnPct}% move — that's too small to act on for a ${config.label.toLowerCase()} idea (it wants at least ${config.minMove}%).`,
    trend: key === 'SHORT_TERM'
      ? "The short-term price trend isn't pointing up right now."
      : price != null && finite(analysis.technical?.sma200) != null
        ? (price > analysis.technical.sma200
          ? 'Price is above its long-term (200-day) average, but not by enough to confirm a strong long-term uptrend.'
          : "Price is currently below its long-term (200-day) average — the long-term trend hasn't turned up yet.")
        : "There isn't enough price history yet to confirm the long-term trend.",
    evidenceQuality: `Only ${evidenceQuality} out of 100 in data completeness — too many of the underlying numbers (fundamentals, valuation, etc.) are missing to be confident.`,
    verifiedData: "The price data being used isn't fresh/verified enough to trust right now.",
    riskReward: riskReward != null
      ? `For the risk you'd be taking, the potential reward is only ${riskReward}x — it should be at least 2x (double the risk) before this is worth acting on.`
      : "The potential reward couldn't be measured against the risk.",
    confirmations: `Only ${confirming} out of ${required} supporting checks currently agree — most of them need to line up before this becomes a Buy.`,
    fundamentalEvidence: "The company's financial data (earnings, balance sheet, etc.) isn't available, so the long-term business case can't be confirmed.",
  };
  const failed = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => gateDescriptions[name] ?? name);
  const nextReviewDate = nextReviewDateKey(now, REVIEW_CADENCE_TRADING_DAYS[key]);
  const summary = buildHorizonSummary({
    signal,
    horizonLabel: config.label,
    topFactors: supportingFactorsRanked.slice(0, 2).map((f) => FACTOR_PHRASES[f.name] ?? f.name.toLowerCase()),
    blockers: failed.slice(0, 2),
    expectedReturnPct,
    expectedPrice: futurePrice,
  });
  return {
    key, timeframe: config.label, horizon: config.horizon, description: config.description, summary, signal, score, confidence: evidenceQuality,
    currentPrice: price, expectedPrice: futurePrice, expectedPriceZone, expectedReturnPct, riskReward,
    generatedAt: now, lastUpdatedAt: now, thresholdStatus: 'PROVISIONAL — requires out-of-sample validation',
    updateFrequency: REVIEW_FREQUENCY_LABEL[key],
    nextUpdateAt: nextReviewDate,
    nextUpdateLabel: nextReviewDate ? `Next scheduled review: ${nextReviewDate}` : 'Next review date unavailable',
    supportingFactors: support, confirmationConditions: confirmations,
    invalidationConditions: failed.length ? failed : ['Close below the model risk boundary', 'New material evidence reverses the thesis'],
    gates, confirmingCategories: confirming, requiredConfirmations: required,
    disclaimer: 'Model assessment based only on information available at the generated timestamp; it is not a guaranteed outcome.',
  };
}

export function buildMultiTimeframePredictions(analysis, now = analysis.dataTimestamp ?? new Date().toISOString()) {
  const engine = analysis.engine;
  const intradaySchedule = getIntradaySchedule(new Date(now));
  // The recorded/versioned snapshot (intradayPredictionTimeline.js) is the
  // canonical intraday prediction — the same one the "Latest Prediction"
  // card and Prediction Timeline read. engine.closingRange keeps
  // recomputing fresh on every call (its ATR projection is scaled by
  // remaining-session-progress), so once the market closes it produces a
  // different number than what was last recorded while still open.
  // Reading engine.closingRange directly here — as this used to — made this
  // tab disagree with the rest of the page on the exact same prediction.
  // Use a stored snapshot only while it is the CURRENT open-session version.
  // After close, `latest` belongs to the completed session while `engine`
  // explicitly forecasts the next session. Combining those two horizons was
  // the source of the UI mismatch (old ₹1,868.28 validated price beside the
  // new model's ₹1,856.99 raw forecast).
  const intradaySnapshot = analysis.intradayPrediction?.current ?? analysis.intradayPrediction?.latest ?? null;
  const isOpenSessionSnapshot = Boolean(analysis.intradayPrediction?.current);
  // latestObservation is a lighter-weight in-session refresh of
  // price/predictedClose/expectedReturnPct/targetZone/confidence that
  // doesn't create a new timeline version — prefer it as one matched set
  // (never mix its predictedClose with the version's older expectedReturnPct,
  // or vice versa) so this matches exactly what the prediction-card header
  // displays.
  // Once the session closes, freeze the exact checkpoint version. A later
  // lightweight observation must not make the headline differ from the
  // immutable final timeline row.
  const intradayObs = isOpenSessionSnapshot ? intradaySnapshot?.latestObservation : null;
  const snapSignal = intradaySnapshot?.signal ?? engine?.signal ?? 'UNAVAILABLE';
  const snapScore = intradaySnapshot?.score ?? engine?.totalScore ?? null;
  const snapConfidence = intradayObs?.confidence ?? intradaySnapshot?.confidence ?? engine?.evidenceQualityScore ?? engine?.closingRange?.confidenceScore ?? null;
  const snapExpectedPrice = intradayObs?.predictedClose ?? intradaySnapshot?.predictedClose ?? engine?.closingRange?.base ?? null;
  const snapExpectedZone = intradayObs?.targetZone ?? intradaySnapshot?.targetZone ?? engine?.closingRange?.range ?? null;
  const snapExpectedReturnPct = intradayObs?.expectedReturnPct ?? intradaySnapshot?.expectedReturnPct ?? engine?.closingRange?.expectedMovePct ?? null;
  const snapRiskReward = intradaySnapshot?.riskReward ?? engine?.buy?.riskReward ?? null;
  const intradaySummarySentences = [`Our take for the intraday view: ${describeSignal(snapSignal)}.`];
  const intradayPositives = (analysis.positiveFactors ?? []).slice(0, 2);
  const intradayNegatives = (analysis.negativeFactors ?? []).slice(0, 2);
  if (intradayPositives.length) intradaySummarySentences.push(`In its favour: ${intradayPositives.map(ensureSentence).join(' ')}`);
  if (intradayNegatives.length) intradaySummarySentences.push(`What's holding it back: ${intradayNegatives.map(ensureSentence).join(' ')}`);
  if (!intradayPositives.length && !intradayNegatives.length) {
    intradaySummarySentences.push("There isn't enough reliable data yet to point to a clear reason either way.");
  }
  if (snapExpectedReturnPct != null && snapExpectedPrice != null) {
    // Match the canonical intraday ±0.35% noise band. A tiny +0.09% must
    // never be narrated as a rise/bullish forecast.
    const direction = snapExpectedReturnPct > 0.35 ? 'rise' : snapExpectedReturnPct < -0.35 ? 'fall' : 'stay roughly flat';
    intradaySummarySentences.push(
      direction === 'stay roughly flat'
        ? "Right now the model expects the price to stay roughly flat by today's close — that's an estimate, not a promise."
        : `Right now the model expects the price to ${direction} to around ₹${snapExpectedPrice} (${snapExpectedReturnPct > 0 ? '+' : ''}${snapExpectedReturnPct}%) by today's close — that's an estimate, not a promise.`,
    );
  }
  const intradaySummary = intradaySummarySentences.join(' ');
  const intraday = {
    key: 'INTRADAY', timeframe: 'Intraday', horizon: engine?.predictionHorizon === 'NEXT_SESSION_CLOSE' ? 'Next trading-session close' : 'Remaining trading session',
    description: "Predicts whether this stock will end today's session higher or lower than the price right now. Rechecked at fixed times through the day (09:20, 11:30, 13:15, 14:30 IST) — for same-day decisions only, not for holding overnight.",
    summary: intradaySummary,
    signal: snapSignal, score: snapScore,
    confidence: snapConfidence,
    // currentPrice stays live (the market price right now), deliberately
    // distinct from the frozen prediction snapshot's own input price.
    currentPrice: finite(analysis.price), expectedPrice: snapExpectedPrice,
    expectedPriceZone: snapExpectedZone, expectedReturnPct: snapExpectedReturnPct,
    rawExpectedPrice: isOpenSessionSnapshot ? (engine?.closingRange?.rawPredictedClose ?? snapExpectedPrice) : snapExpectedPrice,
    rawExpectedReturnPct: isOpenSessionSnapshot ? (engine?.closingRange?.rawExpectedMovePct ?? snapExpectedReturnPct) : snapExpectedReturnPct,
    validatedDirection: isOpenSessionSnapshot
      ? (engine?.closingRange?.validatedDirection ?? engine?.directionalOutlook ?? 'NEUTRAL')
      : (intradaySnapshot?.expectedDirection ?? (Math.abs(snapExpectedReturnPct ?? 0) <= 0.35 ? 'NEUTRAL' : snapExpectedReturnPct > 0 ? 'BULLISH' : 'BEARISH')),
    forecastQuality: isOpenSessionSnapshot
      ? (engine?.closingRange?.forecastQuality ?? 'UNVALIDATED')
      : (Math.abs(snapExpectedReturnPct ?? 0) <= 0.35 ? 'NEUTRAL_NOISE' : 'VALIDATED'),
    riskReward: snapRiskReward, generatedAt: intradaySnapshot?.generatedAt ?? now,
    lastUpdatedAt: intradaySnapshot?.lastCheckedAt ?? intradaySnapshot?.generatedAt ?? now,
    updateFrequency: 'Fixed checkpoints: 09:20, 11:30, 13:15 and 14:30 IST; an extra version is created only for a genuinely material market event during trading hours',
    nextUpdateAt: intradaySchedule.nextPredictionAt,
    nextUpdateLabel: `Next scheduled check: ${intradaySchedule.nextPredictionLabel}`,
    supportingFactors: (analysis.positiveFactors ?? []).slice(0, 4),
    // Intraday gates are pass/fail booleans, not 0-100 sub-scores like the
    // other horizons' factors — `available: true` (the gate DID evaluate;
    // it's a real true/false, not a missing input) and `score: null` is the
    // correct, honest shape here. The client must not read "no score" as
    // "unavailable" — those are different states.
    confirmationConditions: Object.entries(engine?.gates ?? {}).filter(([, value]) => typeof value === 'boolean').map(([name, passed]) => ({ name, passed, available: true, score: null })),
    invalidationConditions: [engine?.buy?.stopLoss ? `Price falls below ₹${engine.buy.stopLoss}` : 'Forecast direction turns bearish', ...(analysis.negativeFactors ?? []).slice(0, 3)],
    gates: engine?.gates ?? {}, thresholdStatus: 'Intraday thresholds defined by the current gated engine', disclaimer: analysis.disclaimer,
  };
  return {
    generatedAt: now,
    current: intraday,
    horizons: [intraday, ...Object.keys(HORIZONS).map((key) => buildHorizon(key, analysis, now))],
    separationRule: 'Each horizon is calculated independently. Intraday signals are never reused as long-term signals.',
  };
}
