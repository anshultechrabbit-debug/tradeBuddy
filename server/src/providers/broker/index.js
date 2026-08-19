import { config } from '../../config/env.js';
import { MockBrokerProvider } from './MockBrokerProvider.js';
import { ZerodhaBrokerProvider } from './ZerodhaBrokerProvider.js';
import { UpstoxBrokerProvider } from './UpstoxBrokerProvider.js';
import { getMarketDataProvider } from '../marketData/index.js';

let _instance = null;

/**
 * Returns the active BrokerProvider based on BROKER_PROVIDER.
 * Business logic never depends on a concrete provider.
 */
export function getBrokerProvider() {
  if (!_instance) {
    _instance = createBrokerProvider(config.brokerProvider);
  }
  return _instance;
}

export function createBrokerProvider(name = config.brokerProvider) {
  switch (name.toLowerCase()) {
    case 'mock':
      return new MockBrokerProvider(getMarketDataProvider());
    case 'zerodha':
      return new ZerodhaBrokerProvider();
    case 'upstox':
      return new UpstoxBrokerProvider();
    default:
      throw new Error(`Unknown BROKER_PROVIDER: ${name}`);
  }
}

export function resetBrokerProvider() {
  _instance = null;
}

export const BROKER_NAMES = ['mock', 'zerodha', 'upstox'];

export function getBrokerConfig(broker) {
  switch (broker) {
    case 'zerodha':
      return {
        kind: 'oauth',
        configured: Boolean(config.zerodha.apiKey && config.zerodha.apiSecret),
        redirectUri: config.zerodha.redirectUri,
      };
    case 'upstox':
      return {
        kind: 'oauth',
        configured: Boolean(config.upstox.clientId && config.upstox.clientSecret),
        redirectUri: config.upstox.redirectUri,
      };
    case 'mock':
    default:
      return { kind: 'mock', configured: true, redirectUri: null };
  }
}