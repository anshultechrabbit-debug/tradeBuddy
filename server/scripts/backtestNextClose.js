import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNextClosePrediction, NEXT_CLOSE_CONFIG } from '../src/services/nextClosePredictionModel.js';
import { generateEnginePredictionV3 } from '../src/services/predictionEngineV3.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'market-data');
const OUT = path.join(ROOT, 'scripts', 'next_close_backtest_report.json');
const SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL', 'ITC',
  'LT', 'AXISBANK', 'KOTAKBANK', 'BAJFINANCE', 'MARUTI', 'M&M', 'BAJAJ-AUTO',
  'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'NTPC', 'POWERGRID', 'ONGC', 'COALINDIA',
  'TECHM', 'HCLTECH', 'WIPRO', 'ADANIPORTS', 'ASIANPAINT', 'NESTLEIND', 'TATASTEEL',
  'JSWSTEEL', 'HINDALCO', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'EICHERMOT',
];

const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const quantile = (values, q) => {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const fraction = pos - lo;
  return a[lo + 1] == null ? a[lo] : a[lo] + fraction * (a[lo + 1] - a[lo]);
};
const round = (v, d = 4) => v == null ? null : Number(v.toFixed(d));
const ret = (a, b) => a > 0 ? (b - a) / a : 0;

function metrics(rows, key) {
  const valid = rows.filter((r) => Number.isFinite(r[key]));
  const errors = valid.map((r) => r[key] - r.actual);
  const absPct = valid.map((r, i) => Math.abs(errors[i]) / r.actual * 100);
  const directions = valid.filter((r) => Math.abs(r.actualReturnPct) >= 0.15);
  return {
    observations: valid.length,
    maeRupees: round(mean(errors.map(Math.abs)), 3),
    maePct: round(mean(absPct), 4),
    rmseRupees: round(Math.sqrt(mean(errors.map((e) => e * e))), 3),
    medianAbsErrorPct: round(quantile(absPct, 0.5), 4),
    biasRupees: round(mean(errors), 3),
    directionalAccuracyPct: round(100 * mean(directions.map((r) => Math.sign(r[key] - r.current) === Math.sign(r.actual - r.current) ? 1 : 0)), 2),
    avgPredictedMovePct: round(mean(valid.map((r) => (r[key] - r.current) / r.current * 100)), 4),
    avgActualMovePct: round(mean(valid.map((r) => r.actualReturnPct)), 4),
  };
}

function correlation(rows, getter, target) {
  const pairs = rows.map((r) => [getter(r), target(r)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map(([x]) => x));
  const my = mean(pairs.map(([, y]) => y));
  const num = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const den = Math.sqrt(pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0) * pairs.reduce((s, [, y]) => s + (y - my) ** 2, 0));
  return den ? num / den : null;
}

