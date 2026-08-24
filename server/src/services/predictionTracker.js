import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { round2 } from '../utils/helpers.js';
import { dayKey } from './officialClose.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'predictions.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function save(arr) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
}

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function recordPrediction(rec) {
  const arr = load();
  // IST calendar day — a UTC-based date (the old `toISOString().slice(0,10)`)
  // would misfile anything recorded between 00:00-05:29 IST into the
  // previous day's bucket (see MED-2 in the pipeline audit).
  const date = rec.date ?? dayKey();
  const entry = {
    id: `${rec.symbol}-${date}-${Date.now()}`,
    date,
    week: isoWeek(date),
    symbol: rec.symbol,
    sector: rec.sector ?? 'N/A',
    predictionPrice: rec.predictionPrice ?? null,
    expectedRange: rec.expectedRange ?? null,
    baseCase: rec.baseCase ?? null,
    bullCase: rec.bullCase ?? null,
    bearCase: rec.bearCase ?? null,
    entry: rec.entry ?? null,
    confirmation: rec.confirmation ?? null,
    target1: rec.target1 ?? null,
    target2: rec.target2 ?? null,
    stopLoss: rec.stopLoss ?? null,
    signal: rec.signal ?? null,
    score: rec.score ?? null,
    confidence: rec.confidence ?? null,
    confidenceScore: rec.confidenceScore ?? null,
    dataStatus: rec.dataStatus ?? null,
    modelVersion: rec.modelVersion ?? null,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  arr.push(entry);
  save(arr);
  return entry;
}

export function hasPredictionFor(symbol, date) {
  return load().some((p) => p.symbol === symbol && p.date === date);
}

/**
 * Freezes a stock-analysis engine result (see predictionEngine.buildEngineResult)
 * as a trackable prediction, at most once per symbol per trading day. Used
 * both by the manual /record-prediction endpoint and by the automatic
 * recorder in /predicted-risers so the tracking system actually accumulates
 * real records instead of sitting empty (see CRIT-6 in the pipeline audit).
 */
export function recordFromAnalysis(result, date = dayKey()) {
  const e = result?.engine;
  if (!result?.symbol || !e) return null;
  if (hasPredictionFor(result.symbol, date)) return null;
  return recordPrediction({
    date,
    symbol: result.symbol,
    sector: 'N/A',
    predictionPrice: result.price,
    expectedRange: e.closingRange?.range ?? null,
    baseCase: e.closingRange?.base ?? null,
    bullCase: e.closingRange?.bull ?? null,
    bearCase: e.closingRange?.bear ?? null,
    entry: e.buy?.preferredEntryRange ?? null,
    confirmation: e.buy?.confirmationPrice ?? null,
    target1: e.buy?.target1 ?? null,
    target2: e.buy?.target2 ?? null,
    stopLoss: e.buy?.stopLoss ?? null,
    signal: e.signal,
    score: e.totalScore,
    confidence: e.closingRange?.confidence ?? null,
    confidenceScore: e.closingRange?.confidenceScore ?? null,
    dataStatus: e.dataStatus,
    modelVersion: e.modelVersion,
  });
}

export function evaluatePredictions(closes) {
  const arr = load();
  let updated = 0;
  for (const p of arr) {
    if (p.status !== 'OPEN') continue;
    // Prefer an exact symbol+date match so a backlog of OPEN predictions for
    // the same symbol on different days is never all closed against the
    // close of just one of those days. Falls back to symbol-only for
    // backward compatibility with older callers.
    const c = closes[`${p.symbol}|${p.date}`] ?? closes[p.symbol];
    if (!c) continue;
    const close = Number(c.close);
    if (!Number.isFinite(close)) continue;
    p.actualClose = round2(close);
    p.intradayLow = c.intradayLow != null ? round2(Number(c.intradayLow)) : null;
    p.stopHit = Boolean(c.hitStop);

    if (p.stopHit) {
      p.result = 'STOPPED';
    } else if (p.baseCase != null && close >= p.baseCase) {
      p.result = 'WIN';
    } else if (
      p.bearCase != null &&
      p.bullCase != null &&
      close >= p.bearCase &&
      close <= p.bullCase
    ) {
      p.result = 'PARTIAL';
    } else if (p.bearCase != null && close < p.bearCase) {
      p.result = 'LOSS';
    } else {
      p.result = 'PARTIAL';
    }

    // `entry` is stored as a [low, high] range, not a single price — use the
    // midpoint so returnPct is a real number instead of arithmetic on an array.
    const entryMid = Array.isArray(p.entry)
      ? (Number(p.entry[0]) + Number(p.entry[1])) / 2
      : p.entry != null
        ? Number(p.entry)
        : null;

    if (p.baseCase != null) p.errorPct = round2(((close - p.baseCase) / p.baseCase) * 100);
    if (entryMid != null && Number.isFinite(entryMid) && entryMid > 0) {
      p.returnPct = round2(((close - entryMid) / entryMid) * 100);
    }
    if (p.predictionPrice != null) p.directionCorrect = close > p.predictionPrice;
    p.evaluatedAt = new Date().toISOString();
    p.status = 'CLOSED';
    updated += 1;
  }
  save(arr);
  return { updated };
}

export function getPredictions() {
  return load();
}

export function weeklyStats() {
  const arr = load().filter((p) => p.status === 'CLOSED');
  const byWeek = {};
  for (const p of arr) {
    const w = p.week ?? isoWeek(p.date);
    (byWeek[w] ??= []).push(p);
  }

  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const summary = (list) => {
    const total = list.length;
    const wins = list.filter((p) => p.result === 'WIN').length;
    const partials = list.filter((p) => p.result === 'PARTIAL').length;
    const losses = list.filter((p) => p.result === 'LOSS').length;
    const stopped = list.filter((p) => p.result === 'STOPPED').length;
    const buyClass = list.filter((p) => /BUY/.test(p.signal ?? p.classification ?? ''));
    const falseBuys = buyClass.filter((p) => p.result === 'LOSS' || p.result === 'STOPPED').length;
    const returns = list.map((p) => p.returnPct).filter((x) => x != null);
    const errors = list.map((p) => p.errorPct).filter((x) => x != null);
    const dirs = list.map((p) => p.directionCorrect).filter((x) => x != null);
    const avg = (xs) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return {
      total,
      winRate: total ? round2((wins / total) * 100) : null,
      partialRate: total ? round2((partials / total) * 100) : null,
      lossRate: total ? round2((losses / total) * 100) : null,
      stoppedRate: total ? round2((stopped / total) * 100) : null,
      directionalAccuracy: dirs.length ? round2((dirs.filter(Boolean).length / dirs.length) * 100) : null,
      avgPredictionError: avg(errors),
      medianPredictionError: median(errors) != null ? round2(median(errors)) : null,
      avgReturn: avg(returns),
      riskAdjustedReturn: returns.length ? round2(avg(returns) / Math.max(1, -Math.min(...returns))) : null,
      maxDrawdown: returns.length ? round2(Math.min(...returns)) : null,
      falseBuyRate: buyClass.length ? round2((falseBuys / buyClass.length) * 100) : null,
      byConfidence: groupBy(list, (p) => p.confidence, summarySlice),
      bySector: groupBy(list, (p) => p.sector, summarySlice),
      bySetupType: groupBy(list, (p) => p.signal ?? 'N/A', summarySlice),
    };
  };

  const summarySlice = (list) => {
    const total = list.length;
    const wins = list.filter((p) => p.result === 'WIN').length;
    const partials = list.filter((p) => p.result === 'PARTIAL').length;
    return {
      total,
      wins,
      partials,
      losses: list.filter((p) => p.result === 'LOSS').length,
      stopped: list.filter((p) => p.result === 'STOPPED').length,
    };
  };

  return {
    overall: summary(arr),
    byWeek: Object.fromEntries(Object.entries(byWeek).map(([w, l]) => [w, summary(l)])),
    note: 'Optimised for risk-adjusted returns and out-of-sample accuracy, not simply for a higher win count.',
  };
}

function groupBy(list, keyFn, reducer) {
  const groups = {};
  for (const p of list) {
    const k = keyFn(p) ?? 'N/A';
    (groups[k] ??= []).push(p);
  }
  return Object.fromEntries(Object.entries(groups).map(([k, l]) => [k, reducer(l)]));
}
