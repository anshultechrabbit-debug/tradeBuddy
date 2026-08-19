import { config } from '../../config/env.js';
import { DevelopmentNotificationProvider } from './DevelopmentNotificationProvider.js';
import { PushNotificationProvider } from './PushNotificationProvider.js';
import { EmailNotificationProvider } from './EmailNotificationProvider.js';

let _instance = null;

export function getNotificationProvider() {
  if (!_instance) {
    _instance = createNotificationProvider(config.notificationProvider);
  }
  return _instance;
}

export function createNotificationProvider(name = config.notificationProvider) {
  switch (name.toLowerCase()) {
    case 'development':
      return new DevelopmentNotificationProvider();
    case 'push':
      return new PushNotificationProvider();
    case 'email':
      return new EmailNotificationProvider();
    default:
      throw new Error(`Unknown NOTIFICATION_PROVIDER: ${name}`);
  }
}

export function resetNotificationProvider() {
  _instance = null;
}