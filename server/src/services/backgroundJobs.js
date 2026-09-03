import { prisma } from '../config/prisma.js';
import { evaluateAlerts } from './alertService.js';
import { logInfra } from '../utils/helpers.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { getPredictions, evaluatePredictions, freezeDailyPredictions, recordFromAnalysis } from './predictionTracker.js';
import { isMorningPredictionWindow } from './predictionTracker.js';
import { isPastClose, getOfficialOHLC, dayKey } from './officialClose.js';
import { analyzeStock } from './stockAnalysisService.js';
import { getIntradaySchedule } from './intradayPredictionTimeline.js';

let alertTimer = null;
let expiryTimer = null;
let predictionEvalTimer = null;
let morningPredictionTimer = null;
let alertRunning = false;
let predictionEvalRunning = false;
let morningPredictionRunning = false;
let morningPredictionCompletedDate = null;
let intradayCheckpointRunning = false;
const completedIntradayCheckpoints = new Set();

// Was a hardcoded ~48-symbol large-cap list — any stock outside it (e.g.
// TATAPOWER) never got an automatic checkpoint prediction at all: its
// 09:20/11:30/13:15/14:30 rows only ever appeared if a user happened to open
// that exact stock's page during the exact checkpoint window. Every
// checkpoint job now pulls the same tracked-equity universe already used
// everywhere else in the app (Radar's full scan, the Markets "All Equities"
// tab), so a stock's scheduled predictions run whether or not anyone is
// looking at it. Cached briefly since this only needs to run ~4 times/day —
// no need to hit the DB freshly on every single checkpoint check tick.
let universeCache = { at: 0, symbols: null };
const UNIVERSE_CACHE_TTL_MS = 15 * 60_000;
async function getTrackedUniverse() {
  if (universeCache.symbols && Date.now() - universeCache.at < UNIVERSE_CACHE_TTL_MS) return universeCache.symbols;
  const rows = await prisma.scanUniverse.findMany({
    where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
    select: { symbol: true },
  });
  const symbols = rows.map((r) => r.symbol);
  universeCache = { at: Date.now(), symbols };
  return symbols;
}

export async function runMorningPredictionLoop(now = new Date()) {
  const today = dayKey(now);
  if (!isMorningPredictionWindow(now) || morningPredictionRunning || morningPredictionCompletedDate === today) return { skipped: true };
  morningPredictionRunning = true;
  try {
    const existing = new Set(getPredictions()
      .filter((p) => p.date === today && p.snapshotType === 'MORNING_OPEN')
      .map((p) => p.symbol));
    const universe = await getTrackedUniverse();
    const pending = universe.filter((symbol) => !existing.has(symbol));
    let analysed = 0;
    let recorded = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i += 5) {
      const batch = pending.slice(i, i + 5);
      const results = await Promise.all(batch.map((symbol) => analyzeStock(symbol, { includeNews: true }).catch(() => null)));
      analysed += results.filter((result) => result?.ok).length;
      recorded += results.filter((result) => result?.ok && recordFromAnalysis(result, today, { batchStartedAt: now }) != null).length;
      failed += results.filter((result) => !result?.ok).length;
    }
    morningPredictionCompletedDate = today;
    freezeDailyPredictions(today);
    logInfra('info', 'predictions', `Automatic morning scan completed: ${analysed} analysed, ${recorded} newly recorded, ${failed} failed, ${existing.size} already recorded`);
    return { skipped: false, analysed, recorded, failed, alreadyRecorded: existing.size };
  } catch (err) {
    logInfra('error', 'predictions', `Automatic morning scan failed: ${err.message}`);
    return { skipped: false, error: err.message };
  } finally {
    morningPredictionRunning = false;
  }
}

export async function runScheduledIntradayPredictionLoop(now = new Date()) {
  const schedule = getIntradaySchedule(now);
  const checkpoint = schedule.activeCheckpoint;
  if (!checkpoint || intradayCheckpointRunning) return { skipped: true, nextPredictionAt: schedule.nextPredictionAt };
  const key = `${dayKey(now)}:${checkpoint.key}`;
  if (completedIntradayCheckpoints.has(key)) return { skipped: true, completed: true, nextPredictionAt: schedule.nextPredictionAt };
  if (checkpoint.key === 'OPEN') {
    const result = await runMorningPredictionLoop(now);
    if (!result.error) completedIntradayCheckpoints.add(key);
    return { ...result, checkpoint: checkpoint.key, nextPredictionAt: schedule.nextPredictionAt };
  }
  intradayCheckpointRunning = true;
  try {
    const universe = await getTrackedUniverse();
    let analysed = 0;
    let failed = 0;
    for (let i = 0; i < universe.length; i += 5) {
      const batch = universe.slice(i, i + 5);
      const results = await Promise.all(batch.map((symbol) => analyzeStock(symbol, { includeNews: true }).catch(() => null)));
      analysed += results.filter((result) => result?.ok).length;
      failed += results.filter((result) => !result?.ok).length;
    }
    completedIntradayCheckpoints.add(key);
    logInfra('info', 'predictions', `Intraday ${checkpoint.label} checkpoint completed: ${analysed} analysed, ${failed} failed`);
    return { skipped: false, checkpoint: checkpoint.key, analysed, failed, nextPredictionAt: schedule.nextPredictionAt };
  } catch (err) {
    logInfra('error', 'predictions', `Intraday checkpoint failed: ${err.message}`);
    return { skipped: false, checkpoint: checkpoint.key, error: err.message, nextPredictionAt: schedule.nextPredictionAt };
  } finally {
    intradayCheckpointRunning = false;
  }
}