async function load() {
  const names = (await fs.readdir(CACHE)).filter((n) => /^nse_bhav_\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  const stocks = new Map(SYMBOLS.map((s) => [s, []]));
  const benchmark = [];
  for (const name of names) {
    const date = name.slice(9, 19);
    const bars = JSON.parse(await fs.readFile(path.join(CACHE, name), 'utf8'));
    for (const bar of bars) if (stocks.has(bar.symbol)) stocks.get(bar.symbol).push({ ...bar, date });
    try {
      const indexBars = JSON.parse(await fs.readFile(path.join(CACHE, `nse_index_${date}.json`), 'utf8'));
      const nifty = indexBars.find((b) => b.symbol === 'NIFTY');
      if (nifty) benchmark.push({ ...nifty, date });
    } catch { /* benchmark is explicitly marked missing for that date */ }
  }
  return { stocks, benchmark };
}

const { stocks, benchmark } = await load();
const benchmarkByDate = new Map(benchmark.map((b, i) => [b.date, benchmark.slice(0, i + 1)]));
const rows = [];
for (const [symbol, bars] of stocks) {
  bars.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 100; i < bars.length; i += 1) {
    const history = bars.slice(0, i);
    const current = history.at(-1).close;
    const actual = bars[i].close;
    const benchmarkHistory = benchmarkByDate.get(history.at(-1).date) ?? [];
    const fresh = generateNextClosePrediction({
      currentPrice: current,
      candles: history,
      benchmarkCandles: benchmarkHistory,
      predictionTimestamp: `${history.at(-1).date}T16:00:00+05:30`,
      dataTimestamp: history.at(-1).ts,
      dataQuality: 'HISTORICAL_VERIFIED',
    });
    if (!fresh.ok) continue;
    const closes = history.map((b) => b.close);
    const old = generateEnginePredictionV3(current, closes, history, benchmarkHistory.map((b) => b.close));
    const recentReturns = closes.slice(-11).slice(1).map((v, j) => ret(closes.slice(-11)[j], v));
    rows.push({
      date: bars[i].date, symbol, current, actual,
      actualReturnPct: ret(current, actual) * 100,
      currentBaseline: current,
      averageReturnBaseline: current * (1 + mean(recentReturns)),
      oldV3: old.baseTarget,
      newReturnModel: fresh.predictedClose,
      groups: fresh.features.groupSignals,
    });
  }
}
rows.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
const dates = [...new Set(rows.map((r) => r.date))];
const calibrationStart = dates[Math.floor(dates.length * 0.70)];
const testStart = dates[Math.floor(dates.length * 0.85)];
const calibration = rows.filter((r) => r.date >= calibrationStart && r.date < testStart);
const test = rows.filter((r) => r.date >= testStart);
const residuals = calibration.map((r) => Math.abs(r.newReturnModel - r.actual) / r.actual * 100);
const residualQuantilesPct = Object.fromEntries([['p50', .5], ['p70', .7], ['p80', .8], ['p90', .9]].map(([k, q]) => [k, round(quantile(residuals, q), 5)]));
const coverage = Object.fromEntries(Object.entries(residualQuantilesPct).map(([k, width]) => [k, round(100 * mean(test.map((r) => Math.abs(r.newReturnModel - r.actual) / r.actual * 100 <= width ? 1 : 0)), 2)]));
const groupCorrelations = Object.fromEntries(Object.keys(NEXT_CLOSE_CONFIG.groupWeights).map((key) => [key, round(correlation(test, (r) => r.groups[key], (r) => r.actualReturnPct / 100), 5)]));
const modelMetrics = {
  currentPriceBaseline: metrics(test, 'currentBaseline'),
  averageReturnBaseline: metrics(test, 'averageReturnBaseline'),
  oldV3: metrics(test, 'oldV3'),
  newReturnModel: metrics(test, 'newReturnModel'),
};
const report = {
  generatedAt: new Date().toISOString(),
  methodology: {
    target: 'next trading-session close return',
    walkForward: true,
    leakageControl: 'Every prediction uses only bars dated before the target date.',
    split: 'First 70% development, next 15% interval calibration, final 15% untouched test.',
    newsLimitation: 'Historical point-in-time news was unavailable; news is UNKNOWN and its weight is renormalized, never neutral-filled.',
  },
  universe: { requested: SYMBOLS.length, tested: [...stocks].filter(([, b]) => b.length > 100).length },
  periods: { first: dates[0], calibrationStart, testStart, last: dates.at(-1), calibrationObservations: calibration.length, testObservations: test.length },
  config: NEXT_CLOSE_CONFIG,
  metrics: modelMetrics,
  calibratedResidualQuantilesPct: residualQuantilesPct,
  untouchedTestIntervalCoveragePct: coverage,
  groupSignalCorrelationWithNextReturn: groupCorrelations,
  activationDecision: modelMetrics.newReturnModel.maePct < modelMetrics.currentPriceBaseline.maePct
    ? 'PASS_MAE_VS_CURRENT_PRICE_BASELINE'
    : 'FAIL_MAE_VS_CURRENT_PRICE_BASELINE_DO_NOT_REPLACE_PRODUCTION_FORECAST',
};
await fs.writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
