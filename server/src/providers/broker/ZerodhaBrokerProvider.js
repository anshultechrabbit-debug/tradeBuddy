import { BrokerProvider } from './BrokerProvider.js';
import { config } from '../../config/env.js';

/**
 * ZerodhaBrokerProvider — placeholder for real Zerodha Kite Connect API.
 *
 * Not active in the MVP. Requires BROKER_PROVIDER=zerodha plus
 * ZERODHA_API_KEY / ZERODHA_API_SECRET / ZERODHA_REDIRECT_URI. Returns a
 * clear configuration error instead of pretending to work.
 */
export class ZerodhaBrokerProvider extends BrokerProvider {
  constructor() {
    super('zerodha', 'production');
  }

  _assertConfigured() {
    if (!config.zerodha.apiKey || !config.zerodha.apiSecret) {
      throw new Error(
        'ZerodhaBrokerProvider: ZERODHA_API_KEY and ZERODHA_API_SECRET are not configured. ' +
          'Purchase production API access and set the environment variables.',
      );
    }
  }

  async connect(_credentials) {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: connect() will be implemented when API access is available.');
  }

  async getHoldings() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getHoldings() will be implemented when API access is available.');
  }

  async getPositions() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getPositions() will be implemented when API access is available.');
  }

  async getOrders() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getOrders() will be implemented when API access is available.');
  }

  async getTrades() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getTrades() will be implemented when API access is available.');
  }

  async getFunds() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getFunds() will be implemented when API access is available.');
  }

  async getQuotes() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getQuotes() will be implemented when API access is available.');
  }

  async getPortfolio() {
    this._assertConfigured();
    throw new Error('ZerodhaBrokerProvider: getPortfolio() will be implemented when API access is available.');
  }
}