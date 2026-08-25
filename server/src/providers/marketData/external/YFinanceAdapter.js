import { PythonClient } from './pythonBridge.js';

/**
 * YFinanceAdapter — fetches rich fundamentals via Yahoo Finance (yfinance).
 *
 * Provides quarterly/annual financial statements, key ratios (ROE, ROCE,
 * debt/equity, margins, growth), valuation multiples, and analyst estimates.
 * Used to populate the "Company health" factor which nselib cannot provide.
 *
 * NOTE: unofficial source for development/testing. Rate limits apply.
 * Cache results aggressively (10-30 min) — fundamentals change quarterly.
 */

export class YFinanceAdapter {
  constructor() {
    this.name = 'yfinance';
    this.client = new PythonClient('yfinance', this.name);
  }

  async getFundamentals(symbol) {
    const data = await this.client.call('fundamentals', { symbol });
    if (!data || data.error) return null;
    return data;
  }

  async health() {
    return this.client.health();
  }
}