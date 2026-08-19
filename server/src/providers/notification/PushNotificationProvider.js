import { NotificationProvider } from './NotificationProvider.js';
import { config } from '../../config/env.js';

/**
 * PushNotificationProvider — placeholder for FCM push notifications.
 * Not active in the MVP. Requires FIREBASE_PROJECT_ID / FIREBASE_PRIVATE_KEY.
 */
export class PushNotificationProvider extends NotificationProvider {
  constructor() {
    super('push', 'production');
  }

  _assertConfigured() {
    if (!config.firebase.projectId || !config.firebase.privateKey) {
      throw new Error(
        'PushNotificationProvider: FIREBASE_PROJECT_ID / FIREBASE_PRIVATE_KEY are not configured.',
      );
    }
  }

  async send() {
    this._assertConfigured();
    throw new Error('PushNotificationProvider: send() will be implemented when Firebase is configured.');
  }

  async notifyAlerts() {
    this._assertConfigured();
    throw new Error('PushNotificationProvider: notifyAlerts() will be implemented when Firebase is configured.');
  }
}