/**
 * Evaluates every OPEN prediction against the OFFICIAL end-of-day OHLC,
 * never a live tick. No-ops before market close; safe to call repeatedly —
 * already-CLOSED predictions are skipped, and a symbol whose official close
 * hasn't been published yet just gets picked up on the next run.
 *
 * Also freezes daily final predictions (isFinalForDay=true) at or after
 * 14:30 IST, before the evaluation pass, so the daily-final snapshot is
 * locked before the close arrives.
 */
async function runPredictionCloseEvaluationLoop() {
  if (predictionEvalRunning) return;
  predictionEvalRunning = true;
  try {
    if (!isPastClose()) return;

    // Freeze the daily final prediction (14:30 IST cutoff) so the snapshot
    // that gets evaluated is the one made closest to cutoff — not a later one.
    const today = dayKey();
    freezeDailyPredictions(today);

    const open = getPredictions().filter((p) => p.status === 'OPEN');
    if (!open.length) return;

    const provider = getMarketDataProvider();
    const closes = {};
    const seen = new Set();
    for (const p of open) {
      const key = `${p.symbol}|${p.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ohlc = await getOfficialOHLC(provider, p.symbol, p.date).catch(() => null);
      if (ohlc != null) closes[key] = ohlc; // { status, close, high, low, source }
    }

    if (Object.keys(closes).length) {
      const { updated } = evaluatePredictions(closes);
      if (updated > 0) {
        logInfra('info', 'predictions', `Evaluated ${updated} prediction(s) against the official OHLC`);
      }
    }
  } catch (err) {
    logInfra('error', 'predictions', `Prediction close-evaluation loop failed: ${err.message}`);
  } finally {
    predictionEvalRunning = false;
  }
}

/**
 * Evaluates every active alert across all users. Runs continuously so alerts
 * fire without requiring a manual "Evaluate now" click.
 */
async function runAlertLoop() {
  if (alertRunning) return;
  alertRunning = true;
  try {
    const users = await prisma.alert.findMany({
      where: { active: true },
      distinct: ['userId'],
      select: { userId: true },
    });
    for (const { userId } of users) {
      try {
        await evaluateAlerts(userId);
      } catch (err) {
        logInfra('warn', 'alerts', `Alert loop user ${userId}: ${err.message}`);
      }
    }
  } catch (err) {
    logInfra('error', 'alerts', `Alert loop failed: ${err.message}`);
  } finally {
    alertRunning = false;
  }
}

/**
 * Flips broker connections whose stored token expiry has passed to EXPIRED so
 * stale connections are not treated as healthy.
 */
async function runExpiryLoop() {
  try {
    const result = await prisma.brokerConnection.updateMany({
      where: { status: 'CONNECTED', expiryAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    if (result.count > 0) {
      logInfra('info', 'brokers', `Expired ${result.count} broker connection(s)`);
    }
  } catch (err) {
    logInfra('error', 'brokers', `Expiry loop failed: ${err.message}`);
  }
}

export function startBackgroundJobs() {
  runAlertLoop();
  runExpiryLoop();
  runPredictionCloseEvaluationLoop();
  runScheduledIntradayPredictionLoop();
  alertTimer = setInterval(runAlertLoop, 30_000);
  expiryTimer = setInterval(runExpiryLoop, 60 * 60 * 1000);
  // No-ops before close, so polling every 15 minutes is cheap; frequent
  // enough to catch EOD data as soon as it's published after 15:30 IST.
  predictionEvalTimer = setInterval(runPredictionCloseEvaluationLoop, 15 * 60 * 1000);
  morningPredictionTimer = setInterval(runScheduledIntradayPredictionLoop, 30_000);
  if (typeof alertTimer.unref === 'function') alertTimer.unref();
  if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
  if (typeof predictionEvalTimer.unref === 'function') predictionEvalTimer.unref();
  if (typeof morningPredictionTimer.unref === 'function') morningPredictionTimer.unref();
  logInfra('info', 'app', 'Background jobs started (holiday-aware predictions at 09:20, 11:30, 13:15, 14:30 IST; alerts every 30s; close evaluation every 15min)');
}

export function stopBackgroundJobs() {
  if (alertTimer) clearInterval(alertTimer);
  if (predictionEvalTimer) clearInterval(predictionEvalTimer);
  if (morningPredictionTimer) clearInterval(morningPredictionTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  alertTimer = null;
  expiryTimer = null;
  predictionEvalTimer = null;
  morningPredictionTimer = null;
  // Stop the live-quote poller managed by the market-data provider.
  try {
    const provider = getMarketDataProvider();
    if (typeof provider.stopLivePoller === 'function') provider.stopLivePoller();
  } catch {
    // Provider not initialized — nothing to stop.
  }
}
