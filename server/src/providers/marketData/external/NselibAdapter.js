import { PythonClient } from './pythonBridge.js';
import { extractQuote, normalizeCandles } from './normalize.js';

/**
 * NselibAdapter — PRIMARY external development source.
 *
 * Wraps the `nselib` Python package via the Python bridge to fetch real NSE
 * equities, indices, F&O and option-chain data. Covers capital market
 * (price/volume/delivery), indices (live + historical), derivatives (futures,
 * options, live option chains) and instrument lists.
 *
 * NOTE: unofficial/free source for development/testing. Does NOT provide
 * complete licensed NSE/BSE/F&O coverage and must never be presented as such.
 */

export class NselibAdapter {
  constructor() {
    this.name = 'nselib';
    this.client = new PythonClient('nselib', this.name);
  }

  async getQuote(symbol, exchange = 'NSE') {
    if (String(exchange).toUpperCase() !== 'NSE') return null;
    const data = await this.client.call('quote', { symbol });
    if (!data) return null;
    return { ...extractQuote(data), ...data, source: this.name };
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
    const data = await this.client.call('candles', { symbol, days, index: isIndex ? 1 : undefined }, { timeoutMs: 240000 });
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

  async getOptionChain(symbol, { expiry, strike, optionType } = {}) {
    return this.client.call('option_chain', {
      symbol,
      expiry,
      strike,
      'option-type': optionType,
    });
  }

  async getFnoCandles(symbol, instrument, { optionType, strike, days } = {}) {
    return this.client.call('fno', {
      symbol,
      instrument,
      'option-type': optionType,
      strike,
      days,
    });
  }

  async getInstruments(kind = 'equity') {
    return this.client.call('instruments', { kind });
  }

  async getFundamentals(symbol) {
    return this.client.call('fundamentals', { symbol });
  }

  async health() {
    return this.client.health();
  }
}