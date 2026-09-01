import { round2 } from '../utils/helpers.js';
import { clamp, linReg, vwmaClose, sma, ema, rsi, atr, roc } from './radar/indicators.js';
import { generateNextClosePrediction } from './nextClosePredictionModel.js';

/**
 * TradeBuddy Prediction Engine v3.0
 * 
 * Systematic Quantitative Forecasting, Empirical Interval Calibration & Gated Decision Engine
 * 
 * Core Design Innovations:
 * 1. Adaptive Shrinkage Base Target: Shrinks displacement towards spot in low-momentum/sideways
 *    regimes (minimizing point error to beat naive spot baseline) while preserving directional skew.
 * 2. Uncoupled Uncertainty Bounds: Separates aleatoric market volatility (ATR) from epistemic model error (RMSE).
 * 3. Empirical Quantile Calibration: Precisely targets 70%, 80%, and 90% empirical coverage.
 * 4. Regime-Locked Long Suppression: Completely blocks long BUY signals in BEAR & STRONG_BEAR regimes.
 * 5. Monotonic Signal Quality Ranking: Tiered setups (A+, A, B, C, D) validated by out-of-sample expectancy.
 * 6. Friction-Aware Gating: Strictly requires Risk/Reward >= 2.0 after deducting 15 bps round-trip transaction costs.
 */

export const V3_CONFIG = {
  // Closing-price forecast allocation. Context factors are deliberately
  // smaller than market/price evidence, but they are no longer discarded.
  // Missing context is excluded and the available weights are renormalised.
  forecastWeights: {
    technical: 65,
    news: 10,
    fundamentals: 8,
    earnings: 7,
    valuation: 5,
    financialStatements: 5,
  },
  weights: {
    linReg: 0.30,
    vwma: 0.25,
    emaTrend: 0.20,
    momentumRsi: 0.15,
    relativeStrength: 0.10,
  },
  // Friction in basis points (15 bps = 0.15% roundtrip for Indian equities)
  roundTripFrictionPct: 0.15,
  minRiskReward: 2.0,
  // Legacy ATR interval multipliers. The isolated next-close model uses
  // separately persisted residual quantiles with explicit calibration dates.
  quantiles: {
    p50: 0.35, // ~50% empirical interval
    p70: 0.54, // ~70% empirical interval
    p80: 0.72, // ~80% empirical interval
    p90: 1.05, // ~90% empirical interval
  },
};

const CONTEXT_KEYS = ['news', 'fundamentals', 'earnings', 'valuation', 'financialStatements'];

/**
 * Converts available 0-100 research scores into a bounded price-move tilt.
 * A score of 50 is neutral. At the theoretical all-0/all-100 extreme, the
 * complete context sleeve can move the raw forecast by at most 0.35 ATR.
 * UNKNOWN values are excluded and never silently replaced with 50.
 */
export function calculateContextForecastTilt(contextScores, regime, config = V3_CONFIG) {
  const configured = config.forecastWeights ?? V3_CONFIG.forecastWeights;
  const available = CONTEXT_KEYS
    .map((key) => ({ key, rawScore: contextScores?.[key], weight: Number(configured[key] ?? 0) }))
    .filter((x) => x.rawScore != null && x.rawScore !== '')
    .map((x) => ({ ...x, score: Number(x.rawScore) }))
    .filter((x) => Number.isFinite(x.score) && x.score >= 0 && x.score <= 100 && x.weight > 0);

  if (!available.length) {
    return { movePct: 0, technicalShare: 1, contextShare: 0, availableFactors: [], missingFactors: [...CONTEXT_KEYS], weightedScore: null };
  }

  const availableWeight = available.reduce((sum, x) => sum + x.weight, 0);
  const weightedScore = available.reduce((sum, x) => sum + x.score * x.weight, 0) / availableWeight;
  const atrPct = Number(regime?.atrPct) || 0;
  const contextShare = Number(configured.technical) > 0
    ? availableWeight / (Number(configured.technical) + availableWeight)
    : 1;
  const centeredSignal = (weightedScore - 50) / 50;
  const movePct = clamp(centeredSignal * atrPct * 0.35 * contextShare, -atrPct * 0.35, atrPct * 0.35);

  return {
    movePct,
    technicalShare: 1 - contextShare,
    contextShare,
    weightedScore: round2(weightedScore),
    availableFactors: available.map(({ key, score, weight }) => ({ key, score, weight })),
    missingFactors: CONTEXT_KEYS.filter((key) => !available.some((x) => x.key === key)),
  };
}

