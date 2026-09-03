import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey, getMarketSessionStatus } from './officialClose.js';

const DATA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'intradayPredictions.json');
export const INTRADAY_CHECKPOINTS = Object.freeze([
  { key: 'OPEN', minutes: 9 * 60 + 20, label: '09:20' },
  { key: 'MID_MORNING', minutes: 11 * 60 + 30, label: '11:30' },
  { key: 'EARLY_AFTERNOON', minutes: 13 * 60 + 15, label: '13:15' },
  { key: 'LATE_SESSION', minutes: 14 * 60 + 30, label: '14:30' },
]);

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'); } catch { return []; }
}
function save(rows) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2));
}
function istClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour')?.value) * 60 + Number(parts.find((p) => p.type === 'minute')?.value);
}
function topFactors(engine) {
  return Object.entries(engine?.subScores ?? {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Math.abs(Number(b[1]) - 50) - Math.abs(Number(a[1]) - 50))
    .slice(0, 3)
    .map(([name, score]) => ({ name, score: Number(score) }));
}

export function getIntradaySchedule(now = new Date()) {
  const session = getMarketSessionStatus(now);
  const minutes = istClock(now);
  const activeCheckpoint = session.session === 'OPEN'
    ? INTRADAY_CHECKPOINTS.find((point) => minutes >= point.minutes && minutes <= point.minutes + 5) ?? null
    : null;
  const next = session.session === 'OPEN' ? INTRADAY_CHECKPOINTS.find((point) => point.minutes > minutes) : null;
  return {
    session: session.session,
    activeCheckpoint,
    nextPredictionAt: next ? `${session.tradeDate}T${next.label}:00+05:30`
      : session.nextTradingDate ? `${session.nextTradingDate}T09:20:00+05:30` : null,
    nextPredictionLabel: next ? `${next.label} IST` : session.nextTradingDate ? `09:20 IST on ${session.nextTradingDate}` : 'Calendar unavailable',
  };
}

export function detectMaterialChanges(previous, current) {
  const changes = [];
  if (previous.signal !== current.signal) changes.push(`Signal changed from ${previous.signal} to ${current.signal}`);
  if (previous.expectedDirection !== current.expectedDirection) changes.push(`Direction changed from ${previous.expectedDirection} to ${current.expectedDirection}`);
  if (Math.abs(previous.confidence - current.confidence) >= 10) changes.push(`Evidence quality changed by ${Math.abs(previous.confidence - current.confidence)} points`);
  if (previous.price > 0 && Math.abs(current.price - previous.price) / previous.price >= 0.005) changes.push(`Price moved ${((current.price - previous.price) / previous.price * 100).toFixed(2)}%`);
  if (previous.predictedClose > 0 && current.predictedClose > 0
    && Math.abs(current.predictedClose - previous.predictedClose) / previous.predictedClose >= 0.0035) {
    changes.push(`Predicted close changed ${((current.predictedClose - previous.predictedClose) / previous.predictedClose * 100).toFixed(2)}%`);
  }
  const previousHigh = previous.targetZone?.[1];
  const currentHigh = current.targetZone?.[1];
  if (previousHigh > 0 && currentHigh > 0 && Math.abs(currentHigh - previousHigh) / previousHigh >= 0.005) {
    changes.push(`Target zone changed ${((currentHigh - previousHigh) / previousHigh * 100).toFixed(2)}%`);
  }
  if (previous.stopLoss && current.stopLoss && Math.abs(current.stopLoss - previous.stopLoss) / previous.stopLoss >= 0.005) changes.push('Invalidation level changed materially');
  const oldFactors = new Map(previous.majorFactors.map((f) => [f.name, f.score]));
  for (const factor of current.majorFactors) {
    if (oldFactors.has(factor.name) && Math.abs(factor.score - oldFactors.get(factor.name)) >= 12) changes.push(`${factor.name} changed materially`);
  }
  return [...new Set(changes)];
}

// The page can be refreshed (or auto-polled) far more often than the four
// scheduled checkpoints, and live intraday quotes wobble a little on every
// tick — so "any detected change" fired a brand-new timeline row almost
// every refresh, flooding the timeline with near-duplicate entries a few
// minutes apart instead of the intended "checked at 09:20/11:30/13:15/14:30,
// or immediately if something big happens" cadence. Off-checkpoint updates
// now need a real time gap too, unless the change is urgent enough (a
// signal or direction flip) to show right away regardless of timing.
export function recordIntradayPrediction(result, now = new Date()) {
  const schedule = getIntradaySchedule(now);
  const rows = load();
  const date = dayKey(now);
  const history = rows.filter((row) => row.symbol === result?.symbol && row.tradeDate === date
    && (row.checkpoint || row.eventType === 'SCHEDULED' || row.eventType === 'MATERIAL'));
  const previous = history.at(-1) ?? null;
  if (schedule.session !== 'OPEN' || !result?.engine) return buildTimeline(result?.symbol, rows, now);

  const current = {
    id: `${result.symbol}-${now.getTime()}`,
    symbol: result.symbol,
    tradeDate: date,
    timeframe: 'INTRADAY',
    generatedAt: now.toISOString(),
    dataTimestamp: result.dataTimestamp ?? null,
    checkpoint: schedule.activeCheckpoint?.key ?? null,
    eventType: schedule.activeCheckpoint ? 'SCHEDULED' : 'MATERIAL',
    signal: result.engine.signal,
    score: result.engine.totalScore ?? null,
    confidence: result.engine.evidenceQualityScore,
    price: result.price,
    expectedDirection: result.engine.directionalOutlook,
    predictedClose: result.engine.closingRange?.base ?? null,
    targetZone: result.engine.closingRange?.range ?? null,
    expectedReturnPct: result.engine.closingRange?.expectedMovePct ?? null,
    riskReward: result.engine.buy?.riskReward ?? null,
    stopLoss: result.engine.buy?.stopLoss ?? result.entry?.stopLoss ?? null,
    riskProfile: result.risk?.volatilityPct ?? null,
    majorFactors: topFactors(result.engine),
    // Confirmation conditions: what's actually supporting this call right
    // now (reuse the same positiveFactors already shown elsewhere in the
    // app, not a re-derived duplicate list). Invalidation condition: the
    // engine's own "what would break this setup" read, when a buy plan
    // exists — falling back to the plain stop-loss level otherwise.
    confirmationConditions: (result.positiveFactors ?? []).slice(0, 4),
    invalidationCondition: result.engine.buy?.reasonSetupCouldFail
      ?? (result.entry?.stopLoss != null ? `Invalidated if price closes below ₹${result.entry.stopLoss}` : null),
    reasonForChange: [],
    status: 'ACTIVE',
    lastCheckedAt: now.toISOString(),
    latestObservation: null,
  };
  const changes = previous ? detectMaterialChanges(previous, current) : ['First prediction of the trading session'];
  const isFreshCheckpoint = Boolean(current.checkpoint) && current.checkpoint !== previous?.checkpoint;
  // There is no 15-minute prediction schedule. Off-checkpoint versions are
  // exceptional and only represent a genuinely material price, direction,
  // forecast, invalidation, or news change. Evidence-score wobble alone is
  // recorded as a refresh of the existing prediction.
  const isMaterialEmergency = previous != null && changes.some((change) =>
    /Signal changed.*BUY|Direction changed|Price moved|Predicted close changed|Target zone changed|Invalidation level changed|news changed/i.test(change));
  // The very first check of a new trading day must always be recorded, even
  // when it lands between checkpoint windows (whoever/whatever happens to
  // check the stock first on a given day rarely lands in an exact 5-minute
  // window) — otherwise a stock shows NOTHING at all (no current prediction,
  // no timeline row) for potentially hours, until the next scheduled
  // checkpoint finally arrives. This isn't "fabricating" an off-schedule
  // prediction — it's the same real engine output already being computed
  // for display elsewhere on the page; suppressing only ITS OWN recording
  // just made the intraday card and timeline empty for no benefit.
  const shouldVersion = !previous || isFreshCheckpoint || isMaterialEmergency;
  if (previous && !shouldVersion) {
    previous.lastCheckedAt = now.toISOString();
    // expectedReturnPct travels WITH predictedClose here — a consumer that
    // read a fresh predictedClose but the frozen version's older
    // expectedReturnPct would show a percentage that no longer matches
    // (predictedClose - price) / price for this same predictedClose,
    // exactly the mathematical-consistency break the whole prediction
    // pipeline is built to avoid.
    previous.latestObservation = {
      price: current.price,
      predictedClose: current.predictedClose,
      expectedReturnPct: current.expectedReturnPct,
      targetZone: current.targetZone,
      confidence: current.confidence,
      checkedAt: now.toISOString(),
    };
    save(rows);
    return buildTimeline(result.symbol, rows, now);
  }
  current.reasonForChange = changes.length ? changes : ['Scheduled checkpoint check-in'];
  if (previous) {
    previous.status = previous.signal.includes('BUY') && !current.signal.includes('BUY') ? 'INVALIDATED' : 'UPDATED';
    previous.replacedAt = current.generatedAt;
  }
  rows.push(current);
  save(rows);
  return buildTimeline(result.symbol, rows, now);
}

export function buildTimeline(symbol, source = load(), now = new Date()) {
  const date = dayKey(now);
  const schedule = getIntradaySchedule(now);
  const timeline = source.filter((row) => row.symbol === symbol && row.tradeDate === date
    && (row.checkpoint || row.eventType === 'SCHEDULED' || row.eventType === 'MATERIAL'));
  const current = timeline.at(-1) ?? null;
  const displayTimeline = timeline.map((row, index) => ({
    ...row,
    status: schedule.session === 'OPEN' ? row.status : index === timeline.length - 1 ? 'EXPIRED' : row.status,
    isCurrent: schedule.session === 'OPEN' && index === timeline.length - 1,
  }));
  return {
    current: schedule.session === 'OPEN' ? current : null,
    latest: current,
    timeline: displayTimeline,
    nextPredictionAt: schedule.nextPredictionAt,
    nextPredictionLabel: schedule.nextPredictionLabel,
    marketSession: schedule.session,
  };
}
