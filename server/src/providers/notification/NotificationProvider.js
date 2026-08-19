/**
 * NotificationProvider — interface contract for outbound notifications.
 * Concrete providers (Development, Push, Email) are selected by
 * NOTIFICATION_PROVIDER. Development provider logs and stores in-app
 * notifications; real push/email channels plug in later.
 */
export class NotificationProvider {
  constructor(name, environment) {
    this.name = name;
    this.environment = environment || 'development';
  }

  async send({ userId, channel, title, body, metadata = {} }) {
    throw new Error(`${this.name}: send() not implemented`);
  }

  async notifyAlerts(events) {
    throw new Error(`${this.name}: notifyAlerts() not implemented`);
  }

  describe() {
    return { provider: this.name, environment: this.environment };
  }
}