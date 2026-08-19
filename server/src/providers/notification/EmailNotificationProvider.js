import { NotificationProvider } from './NotificationProvider.js';
import { config } from '../../config/env.js';

/**
 * EmailNotificationProvider — placeholder for transactional email.
 * Not active in the MVP. Requires EMAIL_PROVIDER / EMAIL_API_KEY.
 */
export class EmailNotificationProvider extends NotificationProvider {
  constructor() {
    super('email', 'production');
  }

  _assertConfigured() {
    if (!config.email.provider || !config.email.apiKey) {
      throw new Error('EmailNotificationProvider: EMAIL_PROVIDER / EMAIL_API_KEY are not configured.');
    }
  }

  async send() {
    this._assertConfigured();
    throw new Error('EmailNotificationProvider: send() will be implemented when an email provider is configured.');
  }

  async notifyAlerts() {
    this._assertConfigured();
    throw new Error('EmailNotificationProvider: notifyAlerts() will be implemented when an email provider is configured.');
  }
}