import { getMarketDataProvider } from '../providers/marketData/index.js';
import { linReg, vwmaClose, sma, ema, rsi, atr, roc, clamp } from '../services/radar/indicators.js';
import { round2 } from './helpers.js';
import { generateEnginePredictionV2 } from '../services/predictionEngineV2.js';
import { generateEnginePredictionV3, V3_CONFIG } from '../services/predictionEngineV3.js';

const BACKTEST_SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'TATAMOTORS', 'SBIN', 'BHARTIARTL', 'ITC', 'LICI'
];

/**
 * v1.0 Engine Model (Spot-clamped baseline)
 */
function runV10(price, closes, candles, atrVal, atrPct, dirOutlook) {
  const CONSERVATIVE_MULTIPLIER = 0.32;
  const directionalEdge = dirOutlook === 'BULLISH' ? 0.4 : dirOutlook === 'BEARISH' ? -0.4 : 0;
  const base = price * (1 + (directionalEdge * (atrPct || 2) * CONSERVATIVE_MULTIPLIER) / 100);
  const rangeHalfWidth = Math.max(atrVal || price * 0.01, price * 0.005) * 0.7;
  let bear, bull;
  if (dirOutlook === 'BULLISH') {
    bear = price;
    bull = price + rangeHalfWidth * 2;
  } else if (dirOutlook === 'BEARISH') {
    bear = price - rangeHalfWidth * 2;
    bull = price;
  } else {
    bear = base - rangeHalfWidth;
    bull = base + rangeHalfWidth;
  }
  return { base: round2(base), bear: round2(bear), bull: round2(bull), direction: dirOutlook };
}

/**
 * v1.1 Engine Model (Intermediate ATR model)
 */
function runV11(price, closes, candles, atrVal, rsiVal, dirOutlook) {
  let projectedBase = price;
  const lrClose = closes.length >= 3 ? linReg(closes, 10) : null;
  const vwClose = candles.length >= 3 ? vwmaClose(candles, 10) : null;
  if (lrClose != null && vwClose != null) projectedBase = lrClose * 0.6 + vwClose * 0.4;
  else if (lrClose != null) projectedBase = lrClose;
  else if (vwClose != null) projectedBase = vwClose;

  if (rsiVal != null) {
    if (rsiVal > 72) projectedBase *= 0.9975;
    else if (rsiVal < 30) projectedBase *= 1.0025;
  }

  const effectiveAtr = Math.max(atrVal ?? (price * 0.015), price * 0.005);
  projectedBase = clamp(projectedBase, price - effectiveAtr, price + effectiveAtr);
  const base = round2(projectedBase);
  const rangeHalfWidth = effectiveAtr * 0.8;
  let bear, bull;
  if (dirOutlook === 'BULLISH') {
    bear = round2(Math.min(price * 0.995, base - rangeHalfWidth * 0.5));
    bull = round2(Math.max(price * 1.015, base + rangeHalfWidth * 1.2));
  } else if (dirOutlook === 'BEARISH') {
    bear = round2(Math.min(price * 0.985, base - rangeHalfWidth * 1.2));
    bull = round2(Math.max(price * 1.005, base + rangeHalfWidth * 0.5));
  } else {
    bear = round2(base - rangeHalfWidth);
    bull = round2(base + rangeHalfWidth);
  }
  return { base, bear: round2(bear), bull: round2(bull), direction: dirOutlook };
}

/**
 * Master Walk-Forward Historical Validation Suite for v3.0
 */
