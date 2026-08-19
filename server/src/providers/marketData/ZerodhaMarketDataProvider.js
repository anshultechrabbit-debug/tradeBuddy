import { MarketDataProvider } from './MarketDataProvider.js';
import { config } from '../../config/env.js';

/**
 * ZerodhaMarketDataProvider — placeholder for Zerodha/Kite market data.
 * Not active in the MVP. Requires MARKED_DATA_PROVIDER=zerodha.
 */
export class ZerodhaMarketDataProvider extends MarketDataProvider {
  constructor() {
    super('zerodha', 'production');
    this.dataSource = 'live';
  }

  _assertConfigured() {
    if (!config.zerodha.apiKey) {
      throw new Error(
        'ZerodhaMarketDataProvider: ZERODHA_API_KEY is not configured. ' +
          'Purchase production API access and set the environment variables.',
      );
    }
  }

  async getInstruments() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getInstruments() will be implemented when API access is available.');
  }

  async getQuote() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getQuote() will be implemented when API access is available.');
  }

  async getQuotes() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getQuotes() will be implemented when API access is available.');
  }

  async getCandles() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getCandles() will be implemented when API access is available.');
  }

  async getIndexData() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getIndexData() will be implemented when API access is available.');
  }

  async getMarketBreadth() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getMarketBreadth() will be implemented when API access is available.');
  }

  async getVolatility() {
    this._assertConfigured();
    throw new Error('ZerodhaMarketDataProvider: getVolatility() will be implemented when API access is available.');
  }
}