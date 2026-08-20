/**
 * Minimal Server-Sent-Events hub. No external deps. Pages subscribe with
 * EventSource and receive pushed events (radar updates, alert triggers) instead
 * of relying on polling alone.
 */
const channels = new Map();

export function subscribeChannel(channel, res) {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(res);
  return () => unsubscribeChannel(channel, res);
}

export function unsubscribeChannel(channel, res) {
  const set = channels.get(channel);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) channels.delete(channel);
}

export function publish(channel, payload) {
  const set = channels.get(channel);
  if (!set || set.size === 0) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch {
      set.delete(res);
    }
  }
}

export function publishRadar(result) {
  publish('radar', { type: 'radar', scanId: result.scanId, lastScannedAt: result.lastScannedAt, count: result.opportunities.length });
}

export function publishAlerts(events) {
  if (!events.length) return;
  publish('alerts', {
    type: 'alerts',
    triggered: events.map((e) => ({ id: e.id, alertId: e.alertId, symbol: e.symbol, alertType: e.alertType, value: e.value, threshold: e.threshold, triggeredAt: e.triggeredAt })),
  });
}