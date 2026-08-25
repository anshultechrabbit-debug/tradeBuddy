import { prisma } from '../config/prisma.js';
import { evaluateAlerts } from './alertService.js';
import { logInfra } from '../utils/helpers.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { getPredictions, evaluatePredictions, freezeDailyPredictions } from './predictionTracker.js';
import { isPastClose, getOfficialOHLC, dayKey } from './officialClose.js';

let alertTimer = null;
let expiryTimer = null;
let predictionEvalTimer = null;
let alertRunning = false;
let predictionEvalRunning = false;

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
  alertTimer = setInterval(runAlertLoop, 30_000);
  expiryTimer = setInterval(runExpiryLoop, 60 * 60 * 1000);
  // No-ops before close, so polling every 15 minutes is cheap; frequent
  // enough to catch EOD data as soon as it's published after 15:30 IST.
  predictionEvalTimer = setInterval(runPredictionCloseEvaluationLoop, 15 * 60 * 1000);
  if (typeof alertTimer.unref === 'function') alertTimer.unref();
  if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
  if (typeof predictionEvalTimer.unref === 'function') predictionEvalTimer.unref();
  logInfra('info', 'app', 'Background jobs started (alerts every 30s, broker expiry hourly, prediction close-evaluation every 15min)');
}

export function stopBackgroundJobs() {
  if (alertTimer) clearInterval(alertTimer);
  if (predictionEvalTimer) clearInterval(predictionEvalTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  alertTimer = null;
  expiryTimer = null;
  predictionEvalTimer = null;
  // Stop the live-quote poller managed by the market-data provider.
  try {
    const provider = getMarketDataProvider();
    if (typeof provider.stopLivePoller === 'function') provider.stopLivePoller();
  } catch {
    // Provider not initialized — nothing to stop.
  }
}