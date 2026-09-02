import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { round2 } from '../utils/helpers.js';
import { dayKey } from './officialClose.js';
import { getTradingDayStatus } from './nseTradingCalendar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'predictions.json');

// ── Config ────────────────────────────────────────────────────────────────────
export const MORNING_WINDOW_START_MINUTES = 9 * 60 + 20; // 09:20 IST
export const MORNING_WINDOW_END_MINUTES = 9 * 60 + 35; // 09:35 IST
export const DAILY_CUTOFF_MINUTES = MORNING_WINDOW_END_MINUTES; // backwards-compatible export
export const NEUTRAL_BAND_PCT = 0.35;
export const MIN_SAMPLE_FOR_ACCURACY = 30;

// ── Persistence ───────────────────────────────────────────────────────────────
function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
}
function load() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]'); }
  catch { return []; }
}
function save(arr) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoWeek(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function istMinutesOfDay(ts) {
  const d = ts ? new Date(ts) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function isMorningPredictionWindow(ts = new Date()) {
  const minutes = istMinutesOfDay(ts);
  const date = ts instanceof Date ? ts : new Date(ts);
  return getTradingDayStatus(date).isTradingDay
    && minutes >= MORNING_WINDOW_START_MINUTES
    && minutes <= MORNING_WINDOW_END_MINUTES;
}

function avg(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
function median(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
function groupBy(list, keyFn, reducer) {
  const g = {};
  for (const p of list) { const k = keyFn(p) ?? 'N/A'; (g[k] ??= []).push(p); }
  return Object.fromEntries(Object.entries(g).map(([k, l]) => [k, reducer(l)]));
}

// ── Core evaluation (pure — reusable for backtest) ────────────────────────────
export function evaluatePrediction(prediction, session) {
  const SYNTHETIC_RE = /synthetic|mock|demo|fake|test|development/i;

  if (!session || session.close == null) {
    return { validationStatus: 'AWAITING_VERIFIED_CLOSE', predictionResult: 'AWAITING_VERIFIED_CLOSE' };
  }
  if (session.status === 'DATA_INVALID' || (session.source && SYNTHETIC_RE.test(String(session.source)))) {
    return { validationStatus: 'DATA_INVALID', predictionResult: 'DATA_INVALID' };
  }
  if (!prediction.predictionPrice || !Number.isFinite(Number(prediction.predictionPrice))) {
    return { validationStatus: 'DATA_INVALID', predictionResult: 'DATA_INVALID' };
  }

  const actualClose = Number(session.close);
  const actualHigh  = session.high  != null ? Number(session.high)  : null;
  const actualLow   = session.low   != null ? Number(session.low)   : null;
  const predPrice   = Number(prediction.predictionPrice);
  const baseCase    = prediction.baseCase  != null ? Number(prediction.baseCase)  : null;
  const target1     = prediction.target1   != null ? Number(prediction.target1)   : null;
  const target2     = prediction.target2   != null ? Number(prediction.target2)   : null;
  const invPrice    = prediction.invalidationPrice ?? prediction.stopLoss;
  const invalidation = invPrice != null ? Number(invPrice) : null;
  const outlook = prediction.directionalOutlook ?? 'NEUTRAL';

  const actualReturnPct = round2(((actualClose - predPrice) / predPrice) * 100);

  let directionCorrect = null;
  let predictionResult;
  if (outlook === 'BULLISH') {
    directionCorrect = actualReturnPct > 0;
    predictionResult = directionCorrect ? 'CORRECT' : 'WRONG';
  } else if (outlook === 'BEARISH') {
    directionCorrect = actualReturnPct < 0;
    predictionResult = directionCorrect ? 'CORRECT' : 'WRONG';
  } else {
    const absMove = Math.abs(actualReturnPct);
    directionCorrect = absMove <= NEUTRAL_BAND_PCT;
    predictionResult = directionCorrect ? 'NEUTRAL_CORRECT' : 'NEUTRAL_WRONG';
  }

  const closeErrorPct     = baseCase != null && baseCase > 0 ? round2(((actualClose - baseCase) / baseCase) * 100) : null;
  const absoluteErrorPct  = closeErrorPct != null ? round2(Math.abs(closeErrorPct)) : null;
  const closeErrorRs      = baseCase != null ? round2(actualClose - baseCase) : null;

  let target1Hit = null, target2Hit = null;
  if (outlook === 'BULLISH') {
    if (target1 != null && actualHigh != null) target1Hit = actualHigh >= target1;
    if (target2 != null && actualHigh != null) target2Hit = actualHigh >= target2;
  } else if (outlook === 'BEARISH') {
    if (target1 != null && actualLow != null) target1Hit = actualLow <= target1;
    if (target2 != null && actualLow != null) target2Hit = actualLow <= target2;
  }

  let invalidationHit = null;
  if (outlook === 'BULLISH' && invalidation != null && actualLow  != null) invalidationHit = actualLow  <= invalidation;
  if (outlook === 'BEARISH' && invalidation != null && actualHigh != null) invalidationHit = actualHigh >= invalidation;

  // Action quality is separate from direction quality. AVOID/WATCH/NO TRADE
  // are abstentions and are not scored as bearish calls. Only an executable
  // long trade has a realised action result; 15 bps covers basic friction.
  const executableLong = prediction.tradeStatus === 'EXECUTABLE'
    && ['BUY', 'STRONG BUY'].includes(prediction.signal);
  const netTradeReturnPct = executableLong ? round2(actualReturnPct - 0.15) : null;
  const actionResult = executableLong ? (netTradeReturnPct > 0 ? 'PROFIT' : 'LOSS') : 'NOT_SCORED_NO_TRADE';
  const actionCorrect = executableLong ? netTradeReturnPct > 0 : null;

  return {
    actualClose, actualHigh, actualLow, actualReturnPct,
    predictedDirection: outlook,
    actualDirection: actualReturnPct > 0 ? 'UP' : actualReturnPct < 0 ? 'DOWN' : 'FLAT',
    directionCorrect, predictionResult,
    predictedClose: baseCase, closeErrorPct, absoluteErrorPct, closeErrorRs,
    target1Hit, target2Hit, invalidationHit,
    actionResult, actionCorrect, netTradeReturnPct,
    validationStatus: 'OK',
  };
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export function calculatePredictionStats(predictions, { minSample = MIN_SAMPLE_FOR_ACCURACY } = {}) {
  const evaluated = predictions.filter((p) =>
    p.predictionResult && !['AWAITING_VERIFIED_CLOSE', 'DATA_INVALID'].includes(p.predictionResult)
  );
  const total     = evaluated.length;
  const correct   = evaluated.filter((p) => ['CORRECT', 'NEUTRAL_CORRECT'].includes(p.predictionResult)).length;
  const wrong     = evaluated.filter((p) => ['WRONG', 'NEUTRAL_WRONG'].includes(p.predictionResult)).length;
  const bullish   = evaluated.filter((p) => p.directionalOutlook === 'BULLISH');
  const bearish   = evaluated.filter((p) => p.directionalOutlook === 'BEARISH');
  const neutral   = evaluated.filter((p) => p.directionalOutlook === 'NEUTRAL');
  const executable = evaluated.filter((p) => p.tradeStatus === 'EXECUTABLE');
  const bCorrect  = bullish.filter((p) => p.predictionResult === 'CORRECT').length;
  const brCorrect = bearish.filter((p) => p.predictionResult === 'CORRECT').length;
  const nCorrect  = neutral.filter((p) => p.predictionResult === 'NEUTRAL_CORRECT').length;
  const execCorrect = executable.filter((p) => p.actionCorrect === true).length;
  const absPcts   = evaluated.map((p) => p.absoluteErrorPct).filter((x) => x != null);
  const dirAccuracy = total >= minSample ? round2((correct / total) * 100) : null;
  const execAccuracy = executable.length >= minSample ? round2((execCorrect / executable.length) * 100) : null;

  return {
    sampleSize: total,
    sufficientSample: total >= minSample,
    correct, wrong,
    directionAccuracyPct: dirAccuracy,
    directionAccuracyLabel: total >= minSample
      ? `${correct}/${total} correct (${dirAccuracy}%)`
      : `Insufficient sample size (${total}/${minSample} required)`,
    bullish:  { total: bullish.length,   correct: bCorrect,  accuracyPct: bullish.length  > 0 ? round2((bCorrect  / bullish.length)  * 100) : null },
    bearish:  { total: bearish.length,   correct: brCorrect, accuracyPct: bearish.length  > 0 ? round2((brCorrect / bearish.length)  * 100) : null },
    neutral:  { total: neutral.length,   correct: nCorrect,  accuracyPct: neutral.length  > 0 ? round2((nCorrect  / neutral.length)  * 100) : null },
    executableTrades: {
      total: executable.length, correct: execCorrect, accuracyPct: execAccuracy,
      label: executable.length >= minSample
        ? `${execCorrect}/${executable.length} (${execAccuracy}%)`
        : `Insufficient sample size (${executable.length}/${minSample} required)`,
    },
    target1Hits:      evaluated.filter((p) => p.target1Hit      === true).length,
    target2Hits:      evaluated.filter((p) => p.target2Hit      === true).length,
    invalidationHits: evaluated.filter((p) => p.invalidationHit === true).length,
    avgAbsoluteErrorPct:    avg(absPcts),
    medianAbsoluteErrorPct: median(absPcts),
  };
}

export function calculateDailyStats(predictions, date) {
  const forDate   = predictions.filter((p) => p.date === date);
  const finals    = forDate.filter((p) => p.isFinalForDay === true);
  const base      = finals.length > 0 ? finals : forDate;
  const evaluated = base.filter((p) =>
    p.predictionResult && !['AWAITING_VERIFIED_CLOSE', 'DATA_INVALID'].includes(p.predictionResult)
  );
  const correct   = evaluated.filter((p) => ['CORRECT', 'NEUTRAL_CORRECT'].includes(p.predictionResult)).length;
  const wrong     = evaluated.filter((p) => ['WRONG', 'NEUTRAL_WRONG'].includes(p.predictionResult)).length;
  const bull = evaluated.filter((p) => p.directionalOutlook === 'BULLISH');
  const bear = evaluated.filter((p) => p.directionalOutlook === 'BEARISH');
  const neut = evaluated.filter((p) => p.directionalOutlook === 'NEUTRAL');
  return {
    date, totalPredictions: forDate.length, evaluatedPredictions: evaluated.length,
    correct, wrong,
    accuracyPct: evaluated.length > 0 ? round2((correct / evaluated.length) * 100) : null,
    bullishPredictions: bull.length, bullishCorrect: bull.filter((p) => p.predictionResult === 'CORRECT').length,
    bearishPredictions: bear.length, bearishCorrect: bear.filter((p) => p.predictionResult === 'CORRECT').length,
    neutralPredictions: neut.length, neutralCorrect: neut.filter((p) => p.predictionResult === 'NEUTRAL_CORRECT').length,
    target1Hits:      evaluated.filter((p) => p.target1Hit      === true).length,
    target2Hits:      evaluated.filter((p) => p.target2Hit      === true).length,
    invalidationHits: evaluated.filter((p) => p.invalidationHit === true).length,
    averageAbsoluteErrorPct: avg(evaluated.map((p) => p.absoluteErrorPct).filter((x) => x != null)),
  };
}

export function calculateRollingStats(predictions, window) {
  const evaluated = predictions
    .filter((p) => p.predictionResult && !['AWAITING_VERIFIED_CLOSE', 'DATA_INVALID'].includes(p.predictionResult))
    .sort((a, b) => new Date(b.predictionTimestamp || b.createdAt) - new Date(a.predictionTimestamp || a.createdAt))
    .slice(0, window);
  return { window, ...calculatePredictionStats(evaluated, { minSample: MIN_SAMPLE_FOR_ACCURACY }) };
}

export function detectBiasWarnings(predictions, { minSample = 10, edgeMinSample = MIN_SAMPLE_FOR_ACCURACY } = {}) {
  const evaluated = predictions.filter((p) =>
    p.predictionResult && !['AWAITING_VERIFIED_CLOSE', 'DATA_INVALID'].includes(p.predictionResult)
  );
  const warnings = [];
  const recentBull = evaluated.filter((p) => p.directionalOutlook === 'BULLISH').slice(-minSample);
  if (recentBull.length >= minSample) {
    const w = recentBull.filter((p) => p.predictionResult === 'WRONG').length;
    if (w / recentBull.length >= 0.7)
      warnings.push(`MODEL WARNING: Strong bullish-direction failure detected. ${w} of the last ${recentBull.length} bullish predictions moved downward.`);
  }
  const recentBear = evaluated.filter((p) => p.directionalOutlook === 'BEARISH').slice(-minSample);
  if (recentBear.length >= minSample) {
    const w = recentBear.filter((p) => p.predictionResult === 'WRONG').length;
    if (w / recentBear.length >= 0.7)
      warnings.push(`MODEL WARNING: Bearish predictions are currently performing poorly. ${w} of the last ${recentBear.length} bearish predictions moved upward.`);
  }
  if (evaluated.length >= edgeMinSample) {
    const correct = evaluated.filter((p) => ['CORRECT', 'NEUTRAL_CORRECT'].includes(p.predictionResult)).length;
    const acc = (correct / evaluated.length) * 100;
    if (acc < 45)
      warnings.push(`MODEL WARNING: Model may have a directional bias problem. Accuracy is ${round2(acc)}% over the last ${evaluated.length} evaluated predictions — significantly below 50%. Review indicators, data freshness, and signal interpretation.`);
    else if (acc < 55)
      warnings.push(`Model currently shows weak directional edge. Accuracy is ${round2(acc)}% over the last ${evaluated.length} evaluated predictions (near random). More data needed before conclusions.`);
  }
  return warnings;
}

// ── Snapshot storage ──────────────────────────────────────────────────────────
export function recordPrediction(rec) {
  const arr = load();
  const date = rec.date ?? dayKey();
  const now  = new Date().toISOString();
  const entry = {
    id: `${rec.symbol}-${date}-${Date.now()}`,
    date, week: isoWeek(date),
    predictionTimestamp: rec.predictionTimestamp ?? now,
    symbol: rec.symbol, sector: rec.sector ?? 'N/A',
    predictionPrice: rec.predictionPrice ?? null,
    directionalOutlook: rec.directionalOutlook ?? null,
    directionalScore:   rec.directionalScore   ?? null,
    signal:      rec.signal      ?? null,
    tradeStatus: rec.tradeStatus ?? null,
    expectedMovePct: rec.expectedMovePct ?? null,
    expectedRange:   rec.expectedRange   ?? null,
    baseCase: rec.baseCase ?? null,
    bullCase: rec.bullCase ?? null,
    bearCase: rec.bearCase ?? null,
    entry:        rec.entry        ?? null,
    confirmation: rec.confirmation ?? null,
    target1:      rec.target1      ?? null,
    target2:      rec.target2      ?? null,
    invalidationPrice: rec.invalidationPrice ?? rec.stopLoss ?? null,
    stopLoss:          rec.stopLoss          ?? null,
    marketRegime:        rec.marketRegime        ?? null,
    score:               rec.score               ?? null,
    evidenceQualityScore: rec.evidenceQualityScore ?? rec.confidenceScore ?? null,
    dataStatus:   rec.dataStatus   ?? null,
    modelVersion: rec.modelVersion ?? null,
    snapshotType: rec.snapshotType ?? (() => {
      const mins = istMinutesOfDay(rec.predictionTimestamp ?? now);
      return mins >= MORNING_WINDOW_START_MINUTES && mins <= MORNING_WINDOW_END_MINUTES ? 'MORNING_OPEN' : 'INTRADAY';
    })(),
    snapshotBatchStartedAt: rec.snapshotBatchStartedAt ?? null,
    isFinalForDay: rec.isFinalForDay ?? false,
    status: 'OPEN',
    createdAt: now,
  };
  arr.push(entry);
  save(arr);
  return entry;
}

export function hasPredictionFor(symbol, date) {
  return load().some((p) => p.symbol === symbol && p.date === date);
}

export function recordFromAnalysis(result, date = dayKey(), options = {}) {
  const e = result?.engine;
  if (!result?.symbol || !e) return null;
  const now = new Date();
  const batchStartedAt = options.batchStartedAt ? new Date(options.batchStartedAt) : null;
  if (!isMorningPredictionWindow(now) && !isMorningPredictionWindow(batchStartedAt)) return null;
  if (hasPredictionFor(result.symbol, date)) return null;
  return recordPrediction({
    date,
    predictionTimestamp: result.dataTimestamp ?? now.toISOString(),
    snapshotType: 'MORNING_OPEN',
    snapshotBatchStartedAt: batchStartedAt?.toISOString() ?? now.toISOString(),
    symbol: result.symbol, sector: 'N/A',
    predictionPrice:    result.price,
    directionalOutlook: e.directionalOutlook ?? null,
    directionalScore:   e.directionalScore   ?? null,
    signal:      e.signal,
    tradeStatus: e.tradeStatus ?? null,
    expectedMovePct: e.closingRange?.expectedMovePct ?? null,
    expectedRange:   e.closingRange?.range           ?? null,
    baseCase:        e.closingRange?.base            ?? null,
    bullCase:        e.closingRange?.bull            ?? null,
    bearCase:        e.closingRange?.bear            ?? null,
    entry:             e.buy?.preferredEntryRange ?? null,
    confirmation:      e.buy?.confirmationPrice   ?? null,
    target1:           e.buy?.target1             ?? null,
    target2:           e.buy?.target2             ?? null,
    invalidationPrice: e.buy?.stopLoss            ?? null,
    stopLoss:          e.buy?.stopLoss            ?? null,
    marketRegime:        result.market?.regime ?? null,
    score:               e.totalScore,
    evidenceQualityScore: e.evidenceQualityScore ?? null,
    dataStatus:   e.dataStatus,
    modelVersion: e.modelVersion,
  });
}

export function freezeDailyPredictions(date = dayKey()) {
  const arr = load();
  const forDate = arr.filter((p) => p.date === date && p.status === 'OPEN');
  const bySymbol = {};
  for (const p of forDate) {
    const mins = istMinutesOfDay(p.predictionTimestamp ?? p.createdAt);
    if (p.snapshotType === 'MORNING_OPEN' || (p.snapshotType == null && mins >= MORNING_WINDOW_START_MINUTES && mins <= MORNING_WINDOW_END_MINUTES)) {
      const ts = new Date(p.predictionTimestamp || p.createdAt);
      if (!bySymbol[p.symbol] || ts > new Date(bySymbol[p.symbol].predictionTimestamp || bySymbol[p.symbol].createdAt))
        bySymbol[p.symbol] = p;
    }
  }
  let frozen = 0;
  for (const p of Object.values(bySymbol)) { p.isFinalForDay = true; frozen++; }
  if (frozen > 0) save(arr);
  return frozen;
}

export function evaluatePredictions(closes) {
  const arr = load();
  let updated = 0;
  for (const p of arr) {
    if (p.status !== 'OPEN') continue;
    const session = closes[`${p.symbol}|${p.date}`] ?? closes[p.symbol];
    if (!session) continue;
    const result = evaluatePrediction(p, session);
    p.actualClose      = result.actualClose      ?? null;
    p.actualHigh       = result.actualHigh       ?? null;
    p.actualLow        = result.actualLow        ?? null;
    p.actualReturnPct  = result.actualReturnPct  ?? null;
    p.actualDirection  = result.actualDirection  ?? null;
    p.directionCorrect = result.directionCorrect ?? null;
    p.predictionResult = result.predictionResult;
    p.closeErrorPct    = result.closeErrorPct    ?? null;
    p.absoluteErrorPct = result.absoluteErrorPct ?? null;
    p.closeErrorRs     = result.closeErrorRs     ?? null;
    p.target1Hit       = result.target1Hit       ?? null;
    p.target2Hit       = result.target2Hit       ?? null;
    p.invalidationHit  = result.invalidationHit  ?? null;
    p.actionResult     = result.actionResult     ?? null;
    p.actionCorrect    = result.actionCorrect    ?? null;
    p.netTradeReturnPct = result.netTradeReturnPct ?? null;
    p.validationStatus    = result.validationStatus;
    p.actualCloseTimestamp = new Date().toISOString();
    p.actualDataSource    = session.source ?? 'unknown';
    p.evaluatedAt         = new Date().toISOString();
    if (result.predictionResult === 'AWAITING_VERIFIED_CLOSE') {
      // keep OPEN — retry next run
    } else if (result.predictionResult === 'DATA_INVALID') {
      p.status = 'INVALID';
    } else {
      p.status = 'CLOSED';
    }
    updated += 1;
  }
  save(arr);
  return { updated };
}

// ── Queries ───────────────────────────────────────────────────────────────────
export function getPredictions() { return load(); }

export function getLatestPrediction(symbol) {
  const all = load().filter((p) => p.symbol === symbol);
  return all.sort((a, b) => new Date(b.predictionTimestamp || b.createdAt) - new Date(a.predictionTimestamp || a.createdAt))[0] ?? null;
}

export function getDailyFinalPredictions(date = dayKey()) {
  const all    = load().filter((p) => p.date === date);
  const finals = all.filter((p) => p.isFinalForDay === true);
  return finals.length > 0 ? finals : all;
}

export function weeklyStats() {
  const arr = load().filter((p) => ['CLOSED', 'INVALID'].includes(p.status));
  const byWeek = {};
  for (const p of arr) { const w = p.week ?? isoWeek(p.date); (byWeek[w] ??= []).push(p); }
  return {
    overall: calculatePredictionStats(arr),
    byWeek: Object.fromEntries(Object.entries(byWeek).map(([w, l]) => [w, calculatePredictionStats(l)])),
    byDirectionalOutlook: groupBy(arr, (p) => p.directionalOutlook ?? 'N/A', calculatePredictionStats),
    note: 'Directional accuracy: CORRECT means price moved in the predicted direction. Sample size shown. Never adjusted retroactively.',
  };
}

export function allStats() {
  const arr    = load();
  const closed = arr.filter((p) => p.status === 'CLOSED');
  const today  = dayKey();
  return {
    daily:   calculateDailyStats(arr, today),
    rolling: {
      last10:  calculateRollingStats(closed, 10),
      last25:  calculateRollingStats(closed, 25),
      last50:  calculateRollingStats(closed, 50),
      last100: calculateRollingStats(closed, 100),
      last250: calculateRollingStats(closed, 250),
    },
    overall:  calculatePredictionStats(closed),
    warnings: detectBiasWarnings(closed),
    open:          arr.filter((p) => p.status === 'OPEN').length,
    totalRecorded: arr.length,
  };
}
