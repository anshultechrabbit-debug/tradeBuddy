import { config } from '../../config/env.js';
import { DevelopmentMarketDataProvider } from './DevelopmentMarketDataProvider.js';
import { RealDevelopmentMarketDataProvider } from './RealDevelopmentMarketDataProvider.js';
import { ZerodhaMarketDataProvider } from './ZerodhaMarketDataProvider.js';
import { LicensedMarketDataProvider } from './LicensedMarketDataProvider.js';

let _instance = null;

/**
 * Returns the active MarketDataProvider based on MARKET_DATA_PROVIDER and
 * MARKET_DATA_MODE. Radar, features and dashboard consume only this interface.
 *
 * - MARKET_DATA_PROVIDER=development
 *     MARKET_DATA_MODE=synthetic  → DevelopmentMarketDataProvider (deterministic fake)
 *     MARKET_DATA_MODE=external   → RealDevelopmentMarketDataProvider (real external data)
 * - MARKET_DATA_PROVIDER=zerodha / licensed → future production providers
 */
export function getMarketDataProvider() {
  if (!_instance) {
    _instance = createMarketDataProvider(config.marketDataProvider);
  }
  return _instance;
}

export function createMarketDataProvider(name = config.marketDataProvider, mode = config.marketDataMode) {
  switch (name.toLowerCase()) {
    case 'development':
      return String(mode).toLowerCase() === 'synthetic'
        ? new DevelopmentMarketDataProvider()
        : new RealDevelopmentMarketDataProvider();
    case 'zerodha':
      return new ZerodhaMarketDataProvider();
    case 'licensed':
      return new LicensedMarketDataProvider();
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER: ${name}`);
  }
}

export function resetMarketDataProvider() {
  _instance = null;
}