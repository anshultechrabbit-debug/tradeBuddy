import { prisma } from '../config/prisma.js';
import { evaluateAlerts } from './alertService.js';
import { logInfra } from '../utils/helpers.js';

let alertTimer = null;
let expiryTimer = null;
let alertRunning = false;

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
  alertTimer = setInterval(runAlertLoop, 30_000);
  expiryTimer = setInterval(runExpiryLoop, 60 * 60 * 1000);
  if (typeof alertTimer.unref === 'function') alertTimer.unref();
  if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
  logInfra('info', 'app', 'Background jobs started (alerts every 30s, broker expiry hourly)');
}

export function stopBackgroundJobs() {
  if (alertTimer) clearInterval(alertTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  alertTimer = null;
  expiryTimer = null;
}