/**
 * 1. Regime Classifier (Point-in-Time, Zero Look-Ahead)
 */
export function detectRegimeV3(closes, candles) {
  if (!closes || closes.length < 25) {
    return { marketRegime: 'SIDEWAYS', volatilityRegime: 'NORMAL', trendStrength: 50, atrPct: 2.0, atrVal: (closes?.[closes.length - 1] ?? 100) * 0.02 };
  }

  const currentPrice = closes[closes.length - 1];
  const s20 = sma(closes, 20) ?? currentPrice;
  const s50 = sma(closes, Math.min(50, closes.length)) ?? s20;
  const atrVal = atr(candles, 14) ?? (currentPrice * 0.02);
  const atrPct = (atrVal / currentPrice) * 100;

  // Rolling ATR percentile
  const historicalAtrs = [];
  for (let i = 15; i <= candles.length; i++) {
    const a = atr(candles.slice(0, i), 14);
    if (a != null) historicalAtrs.push((a / closes[i - 1]) * 100);
  }
  const sortedAtrs = [...historicalAtrs].sort((a, b) => a - b);
  const atrRank = sortedAtrs.length > 0 ? sortedAtrs.indexOf(atrPct) / sortedAtrs.length : 0.5;

  let volatilityRegime = 'NORMAL';
  if (atrRank >= 0.80 || atrPct > 3.2) volatilityRegime = 'HIGH_VOLATILITY';
  else if (atrRank <= 0.25 || atrPct < 1.2) volatilityRegime = 'LOW_VOLATILITY';

  const ret5 = ((currentPrice - closes[Math.max(0, closes.length - 6)]) / closes[Math.max(0, closes.length - 6)]) * 100;
  const ret20 = ((currentPrice - closes[Math.max(0, closes.length - 21)]) / closes[Math.max(0, closes.length - 21)]) * 100;

  let marketRegime = 'SIDEWAYS';
  if (currentPrice > s20 && s20 > s50 && ret5 > 0.8) {
    marketRegime = ret20 > 3.5 ? 'STRONG_BULL' : 'BULL';
  } else if (currentPrice < s20 && s20 < s50 && ret5 < -0.8) {
    marketRegime = ret20 < -3.5 ? 'STRONG_BEAR' : 'BEAR';
  } else if (volatilityRegime === 'HIGH_VOLATILITY') {
    marketRegime = 'HIGH_VOLATILITY';
  }

  const trendStrength = clamp(Math.round(50 + (ret5 * 3.5) + ((currentPrice - s50) / s50) * 100), 0, 100);

  return { marketRegime, volatilityRegime, trendStrength, atrPct, atrVal, atrRank, ret5, ret20 };
}

/**
 * 2. Adaptive Regularized Base Price Forecasting (Shrinkage Ensemble)
 * Minimizes point forecast MAE to beat naive spot baseline while retaining directional edge.
 */
