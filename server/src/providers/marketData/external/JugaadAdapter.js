import { PythonClient } from './pythonBridge.js';
import { extractQuote, normalizeCandles } from './normalize.js';
import { resolveLiveSymbol, canonicalSymbol } from './symbolAliases.js';

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
    const data = await this.client.call('quote', { symbol: resolveLiveSymbol(symbol) });
    if (!data) return null;
    // `symbol` last: some renamed tickers (see symbolAliases.js) come back
    // from the live API under their NEW ticker in the raw payload — always
    // report the symbol the caller actually asked for, not that one.
    return { ...extractQuote(data), ...data, symbol, source: this.name };
  }

  /**
   * Live quotes for many NSE symbols in ONE Python process. Returns
   * { symbol: quote, ... } (keyed) rather than an array.
   */
  async getLiveQuotes(symbols, exchange = 'NSE') {
    if (String(exchange).toUpperCase() !== 'NSE') return {};
    if (!Array.isArray(symbols) || !symbols.length) return {};
    const data = await this.client.call('live_quotes', { symbols: symbols.map(resolveLiveSymbol).join(',') });
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    // Re-key (and re-tag) any aliased tickers back onto the symbol the
    // caller asked for, so nothing downstream needs to know about the alias.
    const out = {};
    for (const [key, quote] of Object.entries(data)) {
      const canonical = canonicalSymbol(key);
      out[canonical] = quote && typeof quote === 'object' ? { ...quote, symbol: canonical } : quote;
    }
    return out;
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
    const data = await this.client.call('candles', { symbol: resolveLiveSymbol(symbol), days, index: isIndex ? 1 : undefined });
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

  async getTopStocks() {
    const data = await this.client.call('top_stocks', {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  async getIntradayCandles(symbol, exchange = 'NSE', duration = '5m', days = 1) {
    if (String(exchange).toUpperCase() !== 'NSE') return [];
    const data = await this.client.call('intraday', { symbol: resolveLiveSymbol(symbol), duration, days });
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((c) => {
        const ts = c.ts ? new Date(c.ts) : null;
        if (!ts || Number.isNaN(ts.getTime())) return null;
        return {
          date: ts,
          ts,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Math.round(Number(c.volume) || 0),
          symbol,
          exchange,
          timeframe: duration,
          source: this.name,
        };
      })
      .filter(Boolean);
  }

  async getOptionChain(symbol, { expiry } = {}) {
    return this.client.call('option_chain', { symbol: resolveLiveSymbol(symbol), expiry });
  }

  async health() {
    return this.client.health();
  }
}