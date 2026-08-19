import { MarketDataProvider } from './MarketDataProvider.js';
import { config } from '../../config/env.js';

/**
 * LicensedMarketDataProvider — placeholder for a licensed market-data vendor
 * (e.g. TrueData/GDFL class feeds). Not active in the MVP. Requires
 * MARKET_DATA_PROVIDER=licensed plus MARKET_DATA_LICENSE_KEY.
 */
export class LicensedMarketDataProvider extends MarketDataProvider {
  constructor() {
    super('licensed', 'production');
    this.dataSource = 'live';
  }

  _assertConfigured() {
    if (!config.marketDataLicenseKey) {
      throw new Error(
        'LicensedMarketDataProvider: MARKET_DATA_LICENSE_KEY is not configured. ' +
          'Add a licensed market-data subscription and set the environment variable.',
      );
    }
  }

  async getInstruments() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getInstruments() will be implemented when a licensed feed is available.');
  }

  async getQuote() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getQuote() will be implemented when a licensed feed is available.');
  }

  async getQuotes() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getQuotes() will be implemented when a licensed feed is available.');
  }

  async getCandles() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getCandles() will be implemented when a licensed feed is available.');
  }

  async getIndexData() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getIndexData() will be implemented when a licensed feed is available.');
  }

  async getMarketBreadth() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getMarketBreadth() will be implemented when a licensed feed is available.');
  }

  async getVolatility() {
    this._assertConfigured();
    throw new Error('LicensedMarketDataProvider: getVolatility() will be implemented when a licensed feed is available.');
  }
}