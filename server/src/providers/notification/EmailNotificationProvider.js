import { NotificationProvider } from './NotificationProvider.js';
import { config } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';

/**
 * EmailNotificationProvider — transactional email.
 * When EMAIL_PROVIDER / EMAIL_API_KEY are configured the provider can be wired
 * to a real SMTP/HTTP sender. Until then it degrades gracefully: the message
 * is delivered as an in-app notification and logged, never thrown.
 */
export class EmailNotificationProvider extends NotificationProvider {
  constructor() {
    super('email', 'production');
  }

  get configured() {
    return Boolean(config.email.provider && config.email.apiKey);
  }

  async _sendReal({ to, subject, body }) {
    if (!this.configured) {
      throw new Error('EMAIL_PROVIDER / EMAIL_API_KEY are not configured');
    }
    // Wire a real sender here (e.g. nodemailer / SES). Not part of the MVP.
    throw new Error('Real email transport not installed in this build');
  }

  async send({ userId, channel = 'email', title, body, metadata = {} }) {
    if (this.configured) {
      try {
        await this._sendReal({ to: undefined, subject: title, body });
      } catch (err) {
        console.log(`[notification:email] degraded to in-app: ${err.message}`);
      }
    } else {
      console.log(`[notification:email] not configured — delivering in-app instead: ${title} — ${body}`);
    }
    const notification = await prisma.notification.create({
      data: {
        userId,
        channel: 'in_app',
        provider: 'email',
        title,
        body,
        metadata: { requestedChannel: 'email', ...(metadata ?? {}) },
      },
    });
    return { delivered: true, notificationId: notification.id, channel: 'in_app', degradedFrom: 'email' };
  }

  async notifyAlerts(events) {
    const results = [];
    for (const event of events) {
      const title = `Alert triggered: ${event.symbol ?? 'portfolio'}`;
      const body = `${event.alertType} — value ${event.value} vs threshold ${event.threshold}`;
      results.push(await this.send({ userId: event.userId, channel: 'email', title, body, metadata: { eventId: event.id } }));
    }
    return results;
  }
}