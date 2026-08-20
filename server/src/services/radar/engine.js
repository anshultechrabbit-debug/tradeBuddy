import { sma, ema, rsi, atr, roc, stdDevOfReturns, zscoreOfLatest, clamp } from './indicators.js';
import { round2 } from '../../utils/helpers.js';

/**
 * Conviction formula (deterministic, explainable, 0-100):
 *
 *   Conviction = Trend(25%) + Momentum(20%) + Volume(15%)
 *                + Relative Strength(15%) + Volatility(10%)
 *                + Breadth/Regime(15%)
 *
 * Each sub-score is normalized to 0-100; weights are constants below.
 */

export const CONVICTION_WEIGHTS = {
  trend: 0.25,
  momentum: 0.2,
  volume: 0.15,
  relativeStrength: 0.15,
  volatility: 0.1,
  breadth: 0.15,
};

export function computeFeatures(candles, context = {}) {
  const { indexReturn20 = 0, breadthPct = 50, livePrice = null } = context;
  const closes = candles.map((c) => Number(c.close));
  if (closes.length < 30) return null;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema20 = ema(closes, 20);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const last =
    livePrice != null && Number.isFinite(Number(livePrice)) && Number(livePrice) > 0
      ? Number(livePrice)
      : closes[closes.length - 1];
  const roc10 = roc(closes, 10);
  const roc20 = roc(closes, 20);
  const returnsStd = stdDevOfReturns(closes, 20);
  const dailyVolPct = returnsStd * 100;
  const annualVolPct = returnsStd * Math.sqrt(252) * 100;
  const zscore = zscoreOfLatest(closes, 20);

  const volumes = candles.map((c) => Number(c.volume));
  const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume20 > 0 ? lastVolume / avgVolume20 : 1;

  const recentHigh = Math.max(...candles.slice(-20).map((c) => Number(c.high)));
  const breakout = last >= recentHigh;
  const breakoutPct = recentHigh > 0 ? ((last - recentHigh) / recentHigh) * 100 : 0;

  const ret20 = closes.length > 21 ? last / closes[closes.length - 21] - 1 : 0;
  const relativeStrength = ret20 * 100 - (indexReturn20 ?? 0);

  // Intraday move since the last recorded daily close — makes momentum react
  // to the live price during market hours instead of only at each day's close.
  const intradayMovePct =
    livePrice != null && Number.isFinite(Number(livePrice)) && Number(livePrice) > 0 && closes.length > 1
      ? (Number(livePrice) / closes[closes.length - 2] - 1) * 100
      : 0;

  const scoreTrend =
    sma50 == null
      ? 50
      : clamp(50 + 100 * (0.5 * ((last - sma50) / sma50) / 0.08 + 0.5 * ((sma20 - sma50) / sma50) / 0.05), 0, 100);

  const scoreMomentum =
    rsi14 == null
      ? 50
      : clamp(50 + 100 * (0.4 * (rsi14 - 50) / 25 + 0.4 * roc10 / 10 + 0.2 * intradayMovePct / 3), 0, 100);

  const scoreVolume = clamp(50 + 100 * ((volumeRatio - 1) / 1.5), 0, 100);

  const scoreRelativeStrength = clamp(50 + 100 * (relativeStrength / 8), 0, 100);

  const scoreVolatility = clamp(100 - 100 * ((annualVolPct - 10) / 40), 0, 100);

  const scoreBreadth = clamp((breadthPct ?? 50), 0, 100);

  return {
    lastPrice: last,
    sma20: sma20 != null ? round2(sma20) : null,
    sma50: sma50 != null ? round2(sma50) : null,
    sma200: sma200 != null ? round2(sma200) : null,
    ema20: ema20 != null ? round2(ema20) : null,
    rsi14: rsi14 != null ? round2(rsi14) : null,
    atr14: atr14 != null ? round2(atr14) : null,
    roc10: round2(roc10),
    roc20: round2(roc20),
    dailyVolatilityPct: round2(dailyVolPct),
    annualizedVolatilityPct: round2(annualVolPct),
    zscore: round2(zscore),
    volumeRatio: round2(volumeRatio),
    avgVolume20: Math.round(avgVolume20),
    lastVolume,
    breakout,
    breakoutPct: round2(breakoutPct),
    ret20: round2(ret20 * 100),
    relativeStrength: round2(relativeStrength),
    intradayMovePct: round2(intradayMovePct),
    subscores: {
      trend: round2(scoreTrend),
      momentum: round2(scoreMomentum),
      volume: round2(scoreVolume),
      relativeStrength: round2(scoreRelativeStrength),
      volatility: round2(scoreVolatility),
      breadth: round2(scoreBreadth),
    },
  };
}

export function computeConviction(features) {
  const s = features.subscores;
  const conviction =
    s.trend * CONVICTION_WEIGHTS.trend +
    s.momentum * CONVICTION_WEIGHTS.momentum +
    s.volume * CONVICTION_WEIGHTS.volume +
    s.relativeStrength * CONVICTION_WEIGHTS.relativeStrength +
    s.volatility * CONVICTION_WEIGHTS.volatility +
    s.breadth * CONVICTION_WEIGHTS.breadth;
  return Math.round(clamp(conviction, 0, 100));
}

