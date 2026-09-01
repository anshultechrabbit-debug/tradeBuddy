import { atr, clamp, ema, linReg, sma, vwmaClose } from './radar/indicators.js';
import { round2 } from '../utils/helpers.js';
import { dayKey, isMarketOpen, isPastClose } from './officialClose.js';

export const NEXT_CLOSE_CONFIG = Object.freeze({
  version: 'next-close-return-1.0',
  groupWeights: Object.freeze({
    priceMomentum: 30,
    trend: 20,
    volumeVwap: 15,
    volatility: 10,
    marketSector: 15,
    news: 10,
  }),
  shrinkage: 0.25,
  maxAtrMultiplier: 0.75,
  neutralDirectionBandPct: 0.15,
  intervalAtrMultipliers: Object.freeze({ p50: 0.35, p70: 0.54, p80: 0.72, p90: 1.05 }),
  residualQuantilesPct: Object.freeze({ p50: 0.79465, p70: 1.35843, p80: 1.66924, p90: 2.29273 }),
  calibrationMetadata: Object.freeze({
    period: '2026-06-23 to 2026-07-27',
    observations: 875,
    universeSize: 35,
    untouchedTestPeriod: '2026-07-28 to 2026-08-31',
  }),
});

const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const pctReturn = (from, to) => from > 0 && finite(to) != null ? (to - from) / from : null;
const mean = (xs) => {
  const vals = xs.filter((x) => Number.isFinite(x));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const stdev = (xs) => {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

function weightedMean(entries) {
  const available = entries.filter(({ value, weight }) => Number.isFinite(value) && weight > 0);
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return totalWeight > 0
    ? available.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : null;
}

function returnOver(closes, sessions) {
  if (closes.length <= sessions) return null;
  return pctReturn(closes[closes.length - 1 - sessions], closes[closes.length - 1]);
}

function slopePct(series, period, price) {
  if (series.length < period || !price) return null;
  const projected = linReg(series, period);
  return projected == null ? null : (projected - price) / price;
}

function groupScore(value, atrPctDecimal) {
  if (value == null) return null;
  const scale = Math.max(atrPctDecimal || 0.02, 0.005);
  return round2(clamp(50 + (value / scale) * 25, 0, 100));
}

export function extractNextCloseFeatures({ currentPrice, candles, benchmarkCandles = null, sectorCandles = null, news = null }) {
  const clean = (candles ?? []).filter((c) => finite(c?.close) != null);
  const closes = clean.map((c) => Number(c.close));
  const price = finite(currentPrice) ?? closes.at(-1);
  if (!price || clean.length < 21) return { ok: false, reason: 'At least 21 valid OHLCV candles are required.' };

  const returns = Object.fromEntries([1, 2, 3, 5, 10, 20].map((n) => [`r${n}`, returnOver(closes, n)]));
  const dailyReturns = closes.slice(-21).slice(1).map((v, i) => pctReturn(closes.slice(-21)[i], v));
  const last = clean.at(-1);
  const open = finite(last.open);
  const high = finite(last.high);
  const low = finite(last.low);
  const volume = finite(last.volume);
  const avgVol5 = mean(clean.slice(-5).map((c) => finite(c.volume)).filter((v) => v != null));
  const avgVol20 = mean(clean.slice(-20).map((c) => finite(c.volume)).filter((v) => v != null));
  const atrVal = atr(clean, 14) ?? price * 0.02;
  const atrPct = atrVal / price;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s100 = sma(closes, 100);
  const vwma = vwmaClose(clean, 10);

  const priceMomentumSignal = weightedMean([
    { value: returns.r1, weight: 0.28 },
    { value: returns.r2 == null ? null : returns.r2 / 2, weight: 0.22 },
    { value: returns.r3 == null ? null : returns.r3 / 3, weight: 0.18 },
    { value: returns.r5 == null ? null : returns.r5 / 5, weight: 0.14 },
    { value: returns.r10 == null ? null : returns.r10 / 10, weight: 0.10 },
    { value: returns.r20 == null ? null : returns.r20 / 20, weight: 0.08 },
  ]);

  const trendSignal = mean([
    e9 && e21 ? (e9 - e21) / price : null,
    e21 && e50 ? (e21 - e50) / price : null,
    s20 ? (price - s20) / price : null,
    s50 ? (price - s50) / price : null,
    slopePct(closes, 10, price),
  ].map((v) => v == null ? null : clamp(v * 0.12, -atrPct, atrPct)));

  const volumeRatio = volume != null && avgVol20 > 0 ? volume / avgVol20 : null;
  const signedVolume = volumeRatio != null && returns.r1 != null
    ? Math.sign(returns.r1) * clamp(volumeRatio - 1, -1, 2) * atrPct * 0.12 : null;
  const volumeVwapSignal = mean([
    signedVolume,
    vwma ? clamp(((price - vwma) / price) * 0.10, -atrPct, atrPct) : null,
  ]);

  const benchmarkCloses = (benchmarkCandles ?? []).map((c) => finite(c?.close)).filter((v) => v != null);
  const sectorCloses = (sectorCandles ?? []).map((c) => finite(c?.close)).filter((v) => v != null);
  const benchR1 = returnOver(benchmarkCloses, 1);
  const benchR5 = returnOver(benchmarkCloses, 5);
  const sectorR1 = returnOver(sectorCloses, 1);
  const marketSectorSignal = mean([
    benchR1,
    benchR5 == null ? null : benchR5 / 5,
    sectorR1,
    returns.r5 != null && benchR5 != null ? (returns.r5 - benchR5) * 0.15 : null,
  ]);

  const newsScore = news?.available === true && Number(news.materialEvents) > 0 ? finite(news.score) : null;
  const newsSignal = newsScore == null ? null : ((newsScore - 50) / 50) * atrPct * 0.20;

  return {
    ok: true,
    price,
    returns,
    intradayReturn: open > 0 ? pctReturn(open, price) : null,
    distanceFromHigh: high > 0 ? (price - high) / high : null,
    distanceFromLow: low > 0 ? (price - low) / low : null,
    candleBody: open > 0 ? (price - open) / open : null,
    upperWick: high > 0 && open > 0 ? (high - Math.max(open, price)) / open : null,
    lowerWick: low > 0 && open > 0 ? (Math.min(open, price) - low) / open : null,
    gap: clean.length > 1 && open > 0 ? pctReturn(Number(clean.at(-2).close), open) : null,
    momentumAcceleration: returns.r1 != null && returns.r3 != null ? returns.r1 - returns.r3 / 3 : null,
    rollingVolatility: stdev(dailyReturns),
    realizedVolatility: stdev(dailyReturns) == null ? null : stdev(dailyReturns) * Math.sqrt(252),
    atr: atrVal,
    atrPct,
    volume,
    avgVolume5: avgVol5,
    avgVolume20: avgVol20,
    volumeRatio,
    ema9: e9,
    ema21: e21,
    ema50: e50,
    sma20: s20,
    sma50: s50,
    sma100: s100,
    regressionSlope: slopePct(closes, 10, price),
    vwma,
    benchmarkReturn1: benchR1,
    benchmarkReturn5: benchR5,
    sectorReturn1: sectorR1,
    groupSignals: {
      priceMomentum: priceMomentumSignal,
      trend: trendSignal,
      volumeVwap: volumeVwapSignal,
      volatility: 0,
      marketSector: marketSectorSignal,
      news: newsSignal,
    },
    groupScores: {
      priceMomentum: groupScore(priceMomentumSignal, atrPct),
      trend: groupScore(trendSignal, atrPct),
      volumeVwap: groupScore(volumeVwapSignal, atrPct),
      volatility: groupScore(0, atrPct),
      marketSector: groupScore(marketSectorSignal, atrPct),
      news: newsScore,
    },
  };
}

function sessionMetadata(now) {
  const marketSession = isMarketOpen(now) ? 'OPEN' : isPastClose(now) ? 'CLOSED' : 'PRE_OPEN';
  return {
    marketSession,
    predictionHorizon: marketSession === 'OPEN' ? 'CURRENT_SESSION_CLOSE' : 'NEXT_SESSION_CLOSE',
    tradeDate: dayKey(now),
  };
}

export function generateNextClosePrediction(input, config = NEXT_CLOSE_CONFIG) {
  const now = input.predictionTimestamp ? new Date(input.predictionTimestamp) : new Date();
  const f = extractNextCloseFeatures(input);
  if (!f.ok) return { ok: false, modelVersion: config.version, error: f.reason };
  const weights = config.groupWeights;
  const available = Object.entries(f.groupSignals).filter(([key, value]) => value != null && Number(weights[key]) > 0);
  const knownWeight = available.reduce((s, [key]) => s + Number(weights[key]), 0) || 1;
  const rawPredictedReturn = available.reduce((s, [key, value]) => s + value * Number(weights[key]), 0) / knownWeight;
  const calibratedReturn = rawPredictedReturn * config.shrinkage;
  const boundedReturn = clamp(calibratedReturn, -f.atrPct * config.maxAtrMultiplier, f.atrPct * config.maxAtrMultiplier);
  const predictedClose = f.price * (1 + boundedReturn);
  const empiricalWidths = config.residualQuantilesPct ?? null;
  const intervals = Object.fromEntries(Object.entries(config.intervalAtrMultipliers).map(([key, mult]) => {
    const empiricalPct = finite(empiricalWidths?.[key]);
    const width = empiricalPct != null ? predictedClose * empiricalPct / 100 : f.atr * mult;
    return [key, { low: round2(predictedClose - width), high: round2(predictedClose + width) }];
  }));
  const missingFactors = Object.keys(weights).filter((key) => f.groupSignals[key] == null);
  const evidenceQuality = clamp(100 - missingFactors.length * 10 - (input.dataQuality === 'STALE' ? 25 : input.dataQuality === 'UNKNOWN' ? 40 : 0), 0, 100);
  const directionPct = boundedReturn * 100;
  const directionalOutlook = directionPct > config.neutralDirectionBandPct ? 'BULLISH'
    : directionPct < -config.neutralDirectionBandPct ? 'BEARISH' : 'NEUTRAL';

  return {
    ok: true,
    modelVersion: config.version,
    predictionTimestamp: now.toISOString(),
    predictionTimePrice: round2(f.price),
    dataTimestamp: input.dataTimestamp ?? null,
    ...sessionMetadata(now),
    predictedReturn: boundedReturn,
    predictedReturnPct: round2(directionPct),
    predictedClose: round2(predictedClose),
    intervals,
    intervalCalibrationStatus: empiricalWidths ? 'EMPIRICALLY_CALIBRATED_OUT_OF_SAMPLE' : 'PROVISIONAL_NOT_EMPIRICALLY_CALIBRATED',
    directionalScore: groupScore(boundedReturn, f.atrPct),
    directionalOutlook,
    factorWeights: weights,
    appliedWeight: knownWeight,
    groupScores: f.groupScores,
    groupContributions: Object.fromEntries(available.map(([key, value]) => [key, value * Number(weights[key]) / knownWeight])),
    missingFactors,
    evidenceQuality,
    dataQuality: input.dataQuality ?? 'UNKNOWN',
    features: f,
    calibration: { shrinkage: config.shrinkage, maxAtrMultiplier: config.maxAtrMultiplier },
    baselineCurrentPrice: round2(f.price),
    disclaimer: empiricalWidths
      ? 'Next-close return estimate; residual intervals were calibrated on a past chronological holdout and can still miss.'
      : 'Next-close return estimate; intervals are provisional until residual coverage is calibrated out of sample.',
  };
}