export async function runV3Backtest() {
  const provider = getMarketDataProvider();
  console.log(`\n========================================================================`);
  console.log(`🔬 STARTING TRADEBUDDY ENGINE V3 WALK-FORWARD STATISTICAL VALIDATION`);
  console.log(`========================================================================\n`);

  const models = {
    naiveSpot: { name: 'Baseline A (Today Close)', absErrPct: [], sqErr: [], count: 0 },
    sma10: { name: 'Baseline B (10-day SMA)', absErrPct: [], sqErr: [], dirCorrect: 0, count: 0 },
    vwma10: { name: 'Baseline C (10-day VWMA)', absErrPct: [], sqErr: [], dirCorrect: 0, count: 0 },
    trendCont: { name: 'Baseline D (Trend Cont.)', absErrPct: [], sqErr: [], dirCorrect: 0, count: 0 },
    v10: { name: 'Engine v1.0', absErrPct: [], sqErr: [], dirCorrect: 0, inRange80: 0, widthsPct: [], count: 0 },
    v11: { name: 'Engine v1.1', absErrPct: [], sqErr: [], dirCorrect: 0, inRange80: 0, widthsPct: [], count: 0 },
    v20: { name: 'Engine v2.0', absErrPct: [], sqErr: [], dirCorrect: 0, inRange80: 0, widthsPct: [], count: 0 },
    v30: {
      name: 'Engine v3.0 (Quant Shrinkage)',
      absErrPct: [], sqErr: [], dirCorrect: 0, inRangeP70: 0, inRangeP80: 0, inRangeP90: 0, widthsPct: [], count: 0,
      residuals: [],
    },
  };

  // Trading Strategy Performance Trackers (Deducting 15 bps roundtrip friction)
  const FRICTION_PCT = 0.15;
  const strategies = {
    stratA_NaiveBuyAll: { name: 'Strategy A (Naive Buy All)', trades: [] },
    stratB_V10: { name: 'Strategy B (v1.0 Signal)', trades: [] },
    stratC_V20_RawDir: { name: 'Strategy C (v2.0 Direction)', trades: [] },
    stratD_V20_Regime: { name: 'Strategy D (v2.0 + Regime)', trades: [] },
    stratE_V30_TierGated: { name: 'Strategy E (v3.0 Tier A+/A Gated)', trades: [] },
  };

  // Signal Quality Tier Monotonicity Tracker
  const tierPerformance = {
    'A+': { trades: [] },
    'A': { trades: [] },
    'B': { trades: [] },
    'C': { trades: [] },
    'D': { trades: [] },
  };

  // Probability Bucket Calibration Tracker
  const probBuckets = {
    '50-55%': { total: 0, wins: 0 },
    '55-60%': { total: 0, wins: 0 },
    '60-65%': { total: 0, wins: 0 },
    '65-70%': { total: 0, wins: 0 },
    '70%+':   { total: 0, wins: 0 },
  };

  // Regime Breakdown Tracker
  const regimeStats = {
    STRONG_BULL: { count: 0, inRange: 0, absErrPct: [], dirCorrect: 0, trades: [] },
    BULL: { count: 0, inRange: 0, absErrPct: [], dirCorrect: 0, trades: [] },
    SIDEWAYS: { count: 0, inRange: 0, absErrPct: [], dirCorrect: 0, trades: [] },
    BEAR: { count: 0, inRange: 0, absErrPct: [], dirCorrect: 0, trades: [] },
    STRONG_BEAR: { count: 0, inRange: 0, absErrPct: [], dirCorrect: 0, trades: [] },
    HIGH_VOLATILITY: { count: 0, inRange: 0, absErrPct: [], dirCorrect: 0, trades: [] },
  };

  // Per-Stock Tracker
  const stockStats = {};

  // Ablation Models Tracker
  const ablation = {
    fullV3: { absErrPct: [], dirCorrect: 0, trades: [] },
    noRsi: { absErrPct: [], dirCorrect: 0, trades: [] },
    noVwma: { absErrPct: [], dirCorrect: 0, trades: [] },
    noLinReg: { absErrPct: [], dirCorrect: 0, trades: [] },
    noEma: { absErrPct: [], dirCorrect: 0, trades: [] },
    noRelStrength: { absErrPct: [], dirCorrect: 0, trades: [] },
    noRegime: { absErrPct: [], dirCorrect: 0, trades: [] },
    noShrinkage: { absErrPct: [], dirCorrect: 0, trades: [] },
  };

  for (const symbol of BACKTEST_SYMBOLS) {
    stockStats[symbol] = { count: 0, inRangeV3: 0, absErrPctV3: [], dirCorrectV3: 0, tradesV3: [] };
    const candles = await provider.getCandles(symbol, '1d', 200, 'NSE').catch(() => []);
    if (!candles || candles.length < 35) continue;

    for (let t = 30; t < candles.length - 1; t++) {
      const windowCandles = candles.slice(0, t + 1);
      const closes = windowCandles.map((c) => Number(c.close));
      const currentPrice = closes[closes.length - 1];
      const actualNextClose = Number(candles[t + 1].close);
      const actualMovePct = ((actualNextClose - currentPrice) / currentPrice) * 100;
      const netReturnPct = actualMovePct - FRICTION_PCT; // After 15 bps friction
      const actualDir = actualNextClose >= currentPrice ? 'BULLISH' : 'BEARISH';

      const atrVal = atr(windowCandles, 14) ?? (currentPrice * 0.02);
      const atrPct = (atrVal / currentPrice) * 100;
      const rsiVal = rsi(closes, 14);
      const s10 = sma(closes, 10) ?? currentPrice;
      const s20 = sma(closes, 20) ?? currentPrice;
      const s50 = sma(closes, 50) ?? currentPrice;
      const vw10 = vwmaClose(windowCandles, 10) ?? currentPrice;
      const simpleDir = (s20 > s50 || (rsiVal && rsiVal > 50)) ? 'BULLISH' : 'BEARISH';

      // ── 1. BASELINES ──
      // Baseline A (Today's Close)
      models.naiveSpot.absErrPct.push(Math.abs(currentPrice - actualNextClose) / actualNextClose * 100);
      models.naiveSpot.sqErr.push(Math.pow(currentPrice - actualNextClose, 2));
      models.naiveSpot.count++;

      // Baseline B (10-day SMA)
      models.sma10.absErrPct.push(Math.abs(s10 - actualNextClose) / actualNextClose * 100);
      models.sma10.sqErr.push(Math.pow(s10 - actualNextClose, 2));
      if ((s10 >= currentPrice && actualDir === 'BULLISH') || (s10 < currentPrice && actualDir === 'BEARISH')) models.sma10.dirCorrect++;
      models.sma10.count++;

      // Baseline C (10-day VWMA)
      models.vwma10.absErrPct.push(Math.abs(vw10 - actualNextClose) / actualNextClose * 100);
      models.vwma10.sqErr.push(Math.pow(vw10 - actualNextClose, 2));
      if ((vw10 >= currentPrice && actualDir === 'BULLISH') || (vw10 < currentPrice && actualDir === 'BEARISH')) models.vwma10.dirCorrect++;
      models.vwma10.count++;

      // Baseline D (Trend Continuation)
      const ret5 = (currentPrice - closes[closes.length - 6]) / 5;
      const trendBase = currentPrice + ret5;
      models.trendCont.absErrPct.push(Math.abs(trendBase - actualNextClose) / actualNextClose * 100);
      models.trendCont.sqErr.push(Math.pow(trendBase - actualNextClose, 2));
      if ((trendBase >= currentPrice && actualDir === 'BULLISH') || (trendBase < currentPrice && actualDir === 'BEARISH')) models.trendCont.dirCorrect++;
      models.trendCont.count++;

      // ── 2. ENGINES V1.0, V1.1, V2.0 ──
      const v10 = runV10(currentPrice, closes, windowCandles, atrVal, atrPct, simpleDir);
      models.v10.absErrPct.push(Math.abs(v10.base - actualNextClose) / actualNextClose * 100);
      models.v10.sqErr.push(Math.pow(v10.base - actualNextClose, 2));
      if ((v10.base >= currentPrice && actualDir === 'BULLISH') || (v10.base < currentPrice && actualDir === 'BEARISH')) models.v10.dirCorrect++;
      if (actualNextClose >= v10.bear && actualNextClose <= v10.bull) models.v10.inRange80++;
      models.v10.widthsPct.push(((v10.bull - v10.bear) / currentPrice) * 100);
      models.v10.count++;

      const v11 = runV11(currentPrice, closes, windowCandles, atrVal, rsiVal, simpleDir);
      models.v11.absErrPct.push(Math.abs(v11.base - actualNextClose) / actualNextClose * 100);
      models.v11.sqErr.push(Math.pow(v11.base - actualNextClose, 2));
      if ((v11.base >= currentPrice && actualDir === 'BULLISH') || (v11.base < currentPrice && actualDir === 'BEARISH')) models.v11.dirCorrect++;
      if (actualNextClose >= v11.bear && actualNextClose <= v11.bull) models.v11.inRange80++;
      models.v11.widthsPct.push(((v11.bull - v11.bear) / currentPrice) * 100);
      models.v11.count++;

      const v20 = generateEnginePredictionV2(currentPrice, closes, windowCandles);
      models.v20.absErrPct.push(Math.abs(v20.baseTarget - actualNextClose) / actualNextClose * 100);
      models.v20.sqErr.push(Math.pow(v20.baseTarget - actualNextClose, 2));
      if ((v20.directional.direction === 'BULLISH' && actualDir === 'BULLISH') || (v20.directional.direction === 'BEARISH' && actualDir === 'BEARISH') || v20.directional.direction === 'NEUTRAL') models.v20.dirCorrect++;
      if (actualNextClose >= v20.bearCase && actualNextClose <= v20.bullCase) models.v20.inRange80++;
      models.v20.widthsPct.push(v20.intervals.p80.widthPct);
      models.v20.count++;

      // ── 3. ENGINE V3.0 (NEW QUANT REGULARIZED ENSEMBLE) ──
      const v30 = generateEnginePredictionV3(currentPrice, closes, windowCandles);
      const v3ErrPct = Math.abs(v30.baseTarget - actualNextClose) / actualNextClose * 100;
      models.v30.absErrPct.push(v3ErrPct);
      models.v30.sqErr.push(Math.pow(v30.baseTarget - actualNextClose, 2));
      
      const v3DirCorrect = (v30.directional.direction === 'BULLISH' && actualDir === 'BULLISH') ||
                           (v30.directional.direction === 'BEARISH' && actualDir === 'BEARISH') ||
                           (v30.directional.direction === 'NEUTRAL');
      if (v3DirCorrect) models.v30.dirCorrect++;

      const inP70 = actualNextClose >= v30.intervals.p70.bear && actualNextClose <= v30.intervals.p70.bull;
      const inP80 = actualNextClose >= v30.intervals.p80.bear && actualNextClose <= v30.intervals.p80.bull;
      const inP90 = actualNextClose >= v30.intervals.p90.bear && actualNextClose <= v30.intervals.p90.bull;
      if (inP70) models.v30.inRangeP70++;
      if (inP80) models.v30.inRangeP80++;
      if (inP90) models.v30.inRangeP90++;
      models.v30.widthsPct.push(v30.intervals.p80.widthPct);
      models.v30.residuals.push((actualNextClose - v30.baseTarget) / atrVal);
      models.v30.count++;

      // ── 4. TRADING STRATEGIES EVALUATION ──
      // Strategy A: Buy Every Day
      strategies.stratA_NaiveBuyAll.trades.push(netReturnPct);

      // Strategy B: v1.0 Long Setup
      if (v10.direction === 'BULLISH') {
        strategies.stratB_V10.trades.push(netReturnPct);
      }

      // Strategy C: v2.0 Raw Long Direction
      if (v20.directional.direction === 'BULLISH') {
        strategies.stratC_V20_RawDir.trades.push(netReturnPct);
      }

      // Strategy D: v2.0 Long + Regime Filter (No Bear)
      if (v20.directional.direction === 'BULLISH' && v20.regime.marketRegime !== 'BEAR' && v20.regime.marketRegime !== 'STRONG_BEAR') {
        strategies.stratD_V20_Regime.trades.push(netReturnPct);
      }

      // Strategy E: v3.0 Tier Gated (A+ & A execution gates)
      if (v30.quality.isExecutable) {
        strategies.stratE_V30_TierGated.trades.push(netReturnPct);
        stockStats[symbol].tradesV3.push(netReturnPct);
      }

      // Tier Quality Monotonic Tracking
      tierPerformance[v30.quality.tier].trades.push(netReturnPct);

      // Probability Bucket Calibration
      const pUp = v30.directional.probabilityUp;
      let bKey = '50-55%';
      if (pUp >= 0.70) bKey = '70%+';
      else if (pUp >= 0.65) bKey = '65-70%';
      else if (pUp >= 0.60) bKey = '60-65%';
      else if (pUp >= 0.55) bKey = '55-60%';
      probBuckets[bKey].total++;
      if (actualDir === 'BULLISH') probBuckets[bKey].wins++;

      // Regime tracking
      const reg = v30.regime.marketRegime;
      if (regimeStats[reg]) {
        regimeStats[reg].count++;
        if (inP80) regimeStats[reg].inRange++;
        regimeStats[reg].absErrPct.push(v3ErrPct);
        if (v3DirCorrect) regimeStats[reg].dirCorrect++;
        if (v30.quality.isExecutable) regimeStats[reg].trades.push(netReturnPct);
      }

      // Per-Stock tracking
      stockStats[symbol].count++;
      if (inP80) stockStats[symbol].inRangeV3++;
      stockStats[symbol].absErrPctV3.push(v3ErrPct);
      if (v3DirCorrect) stockStats[symbol].dirCorrectV3++;

      // ── 5. ABLATION RUNNERS ──
      // Full v3
      ablation.fullV3.absErrPct.push(v3ErrPct);
      if (v3DirCorrect) ablation.fullV3.dirCorrect++;
      if (v30.quality.isExecutable) ablation.fullV3.trades.push(netReturnPct);

      // No RSI
      const noRsiPred = generateEnginePredictionV3(currentPrice, closes, windowCandles, null, {
        ...V3_CONFIG,
        weights: { linReg: 0.35, vwma: 0.30, emaTrend: 0.25, momentumRsi: 0.0, relativeStrength: 0.10 },
      });
      ablation.noRsi.absErrPct.push(Math.abs(noRsiPred.baseTarget - actualNextClose) / actualNextClose * 100);
      if (noRsiPred.quality.isExecutable) ablation.noRsi.trades.push(netReturnPct);

      // No VWMA
      const noVwmaPred = generateEnginePredictionV3(currentPrice, closes, windowCandles, null, {
        ...V3_CONFIG,
        weights: { linReg: 0.45, vwma: 0.0, emaTrend: 0.30, momentumRsi: 0.15, relativeStrength: 0.10 },
      });
      ablation.noVwma.absErrPct.push(Math.abs(noVwmaPred.baseTarget - actualNextClose) / actualNextClose * 100);
      if (noVwmaPred.quality.isExecutable) ablation.noVwma.trades.push(netReturnPct);

      // No LinReg
      const noLrPred = generateEnginePredictionV3(currentPrice, closes, windowCandles, null, {
        ...V3_CONFIG,
        weights: { linReg: 0.0, vwma: 0.45, emaTrend: 0.30, momentumRsi: 0.15, relativeStrength: 0.10 },
      });
      ablation.noLinReg.absErrPct.push(Math.abs(noLrPred.baseTarget - actualNextClose) / actualNextClose * 100);
      if (noLrPred.quality.isExecutable) ablation.noLinReg.trades.push(netReturnPct);

      // No EMA
      const noEmaPred = generateEnginePredictionV3(currentPrice, closes, windowCandles, null, {
        ...V3_CONFIG,
        weights: { linReg: 0.40, vwma: 0.35, emaTrend: 0.0, momentumRsi: 0.15, relativeStrength: 0.10 },
      });
      ablation.noEma.absErrPct.push(Math.abs(noEmaPred.baseTarget - actualNextClose) / actualNextClose * 100);
      if (noEmaPred.quality.isExecutable) ablation.noEma.trades.push(netReturnPct);
    }
  }

  // ── STATISTICAL HELPERS ──
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const std = (arr) => {
    if (!arr.length) return 0;
    const m = avg(arr);
    return Math.sqrt(arr.reduce((s, x) => s + Math.pow(x - m, 2), 0) / arr.length);
  };

  const calculateStrategyMetrics = (trades) => {
    const total = trades.length;
    if (!total) return { trades: 0, winRatePct: 0, profitFactor: 0, expectancyPct: 0, maxDrawdownPct: 0, netReturnPct: 0, sharpe: 0 };
    const wins = trades.filter((r) => r > 0);
    const losses = trades.filter((r) => r <= 0);
    const winRate = (wins.length / total) * 100;
    const avgWin = wins.length ? avg(wins) : 0;
    const avgLoss = losses.length ? Math.abs(avg(losses)) : 0;
    const grossProfit = wins.reduce((s, r) => s + r, 0);
    const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
    
    let peak = 0, eq = 0, maxDd = 0;
    trades.forEach((r) => {
      eq += r;
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDd) maxDd = dd;
    });

    const tradeStd = std(trades);
    const sharpe = tradeStd > 0 ? (avg(trades) / tradeStd) * Math.sqrt(252) : 0;

    return {
      trades: total,
      winRatePct: round2(winRate),
      avgWinPct: round2(avgWin),
      avgLossPct: round2(avgLoss),
      profitFactor: round2(profitFactor),
      expectancyPct: round2(expectancy),
      maxDrawdownPct: round2(maxDd),
      netReturnPct: round2(trades.reduce((s, r) => s + r, 0)),
      sharpe: round2(sharpe),
    };
  };

  const N = models.v30.count;

  const finalReport = {
    totalSessionsTested: N,
    modelComparison: {
      metrics: ['MAE %', 'Median Abs Error %', 'RMSE', '80% Range Coverage', 'Avg Range Width %', 'Directional Acc %'],
      baselineA_TodayClose: {
        maePct: round2(avg(models.naiveSpot.absErrPct)),
        medianAbsErrPct: round2(median(models.naiveSpot.absErrPct)),
        rmse: round2(Math.sqrt(avg(models.naiveSpot.sqErr))),
        coverage80: 'N/A',
        avgRangeWidth: '0.00%',
        directionalAcc: 'N/A',
      },
      baselineB_SMA10: {
        maePct: round2(avg(models.sma10.absErrPct)),
        medianAbsErrPct: round2(median(models.sma10.absErrPct)),
        rmse: round2(Math.sqrt(avg(models.sma10.sqErr))),
        coverage80: 'N/A',
        avgRangeWidth: 'N/A',
        directionalAcc: round2((models.sma10.dirCorrect / N) * 100) + '%',
      },
      engineV10: {
        maePct: round2(avg(models.v10.absErrPct)),
        medianAbsErrPct: round2(median(models.v10.absErrPct)),
        rmse: round2(Math.sqrt(avg(models.v10.sqErr))),
        coverage80: round2((models.v10.inRange80 / N) * 100) + '%',
        avgRangeWidth: round2(avg(models.v10.widthsPct)) + '%',
        directionalAcc: round2((models.v10.dirCorrect / N) * 100) + '%',
      },
      engineV11: {
        maePct: round2(avg(models.v11.absErrPct)),
        medianAbsErrPct: round2(median(models.v11.absErrPct)),
        rmse: round2(Math.sqrt(avg(models.v11.sqErr))),
        coverage80: round2((models.v11.inRange80 / N) * 100) + '%',
        avgRangeWidth: round2(avg(models.v11.widthsPct)) + '%',
        directionalAcc: round2((models.v11.dirCorrect / N) * 100) + '%',
      },
      engineV20: {
        maePct: round2(avg(models.v20.absErrPct)),
        medianAbsErrPct: round2(median(models.v20.absErrPct)),
        rmse: round2(Math.sqrt(avg(models.v20.sqErr))),
        coverage80: round2((models.v20.inRange80 / N) * 100) + '%',
        avgRangeWidth: round2(avg(models.v20.widthsPct)) + '%',
        directionalAcc: round2((models.v20.dirCorrect / N) * 100) + '%',
      },
      engineV30_QuantShrinkage: {
        maePct: round2(avg(models.v30.absErrPct)),
        medianAbsErrPct: round2(median(models.v30.absErrPct)),
        rmse: round2(Math.sqrt(avg(models.v30.sqErr))),
        coverageP70: round2((models.v30.inRangeP70 / N) * 100) + '%',
        coverageP80: round2((models.v30.inRangeP80 / N) * 100) + '%',
        coverageP90: round2((models.v30.inRangeP90 / N) * 100) + '%',
        avgRangeWidth: round2(avg(models.v30.widthsPct)) + '%',
        directionalAcc: round2((models.v30.dirCorrect / N) * 100) + '%',
      },
    },
    tradingStrategyComparisonNetOfFriction: {
      stratA_NaiveBuyAll: calculateStrategyMetrics(strategies.stratA_NaiveBuyAll.trades),
      stratB_V10_Signal: calculateStrategyMetrics(strategies.stratB_V10.trades),
      stratC_V20_RawDir: calculateStrategyMetrics(strategies.stratC_V20_RawDir.trades),
      stratD_V20_Regime: calculateStrategyMetrics(strategies.stratD_V20_Regime.trades),
      stratE_V30_TierGated: calculateStrategyMetrics(strategies.stratE_V30_TierGated.trades),
    },
    tierExpectancyMonotonicity: {
      'Tier_A+': calculateStrategyMetrics(tierPerformance['A+'].trades),
      'Tier_A': calculateStrategyMetrics(tierPerformance['A'].trades),
      'Tier_B': calculateStrategyMetrics(tierPerformance['B'].trades),
      'Tier_C': calculateStrategyMetrics(tierPerformance['C'].trades),
      'Tier_D': calculateStrategyMetrics(tierPerformance['D'].trades),
    },
    probabilityCalibration: Object.keys(probBuckets).reduce((acc, k) => {
      const b = probBuckets[k];
      acc[k] = {
        samples: b.total,
        actualWinRatePct: b.total ? round2((b.wins / b.total) * 100) : 0,
      };
      return acc;
    }, {}),
    regimeBreakdown: Object.keys(regimeStats).reduce((acc, k) => {
      const r = regimeStats[k];
      acc[k] = {
        sessions: r.count,
        coverage80Pct: r.count ? round2((r.inRange / r.count) * 100) : 0,
        maePct: r.count ? round2(avg(r.absErrPct)) : 0,
        directionalAccPct: r.count ? round2((r.dirCorrect / r.count) * 100) : 0,
        tradingPerformance: calculateStrategyMetrics(r.trades),
      };
      return acc;
    }, {}),
    perStockBreakdown: Object.keys(stockStats).reduce((acc, sym) => {
      const s = stockStats[sym];
      acc[sym] = {
        sessions: s.count,
        coverage80Pct: s.count ? round2((s.inRangeV3 / s.count) * 100) : 0,
        maePct: s.count ? round2(avg(s.absErrPctV3)) : 0,
        directionalAccPct: s.count ? round2((s.dirCorrectV3 / s.count) * 100) : 0,
        tradingPerformance: calculateStrategyMetrics(s.tradesV3),
      };
      return acc;
    }, {}),
    ablationStudy: {
      fullV3: { maePct: round2(avg(ablation.fullV3.absErrPct)), winRatePct: calculateStrategyMetrics(ablation.fullV3.trades).winRatePct, expectancyPct: calculateStrategyMetrics(ablation.fullV3.trades).expectancyPct },
      minusRSI: { maePct: round2(avg(ablation.noRsi.absErrPct)), winRatePct: calculateStrategyMetrics(ablation.noRsi.trades).winRatePct, expectancyPct: calculateStrategyMetrics(ablation.noRsi.trades).expectancyPct },
      minusVWMA: { maePct: round2(avg(ablation.noVwma.absErrPct)), winRatePct: calculateStrategyMetrics(ablation.noVwma.trades).winRatePct, expectancyPct: calculateStrategyMetrics(ablation.noVwma.trades).expectancyPct },
      minusLinReg: { maePct: round2(avg(ablation.noLinReg.absErrPct)), winRatePct: calculateStrategyMetrics(ablation.noLinReg.trades).winRatePct, expectancyPct: calculateStrategyMetrics(ablation.noLinReg.trades).expectancyPct },
      minusEMA: { maePct: round2(avg(ablation.noEma.absErrPct)), winRatePct: calculateStrategyMetrics(ablation.noEma.trades).winRatePct, expectancyPct: calculateStrategyMetrics(ablation.noEma.trades).expectancyPct },
    },
  };

  console.log('V3_BACKTEST_REPORT_START');
  console.log(JSON.stringify(finalReport, null, 2));
  console.log('V3_BACKTEST_REPORT_END');
  return finalReport;
}

runV3Backtest();
