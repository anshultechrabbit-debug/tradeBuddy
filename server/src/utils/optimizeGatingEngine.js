import { getMarketDataProvider } from '../providers/marketData/index.js';
import { linReg, vwmaClose, sma, ema, rsi, atr, roc, clamp } from '../services/radar/indicators.js';
import { round2 } from './helpers.js';
import { generateEnginePredictionV3, V3_CONFIG } from '../services/predictionEngineV3.js';

const BACKTEST_SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'TATAMOTORS', 'SBIN', 'BHARTIARTL', 'ITC', 'LICI'
];

const FRICTION_PCT = 0.15; // 15 bps roundtrip friction

/**
 * Parameter Grid for Out-Of-Sample Gating Optimization
 */
const GATING_PARAMETER_GRID = [
  { name: 'Ultra_Strict_A+', minProb: 0.68, minRR: 2.2, minRsi: 52, maxRsi: 68, requireVol: true, requireRegime: true },
  { name: 'Balanced_Quality_A', minProb: 0.60, minRR: 1.8, minRsi: 48, maxRsi: 70, requireVol: false, requireRegime: true },
  { name: 'Momentum_Focus', minProb: 0.58, minRR: 1.5, minRsi: 50, maxRsi: 72, requireVol: true, requireRegime: false },
  { name: 'Trend_Regime_Only', minProb: 0.55, minRR: 1.4, minRsi: 45, maxRsi: 75, requireVol: false, requireRegime: true },
  { name: 'Loose_Gating_B', minProb: 0.54, minRR: 1.2, minRsi: 40, maxRsi: 80, requireVol: false, requireRegime: false },
];

/**
 * Metric Calculator
 */
