import { NotificationProvider } from './NotificationProvider.js';
import { config } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';

/**
 * PushNotificationProvider — FCM push notifications.
 * When FIREBASE_PROJECT_ID / FIREBASE_PRIVATE_KEY are configured a real FCM
 * sender can be wired here. Until then it degrades gracefully to an in-app
 * notification and log entry, never throwing.
 */
export class PushNotificationProvider extends NotificationProvider {
  constructor() {
    super('push', 'production');
  }

  get configured() {
    return Boolean(config.firebase.projectId && config.firebase.privateKey);
  }

  async _sendReal({ title, body }) {
    if (!this.configured) {
      throw new Error('FIREBASE_PROJECT_ID / FIREBASE_PRIVATE_KEY are not configured');
    }
    // Wire FCM admin here. Not part of the MVP.
    throw new Error('Real push transport not installed in this build');
  }

  async send({ userId, channel = 'push', title, body, metadata = {} }) {
    if (this.configured) {
      try {
        await this._sendReal({ title, body });
      } catch (err) {
        console.log(`[notification:push] degraded to in-app: ${err.message}`);
      }
    } else {
      console.log(`[notification:push] not configured — delivering in-app instead: ${title} — ${body}`);
    }
    const notification = await prisma.notification.create({
      data: {
        userId,
        channel: 'in_app',
        provider: 'push',
        title,
        body,
        metadata: { requestedChannel: 'push', ...(metadata ?? {}) },
      },
    });
    return { delivered: true, notificationId: notification.id, channel: 'in_app', degradedFrom: 'push' };
  }

  async notifyAlerts(events) {
    const results = [];
    for (const event of events) {
      const title = `Alert triggered: ${event.symbol ?? 'portfolio'}`;
      const body = `${event.alertType} — value ${event.value} vs threshold ${event.threshold}`;
      results.push(await this.send({ userId: event.userId, channel: 'push', title, body, metadata: { eventId: event.id } }));
    }
    return results;
  }
}