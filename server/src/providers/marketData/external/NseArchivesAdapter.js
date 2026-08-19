import { PythonClient } from './pythonBridge.js';
import { normalizeCandles } from './normalize.js';

/**
 * NseArchivesAdapter — HISTORICAL / BULK BACKFILL source.
 *
 * Wraps `indian-market-data` (nse-archives) via the Python bridge. Pulls
 * full-market bhavcopy for a trading date (all NSE equities at once) and
 * bulk historical candles for backfill of the scan universe.
 *
 * NOTE: unofficial/free source for development/testing. Does NOT provide
 * complete licensed NSE/BSE/F&O coverage and must never be presented as such.
 */

export class NseArchivesAdapter {
  constructor() {
    this.name = 'nse-archives';
    this.client = new PythonClient('nse_archives', this.name);
  }

  async bulkBhav(day) {
    const data = await this.client.call('bulk_bhav', { date: day });
    return Array.isArray(data) ? data : [];
  }

  async bulkCandles(day) {
    const rows = await this.bulkBhav(day);
    return normalizeCandles(rows);
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

  async getQuote(symbol, exchange = 'NSE', day) {
    const data = await this.client.call('quote', { symbol, date: day });
    if (!data) return null;
    return { ...data, source: this.name };
  }

  async getIndexData() {
    const data = await this.client.call('indices', {});
    return Array.isArray(data) ? data : [];
  }

  async health() {
    return this.client.health();
  }
}