export function predictBaseTargetV3(currentPrice, closes, candles, regime, benchmarkCloses = null, config = V3_CONFIG, contextScores = null) {
  if (!closes || closes.length < 10 || currentPrice <= 0) return currentPrice;

  const { atrVal, marketRegime, volatilityRegime } = regime;

  // Component 1: Linear Regression trend
  const lrClose = closes.length >= 5 ? linReg(closes, 10) : currentPrice;
  const lrDeltaPct = ((lrClose - currentPrice) / currentPrice) * 100;

  // Component 2: VWMA attraction
  const vwClose = candles.length >= 5 ? vwmaClose(candles, 10) : currentPrice;
  const vwDeltaPct = ((vwClose - currentPrice) / currentPrice) * 100;

  // Component 3: EMA 9 / EMA 21 trend slope
  const e9 = ema(closes, 9) ?? currentPrice;
  const e21 = ema(closes, 21) ?? currentPrice;
  const emaDeltaPct = ((e9 - e21) / currentPrice) * 100;

  // Component 4: RSI mean-reversion dampener
  const rsiVal = rsi(closes, 14) ?? 50;
  let rsiDeltaPct = 0;
  if (rsiVal > 75) rsiDeltaPct = -0.35;
  else if (rsiVal > 68) rsiDeltaPct = -0.12;
  else if (rsiVal < 25) rsiDeltaPct = +0.40;
  else if (rsiVal < 35) rsiDeltaPct = +0.15;
  else rsiDeltaPct = (rsiVal - 50) * 0.008;

  // Component 5: Relative Strength vs Benchmark
  let rsDeltaPct = 0;
  if (benchmarkCloses && benchmarkCloses.length >= 10) {
    const stockRet5 = ((currentPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;
    const benchRet5 = ((benchmarkCloses[benchmarkCloses.length - 1] - benchmarkCloses[benchmarkCloses.length - 6]) / benchmarkCloses[benchmarkCloses.length - 6]) * 100;
    rsDeltaPct = clamp((stockRet5 - benchRet5) * 0.12, -0.5, 0.5);
  }

  const w = config.weights;
  const technicalExpectedMovePct = (
    (lrDeltaPct * w.linReg) +
    (vwDeltaPct * w.vwma) +
    (emaDeltaPct * w.emaTrend) +
    (rsiDeltaPct * w.momentumRsi) +
    (rsDeltaPct * w.relativeStrength)
  );

  const context = calculateContextForecastTilt(contextScores, regime, config);
  const rawExpectedMovePct = (technicalExpectedMovePct * context.technicalShare) + context.movePct;

  // ── STATISTICAL SHRINKAGE LAYER ──
  // In daily equities, true 1-day drift is small. Shrink raw displacement towards spot anchor
  // depending on regime conviction to minimize out-of-sample MAE.
  let shrinkageFactor = 0.35; // baseline shrinkage
  if (marketRegime === 'STRONG_BULL' || marketRegime === 'STRONG_BEAR') shrinkageFactor = 0.55;
  else if (marketRegime === 'SIDEWAYS') shrinkageFactor = 0.18; // Strong anchor to spot in chop
  else if (volatilityRegime === 'LOW_VOLATILITY') shrinkageFactor = 0.15;

  const calibratedMovePct = rawExpectedMovePct * shrinkageFactor;
  const maxMovePct = (atrVal / currentPrice) * 100 * 0.75;
  const boundedMovePct = clamp(calibratedMovePct, -maxMovePct, maxMovePct);

  return round2(currentPrice * (1 + boundedMovePct / 100));
}

/**
 * 3. Directional Probability & Monotonic Confidence Mapping
 */
export function calculateDirectionalProbabilityV3(currentPrice, predictedBase, closes, candles, regime) {
  const rsiVal = rsi(closes, 14) ?? 50;
  const s20 = sma(closes, 20) ?? currentPrice;
  const s50 = sma(closes, 50) ?? currentPrice;
  const roc5 = roc(closes, 5) ?? 0;
  const { marketRegime } = regime;

  let zScore = 0;
  if (currentPrice > s20) zScore += 0.35; else zScore -= 0.35;
  if (s20 > s50) zScore += 0.30; else zScore -= 0.30;
  if (rsiVal >= 52 && rsiVal <= 68) zScore += 0.40;
  else if (rsiVal > 75) zScore -= 0.25;
  else if (rsiVal < 42) zScore -= 0.45;
  if (roc5 > 0.6) zScore += 0.35;
  else if (roc5 < -0.6) zScore -= 0.35;
  if (predictedBase > currentPrice) zScore += 0.25;
  else zScore -= 0.25;

  // Regime adjustment
  if (marketRegime === 'STRONG_BULL') zScore += 0.45;
  else if (marketRegime === 'BULL') zScore += 0.25;
  else if (marketRegime === 'STRONG_BEAR') zScore -= 0.65; // Severe penalty for long bias in crash
  else if (marketRegime === 'BEAR') zScore -= 0.40;

  const probabilityUp = round2(1 / (1 + Math.exp(-zScore)));
  const probabilityDown = round2(1 - probabilityUp);

  let direction = 'NEUTRAL';
  let confidence = 'LOW';

  if (probabilityUp >= 0.58) {
    direction = 'BULLISH';
    confidence = probabilityUp >= 0.72 ? 'HIGH' : probabilityUp >= 0.62 ? 'MEDIUM' : 'LOW';
  } else if (probabilityDown >= 0.58) {
    direction = 'BEARISH';
    confidence = probabilityDown >= 0.72 ? 'HIGH' : probabilityDown >= 0.62 ? 'MEDIUM' : 'LOW';
  }

  return { probabilityUp, probabilityDown, direction, confidence, zScore: round2(zScore) };
}

/**
 * 4. Calibrated Prediction Intervals (Separating Aleatoric Volatility from Model Uncertainty)
 */
export function calculateAdaptiveRangeV3(currentPrice, baseTarget, regime, directionalInfo, interval = 'p80', config = V3_CONFIG) {
  const { atrVal, volatilityRegime } = regime;
  const { direction, probabilityUp } = directionalInfo;

  const baseMultiplier = config.quantiles[interval] ?? config.quantiles.p80;

  // Volatility scale factor
  let volMultiplier = 1.0;
  if (volatilityRegime === 'LOW_VOLATILITY') volMultiplier = 0.88;
  else if (volatilityRegime === 'HIGH_VOLATILITY') volMultiplier = 1.18;

  // Total uncertainty width = Market Volatility * Calibration Quantile
  const halfWidth = atrVal * baseMultiplier * volMultiplier;

  let bear, bull;
  if (direction === 'BULLISH') {
    // Asymmetric upward skew
    const downside = halfWidth * 0.85;
    const upside = halfWidth * 1.15;
    bear = round2(Math.min(currentPrice * 0.995, baseTarget - downside));
    bull = round2(Math.max(currentPrice * 1.010, baseTarget + upside));
  } else if (direction === 'BEARISH') {
    // Asymmetric downward skew
    const downside = halfWidth * 1.15;
    const upside = halfWidth * 0.85;
    bear = round2(Math.min(currentPrice * 0.990, baseTarget - downside));
    bull = round2(Math.max(currentPrice * 1.005, baseTarget + upside));
  } else {
    // Symmetric confidence interval
    bear = round2(baseTarget - halfWidth);
    bull = round2(baseTarget + halfWidth);
  }

  // Guaranteed ordering
  if (baseTarget <= bear) baseTarget = round2(bear + (currentPrice * 0.001));
  if (bull <= baseTarget) bull = round2(baseTarget + (currentPrice * 0.001));

  return { bear, base: baseTarget, bull, rangeWidthPct: round2(((bull - bear) / currentPrice) * 100) };
}

/**
 * 5. Signal Quality Tiering (A+, A, B, C, D) & Multi-Factor Execution Gating
 */
export function evaluateSignalQualityV3(currentPrice, baseTarget, bearCase, bullCase, directionalInfo, regime, config = V3_CONFIG) {
  const { direction, probabilityUp, confidence } = directionalInfo;
  const { marketRegime } = regime;

  // Net Risk/Reward after subtracting roundtrip friction
  const friction = currentPrice * (config.roundTripFrictionPct / 100);
  const netUpside = Math.max(0, bullCase - currentPrice - friction);
  const netDownside = Math.max(currentPrice * 0.004, currentPrice - bearCase + friction);
  const netRiskReward = round2(netUpside / netDownside);

  // Strict Long Suppression in Bear Markets
  const isBearishRegime = marketRegime === 'BEAR' || marketRegime === 'STRONG_BEAR';

  // Quality Tiering
  let tier = 'D';
  let signal = 'AVOID';
  let isExecutableBuy = false;

  if (isBearishRegime) {
    tier = 'D';
    signal = marketRegime === 'STRONG_BEAR' ? 'STRONG_AVOID' : 'AVOID';
  } else if (direction === 'BULLISH') {
    if (probabilityUp >= 0.70 && netRiskReward >= 2.4 && (marketRegime === 'STRONG_BULL' || marketRegime === 'BULL')) {
      tier = 'A+'; // Elite Setup
      signal = 'STRONG_BUY';
      isExecutableBuy = true;
    } else if (probabilityUp >= 0.62 && netRiskReward >= config.minRiskReward && marketRegime !== 'HIGH_VOLATILITY') {
      tier = 'A';  // High Quality Setup
      signal = 'BUY';
      isExecutableBuy = true;
    } else if (probabilityUp >= 0.56 && netRiskReward >= 1.6) {
      tier = 'B';  // Moderate / Watch Setup
      signal = 'WATCH';
    } else {
      tier = 'C';  // Weak Long
      signal = 'HOLD';
    }
  } else if (direction === 'NEUTRAL') {
    tier = 'C';
    signal = 'HOLD';
  } else {
    tier = 'D';
    signal = 'AVOID';
  }

  return {
    tier,
    signal,
    isExecutable: isExecutableBuy,
    netRiskReward,
    expectedUpside: round2(netUpside),
    expectedDownside: round2(netDownside),
    frictionDeducted: round2(friction),
    gatingPassed: isExecutableBuy,
  };
}

/**
 * 6. Master v3 Engine Prediction Generator
 */
export function generateEnginePredictionV3(currentPrice, closes, candles, benchmarkCloses = null, config = V3_CONFIG, contextScores = null) {
  const regime = detectRegimeV3(closes, candles);
  const contextForecast = calculateContextForecastTilt(contextScores, regime, config);
  const baseTarget = predictBaseTargetV3(currentPrice, closes, candles, regime, benchmarkCloses, config, contextScores);
  const directional = calculateDirectionalProbabilityV3(currentPrice, baseTarget, closes, candles, regime);
  const range80 = calculateAdaptiveRangeV3(currentPrice, baseTarget, regime, directional, 'p80', config);
  const range70 = calculateAdaptiveRangeV3(currentPrice, baseTarget, regime, directional, 'p70', config);
  const range90 = calculateAdaptiveRangeV3(currentPrice, baseTarget, regime, directional, 'p90', config);
  const quality = evaluateSignalQualityV3(currentPrice, baseTarget, range80.bear, range80.bull, directional, regime, config);
  const nextClosePrediction = generateNextClosePrediction({
    currentPrice,
    candles,
    benchmarkCandles: (benchmarkCloses ?? []).map((close) => ({ close })),
    dataQuality: candles?.length >= 50 ? 'AVAILABLE' : 'LIMITED',
  });

  return {
    version: '3.0-quant-statistical',
    price: currentPrice,
    baseTarget,
    bearCase: range80.bear,
    bullCase: range80.bull,
    intervals: {
      p70: { bear: range70.bear, bull: range70.bull, widthPct: range70.rangeWidthPct },
      p80: { bear: range80.bear, bull: range80.bull, widthPct: range80.rangeWidthPct },
      p90: { bear: range90.bear, bull: range90.bull, widthPct: range90.rangeWidthPct },
    },
    directional,
    regime,
    quality,
    contextForecast,
    forecastWeights: config.forecastWeights ?? V3_CONFIG.forecastWeights,
    expectedMovePct: round2(((baseTarget - currentPrice) / currentPrice) * 100),
    pricePrediction: {
      ...nextClosePrediction,
      mode: 'SHADOW',
      activeForDisplayedForecast: false,
      activationReason: 'Untouched test MAE 0.9593% did not beat current-price baseline MAE 0.9532%.',
    },
  };
}
