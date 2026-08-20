import { prisma } from '../config/prisma.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { getNotificationProvider } from '../providers/notification/index.js';
import { audit } from '../utils/helpers.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { getPortfolioSummary } from './portfolioService.js';
import { getDeepDive } from './radarService.js';
import { publishAlerts } from './eventHub.js';

export const ALERT_TYPES = ['price_above', 'price_below', 'conviction_above', 'pnl_above', 'pnl_below'];
const CHANNELS = ['in_app', 'push', 'email'];

function normalizeChannels(channels) {
  if (!channels) return channels;
  return channels.map((c) => String(c).trim().toLowerCase());
}

function inQuietHours(prefs, now = new Date()) {
  if (!prefs?.quietHoursEnabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = prefs.quietHoursStart.split(':').map(Number);
  const end = prefs.quietHoursEnd.split(':').map(Number);
  const startMin = start[0] * 60 + start[1];
  const endMin = end[0] * 60 + end[1];
  if (startMin === endMin) return false;
  if (startMin < endMin) return minutes >= startMin && minutes < endMin;
  return minutes >= startMin || minutes < endMin;
}

export function validateAlertInput({ name, alertType, threshold, symbol, channels }) {
  if (!name?.trim()) throw new BadRequestError('name is required');
  if (!ALERT_TYPES.includes(alertType)) {
    throw new BadRequestError(`alert_type must be one of: ${ALERT_TYPES.join(', ')}`);
  }
  if (threshold == null || Number.isNaN(Number(threshold))) {
    throw new BadRequestError('threshold must be a number');
  }
  if (alertType.startsWith('price_') && !symbol) {
    throw new BadRequestError('symbol is required for price alerts');
  }
  const normalized = normalizeChannels(channels);
  if (normalized) {
    for (const c of normalized) {
      if (!CHANNELS.includes(c)) throw new BadRequestError(`Invalid channel: ${c}`);
    }
  }
}

export async function createAlert(userId, input) {
  validateAlertInput(input);
  const channels = normalizeChannels(input.channels) ?? ['in_app'];
  const alert = await prisma.alert.create({
    data: {
      userId,
      name: input.name.trim(),
      alertType: input.alertType,
      threshold: input.threshold,
      symbol: input.symbol ?? null,
      channels,
    },
  });
  await audit(userId, 'ALERT_CREATE', 'alert', alert.id, { alertType: alert.alertType }, null);
  return alert;
}

export async function updateAlert(userId, alertId, input) {
  const existing = await prisma.alert.findFirst({ where: { id: alertId, userId } });
  if (!existing) throw new NotFoundError('Alert not found');
  validateAlertInput({ ...existing, ...input });
  const data = {};
  if (input.name != null) data.name = input.name.trim();
  if (input.alertType != null) data.alertType = input.alertType;
  if (input.threshold != null) data.threshold = input.threshold;
  if (input.symbol !== undefined) data.symbol = input.symbol ?? null;
  if (input.channels != null) data.channels = normalizeChannels(input.channels);
  if (input.active != null) data.active = Boolean(input.active);
  const alert = await prisma.alert.update({ where: { id: alertId }, data });
  await audit(userId, 'ALERT_UPDATE', 'alert', alertId, null, null);
  return alert;
}

export async function deleteAlert(userId, alertId) {
  const existing = await prisma.alert.findFirst({ where: { id: alertId, userId } });
  if (!existing) throw new NotFoundError('Alert not found');
  await prisma.alert.delete({ where: { id: alertId } });
  await audit(userId, 'ALERT_DELETE', 'alert', alertId, null, null);
  return { ok: true };
}

export async function listAlerts(userId) {
  return prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function listAlertEvents(userId, { page = 1, limit = 20 } = {}) {
  const [total, rows] = await Promise.all([
    prisma.alertEvent.count({ where: { userId } }),
    prisma.alertEvent.findMany({
      where: { userId },
      include: { alert: { select: { name: true } } },
      orderBy: { triggeredAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return { rows, total, page, limit };
}

async function currentValues(userId) {
  const provider = getMarketDataProvider();
  const [summary, signals] = await Promise.all([
    getPortfolioSummary(userId),
    prisma.scanSignal.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      distinct: ['symbol'],
    }),
  ]);
  const convictionMap = new Map(signals.map((s) => [s.symbol, s.convictionScore]));
  return { summary, convictionMap };
}

/**
 * Evaluates a user's active alerts against current development values and
 * records trigger events + notifications. Returns the triggered events.
 */
export async function evaluateAlerts(userId, { ip } = {}) {
  const alerts = await prisma.alert.findMany({ where: { userId, active: true } });
  if (!alerts.length) return [];

  const provider = getMarketDataProvider();
  const prefs = await prisma.userScannerPref.findUnique({ where: { userId } });
  const quiet = inQuietHours(prefs);
  const { summary, convictionMap } = await currentValues(userId);

  const priceSymbols = [
    ...new Set(alerts.filter((a) => a.alertType.startsWith('price_') && a.symbol).map((a) => a.symbol)),
  ];
  const priceMap = new Map();
  if (priceSymbols.length) {
    const quotes = await provider.getQuotes({ symbols: priceSymbols, exchange: 'NSE' });
    for (const q of quotes.filter(Boolean)) priceMap.set(q.symbol, Number(q.lastPrice));
  }

  const triggered = [];
  for (const alert of alerts) {
    let value = null;
    if (alert.alertType === 'price_above' || alert.alertType === 'price_below') {
      value = priceMap.get(alert.symbol) ?? null;
    } else if (alert.alertType === 'conviction_above') {
      value = alert.symbol ? convictionMap.get(alert.symbol) : null;
    } else if (alert.alertType === 'pnl_above' || alert.alertType === 'pnl_below') {
      value = summary.totalPnl;
    }
    if (value == null) continue;

    const threshold = Number(alert.threshold);
    const isHit =
      (alert.alertType === 'price_above' && value >= threshold) ||
      (alert.alertType === 'price_below' && value <= threshold) ||
      (alert.alertType === 'conviction_above' && value >= threshold) ||
      (alert.alertType === 'pnl_above' && value >= threshold) ||
      (alert.alertType === 'pnl_below' && value <= threshold);

    if (!isHit) continue;

    const event = await prisma.alertEvent.create({
      data: {
        alertId: alert.id,
        userId,
        symbol: alert.symbol,
        value,
        threshold,
        alertType: alert.alertType,
      },
    });
    await prisma.alert.update({
      where: { id: alert.id },
      data: { lastTriggeredAt: new Date() },
    });
    triggered.push(event);

    if (!quiet) {
      try {
        await getNotificationProvider().notifyAlerts([
          { ...event, symbol: alert.symbol, userId },
        ]);
      } catch (err) {
        // notifications are best-effort
      }
    }
  }

  if (triggered.length) {
    publishAlerts(triggered);
    await audit(userId, 'ALERTS_EVALUATED', 'alert', null, { triggered: triggered.length, quietHours: quiet }, ip);
  }
  return triggered;
}

export async function listNotifications(userId, { page = 1, limit = 20 } = {}) {
  const [total, rows] = await Promise.all([
    prisma.notification.count({ where: { userId } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { deliveredAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return { rows, total, page, limit };
}

export async function markNotificationsRead(userId) {
  await prisma.notification.updateMany({ where: { userId }, data: { read: true } });
  return { ok: true };
}

export async function getAlertTargetValue(userId, alert) {
  if (alert.alertType.startsWith('price_')) {
    const quote = await getMarketDataProvider().getQuote(alert.symbol);
    return quote?.lastPrice ?? null;
  }
  if (alert.alertType === 'conviction_above') {
    if (alert.symbol) {
      const dive = await getDeepDive(alert.symbol);
      return dive?.convictionScore ?? null;
    }
    return null;
  }
  const summary = await getPortfolioSummary(userId);
  return summary.totalPnl;
}