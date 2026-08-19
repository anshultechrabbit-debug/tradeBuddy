import { NotificationProvider } from './NotificationProvider.js';
import { prisma } from '../../config/prisma.js';

/**
 * DevelopmentNotificationProvider — logs notifications and stores them as
 * in-app notifications so the whole alert flow works without push/email
 * infrastructure.
 */
export class DevelopmentNotificationProvider extends NotificationProvider {
  constructor() {
    super('development', 'development');
  }

  async send({ userId, channel = 'in_app', title, body, metadata = {} }) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        channel,
        provider: this.name,
        title,
        body,
        metadata: metadata ?? undefined,
      },
    });
    console.log(`[notification:${channel}] ${title} — ${body}`);
    return { delivered: true, notificationId: notification.id, channel };
  }

  async notifyAlerts(events) {
    const results = [];
    for (const event of events) {
      const title = `Alert triggered: ${event.symbol ?? 'portfolio'}`;
      const body = `${event.alertType} — value ${event.value} vs threshold ${event.threshold}`;
      results.push(
        await this.send({ userId: event.userId, channel: 'in_app', title, body, metadata: { eventId: event.id } }),
      );
    }
    return results;
  }
}