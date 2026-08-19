import { PythonClient } from './pythonBridge.js';
import { extractQuote, normalizeCandles } from './normalize.js';

/**
 * JugaadAdapter — FALLBACK external development source.
 *
 * Wraps the `jugaad-data` Python package via the Python bridge. Provides live
 * quotes, historical stock/index candles and option chains as a fallback when
 * nselib is unavailable. Built-in caching in jugaad-data keeps NSE requests low.
 *
 * NOTE: unofficial/free source for development/testing. Does NOT provide
 * complete licensed NSE/BSE/F&O coverage and must never be presented as such.
 */

export class JugaadAdapter {
  constructor() {
    this.name = 'jugaad';
    this.client = new PythonClient('jugaad', this.name);
  }

  async getQuote(symbol, exchange = 'NSE') {
    if (String(exchange).toUpperCase() !== 'NSE') return null;
    const data = await this.client.call('quote', { symbol });
    if (!data) return null;
    return { ...extractQuote(data), ...data, source: this.name };
  }

  /**
   * Live quotes for many NSE symbols in ONE Python process. Returns
   * { symbol: quote, ... } (keyed) rather than an array.
   */
  async getLiveQuotes(symbols, exchange = 'NSE') {
    if (String(exchange).toUpperCase() !== 'NSE') return {};
    if (!Array.isArray(symbols) || !symbols.length) return {};
    const data = await this.client.call('live_quotes', { symbols: symbols.join(',') });
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  async getQuotes(symbols, exchange = 'NSE') {
    const out = [];
    for (const symbol of symbols) {
      try {
        out.push(await this.getQuote(symbol, exchange));
      } catch {
        out.push(null);
      }
    }
    return out;
  }

  async getHistoricalCandles(symbol, exchange = 'NSE', days = 140, isIndex = false) {
    const data = await this.client.call('candles', { symbol, days, index: isIndex ? 1 : undefined });
    const rows = Array.isArray(data) ? data : [];
    return normalizeCandles(rows).map((c) => ({
      ...c,
      symbol,
      exchange,
      timeframe: '1d',
      source: this.name,
    }));
  }

  async getIndexData() {
    const data = await this.client.call('indices', {});
    return Array.isArray(data) ? data : [];
  }

  async getOptionChain(symbol, { expiry } = {}) {
    return this.client.call('option_chain', { symbol, expiry });
  }

  async health() {
    return this.client.health();
  }
}