export function computeRegime({ breadthPctAboveSma50, indexAboveSma50 }) {
  const breadthBull = breadthPctAboveSma50 >= 60;
  const breadthBear = breadthPctAboveSma50 <= 40;
  const indexBull = indexAboveSma50 === true;
  const indexBear = indexAboveSma50 === false;
  if (breadthBull && !indexBear) return 'BULLISH';
  if (breadthBear && !indexBull) return 'BEARISH';
  if (breadthBull || indexBull) return 'BULLISH';
  if (breadthBear || indexBear) return 'BEARISH';
  return 'NEUTRAL';
}

export function regimeScore(regime, breadthPct) {
  if (regime === 'BULLISH') return Math.max(60, clamp(breadthPct ?? 60, 0, 100));
  if (regime === 'BEARISH') return Math.min(40, clamp((breadthPct ?? 40) * 0.6, 0, 100));
  return clamp(breadthPct ?? 50, 0, 100);
}

export function generateSignal({ conviction, regime, features }) {
  if (regime === 'BEARISH') return 'AVOID';
  if (conviction >= 70) return 'BUY';
  if (conviction >= 40) return 'WATCH';
  return 'AVOID';
}

export function buildReason(features, regime, conviction) {
  const parts = [];
  const s = features.subscores;
  const price = features.lastPrice;

  if (s.trend >= 65) {
    parts.push(`price is comfortably above the medium-term trend (SMA50 ${features.sma50})`);
  } else if (s.trend <= 40) {
    parts.push(`price is below the medium-term trend (SMA50 ${features.sma50})`);
  } else {
    parts.push(`price is trading near the medium-term trend (SMA50 ${features.sma50})`);
  }

  if (s.momentum >= 65) {
    parts.push(`momentum is positive (RSI ${features.rsi14}, 10-day return ${features.roc10}%)`);
  } else if (s.momentum <= 40) {
    parts.push(`momentum is weak (RSI ${features.rsi14}, 10-day return ${features.roc10}%)`);
  } else {
    parts.push(`momentum is neutral (RSI ${features.rsi14})`);
  }

  if (features.volumeRatio >= 1.3) {
    parts.push(`volume confirms the move (${features.volumeRatio}x 20-day average)`);
  } else if (features.volumeRatio <= 0.7) {
    parts.push(`volume is below average (${features.volumeRatio}x), lacking confirmation`);
  }

  if (features.breakout) {
    parts.push(`price is at a 20-day high (breakout)`);
  }

  if (regime === 'BULLISH') {
    parts.push(`market regime is BULLISH (breadth ${features.subscores.breadth}/100)`);
  } else if (regime === 'BEARISH') {
    parts.push(`market regime is BEARISH (breadth ${features.subscores.breadth}/100)`);
  }

  return parts.length ? parts.join('; ') : `Synthetic price ${price} with conviction ${conviction}/100`;
}

export function deepDive(candles, features, context = {}) {
  const closes = candles.map((c) => Number(c.close));
  const last = closes[closes.length - 1];
  const rsi14 = features.rsi14;
  const trendStrength =
    features.sma50 != null
      ? clamp(50 + 100 * ((last - features.sma50) / features.sma50) / 0.08, 0, 100)
      : 50;
  const momentum = clamp(50 + 100 * ((features.rsi14 ?? 50) - 50) / 25, 0, 100);
  const volumeConfirmation =
    features.volumeRatio >= 1.3 ? clamp(100 * (features.volumeRatio - 0.3) / 1.7, 0, 100) : clamp(50 + 100 * (features.volumeRatio - 1) / 1.5, 0, 100);
  const volatilityScore = clamp(100 - 100 * (features.annualizedVolatilityPct - 10) / 40, 0, 100);
  const breakoutScore = features.breakout ? clamp(70 + features.breakoutPct * 3, 70, 100) : clamp(50 + features.breakoutPct * 3, 20, 60);
  const relativeStrength = clamp(50 + 100 * (features.relativeStrength / 8), 0, 100);

  const signals = [];
  if (features.sma20 != null && features.sma50 != null) {
    if (features.sma20 > features.sma50) signals.push('20-day SMA above 50-day SMA');
    else signals.push('20-day SMA below 50-day SMA');
  }
  if (last > (features.sma20 ?? Infinity)) signals.push('price above 20-day SMA');
  else signals.push('price below 20-day SMA');
  if (rsi14 != null) {
    if (rsi14 >= 70) signals.push('RSI overbought');
    else if (rsi14 <= 30) signals.push('RSI oversold');
    else signals.push('RSI in neutral zone');
  }
  if (features.breakout) signals.push(`breaking out above 20-day high by ${features.breakoutPct}%`);
  if (features.zscore >= 2) signals.push('price 2+ standard deviations above 20-day mean');

  return {
    trendStrength: round2(trendStrength),
    momentum: round2(momentum),
    volumeConfirmation: round2(volumeConfirmation),
    volatilityScore: round2(volatilityScore),
    breakoutScore: round2(breakoutScore),
    relativeStrength: round2(relativeStrength),
    technicalSignals: signals,
    regime: context.regime ?? 'NEUTRAL',
  };
}

export { clamp };