function evaluateTrades(trades) {
  const n = trades.length;
  if (n === 0) {
    return {
      trades: 0,
      winRatePct: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      profitFactor: 0,
      expectancyPct: 0,
      maxDrawdownPct: 0,
      netReturnPct: 0,
      sharpe: 0,
      sortino: 0,
      confidenceInterval95: [0, 0],
      isConclusive: false,
    };
  }

  const wins = trades.filter((r) => r > 0);
  const losses = trades.filter((r) => r <= 0);
  const winRate = (wins.length / n) * 100;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const expectancy = ((winRate / 100) * avgWin) - (((100 - winRate) / 100) * avgLoss);
  
  const meanRet = trades.reduce((a, b) => a + b, 0) / n;
  const variance = trades.reduce((s, r) => s + Math.pow(r - meanRet, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Downside deviation for Sortino
  const downsideVar = losses.reduce((s, r) => s + Math.pow(r, 2), 0) / n;
  const downsideStd = Math.sqrt(downsideVar);

  const sharpe = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : 0;
  const sortino = downsideStd > 0 ? (meanRet / downsideStd) * Math.sqrt(252) : 0;

  // Max Drawdown
  let peak = 0, eq = 0, maxDd = 0;
  trades.forEach((r) => {
    eq += r;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDd) maxDd = dd;
  });

  // 95% Confidence Interval for Expectancy: mean ± 1.96 * (std / sqrt(n))
  const marginError = n > 1 ? 1.96 * (stdDev / Math.sqrt(n)) : 0;
  const ciLow = round2(meanRet - marginError);
  const ciHigh = round2(meanRet + marginError);

  return {
    trades: n,
    winRatePct: round2(winRate),
    avgWinPct: round2(avgWin),
    avgLossPct: round2(avgLoss),
    profitFactor: round2(profitFactor),
    expectancyPct: round2(expectancy),
    maxDrawdownPct: round2(maxDd),
    netReturnPct: round2(trades.reduce((a, b) => a + b, 0)),
    sharpe: round2(sharpe),
    sortino: round2(sortino),
    confidenceInterval95: [ciLow, ciHigh],
    isConclusive: n >= 30,
  };
}

/**
 * Walk-Forward Optimizer & Trading System Validator
 */
export async function runGatingOptimizationSuite() {
  const provider = getMarketDataProvider();
  console.log(`\n========================================================================================`);
  console.log(`⚡ TRADEBUDDY SIGNAL QUALITY & GATING ENGINE OPTIMIZATION (WALK-FORWARD)`);
  console.log(`========================================================================================\n`);

  // Load all candles per symbol
  const stockData = {};
  for (const sym of BACKTEST_SYMBOLS) {
    const candles = await provider.getCandles(sym, '1d', 200, 'NSE').catch(() => []);
    if (candles && candles.length >= 50) {
      stockData[sym] = candles;
    }
  }

  // Determine Walk-Forward split points:
  // Total window length ~170 sessions.
  // Train: Sessions 30 to 110 (80 sessions) -> Select optimal gate
  // Test (Out-of-Sample): Sessions 111 to 170 (60 sessions unseen)
  const TRAIN_END_INDEX = 110;

  // Track In-Sample and Out-Of-Sample trades for each gate candidate
  const inSampleResults = {};
  const outOfSampleResults = {};
  GATING_PARAMETER_GRID.forEach((g) => {
    inSampleResults[g.name] = [];
    outOfSampleResults[g.name] = [];
  });

  // Benchmark trackers
  const benchmarks = {
    buyAndHoldUniverse: { inSample: [], outOfSample: [] },
  };

  // Run simulation across all symbols
  for (const [symbol, candles] of Object.entries(stockData)) {
    for (let t = 30; t < candles.length - 1; t++) {
      const isOutSample = t >= TRAIN_END_INDEX;
      const windowCandles = candles.slice(0, t + 1);
      const closes = windowCandles.map((c) => Number(c.close));
      const currentPrice = closes[closes.length - 1];
      const actualNextClose = Number(candles[t + 1].close);
      const actualMovePct = ((actualNextClose - currentPrice) / currentPrice) * 100;
      const netReturnPct = actualMovePct - FRICTION_PCT; // After 15 bps friction

      // Benchmark: 1-day Buy & Hold return
      if (isOutSample) benchmarks.buyAndHoldUniverse.outOfSample.push(actualMovePct);
      else benchmarks.buyAndHoldUniverse.inSample.push(actualMovePct);

      // Frozen v3.0 Prediction
      const v3 = generateEnginePredictionV3(currentPrice, closes, windowCandles);
      const rsiVal = rsi(closes, 14) ?? 50;
      const volRatio = windowCandles[windowCandles.length - 1].volume && windowCandles[windowCandles.length - 2].volume
        ? windowCandles[windowCandles.length - 1].volume / windowCandles[windowCandles.length - 2].volume
        : 1.0;

      // Evaluate each gate candidate
      for (const gate of GATING_PARAMETER_GRID) {
        let pass = true;

        if (v3.directional.probabilityUp < gate.minProb) pass = false;
        if (v3.quality.netRiskReward < gate.minRR) pass = false;
        if (rsiVal < gate.minRsi || rsiVal > gate.maxRsi) pass = false;
        if (gate.requireVol && volRatio < 1.05) pass = false;
        if (gate.requireRegime && (v3.regime.marketRegime === 'BEAR' || v3.regime.marketRegime === 'STRONG_BEAR' || v3.regime.marketRegime === 'HIGH_VOLATILITY')) pass = false;

        if (pass) {
          if (isOutSample) {
            outOfSampleResults[gate.name].push(netReturnPct);
          } else {
            inSampleResults[gate.name].push(netReturnPct);
          }
        }
      }
    }
  }

  // Compile Reports
  const inSampleSummary = {};
  const outOfSampleSummary = {};
  GATING_PARAMETER_GRID.forEach((g) => {
    inSampleSummary[g.name] = evaluateTrades(inSampleResults[g.name]);
    outOfSampleSummary[g.name] = evaluateTrades(outOfSampleResults[g.name]);
  });

  const benchmarkReport = {
    buyAndHoldUniverseInSample: evaluateTrades(benchmarks.buyAndHoldUniverse.inSample),
    buyAndHoldUniverseOutOfSample: evaluateTrades(benchmarks.buyAndHoldUniverse.outOfSample),
  };

  const report = {
    walkForwardSplit: {
      inSampleSessionsPerStock: 80,
      outOfSampleSessionsPerStock: 60,
      totalUniverseStocks: Object.keys(stockData).length,
      frictionDeductedBps: 15,
    },
    inSampleTrainingOptimization: inSampleSummary,
    outOfSampleTestingValidation: outOfSampleSummary,
    benchmarks: benchmarkReport,
  };

  console.log('GATING_OPTIMIZATION_REPORT_START');
  console.log(JSON.stringify(report, null, 2));
  console.log('GATING_OPTIMIZATION_REPORT_END');
  return report;
}

runGatingOptimizationSuite();
