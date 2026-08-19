import { BrokerProvider } from './BrokerProvider.js';
import { config } from '../../config/env.js';

/**
 * UpstoxBrokerProvider — placeholder for real Upstox API.
 *
 * Not active in the MVP. Requires BROKER_PROVIDER=upstox plus
 * UPSTOX_CLIENT_ID / UPSTOX_CLIENT_SECRET / UPSTOX_REDIRECT_URI. Returns a
 * clear configuration error instead of pretending to work.
 */
export class UpstoxBrokerProvider extends BrokerProvider {
  constructor() {
    super('upstox', 'production');
  }

  _assertConfigured() {
    if (!config.upstox.clientId || !config.upstox.clientSecret) {
      throw new Error(
        'UpstoxBrokerProvider: UPSTOX_CLIENT_ID and UPSTOX_CLIENT_SECRET are not configured. ' +
          'Purchase production API access and set the environment variables.',
      );
    }
  }

  async connect(_credentials) {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: connect() will be implemented when API access is available.');
  }

  async getHoldings() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getHoldings() will be implemented when API access is available.');
  }

  async getPositions() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getPositions() will be implemented when API access is available.');
  }

  async getOrders() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getOrders() will be implemented when API access is available.');
  }

  async getTrades() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getTrades() will be implemented when API access is available.');
  }

  async getFunds() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getFunds() will be implemented when API access is available.');
  }

  async getQuotes() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getQuotes() will be implemented when API access is available.');
  }

  async getPortfolio() {
    this._assertConfigured();
    throw new Error('UpstoxBrokerProvider: getPortfolio() will be implemented when API access is available.');
  }
}