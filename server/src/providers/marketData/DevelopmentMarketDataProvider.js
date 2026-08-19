import { MarketDataProvider } from './MarketDataProvider.js';
import { prisma } from '../../config/prisma.js';
import { generateCandles, generateQuote, dailySeriesStats } from './development/priceGen.js';
import { round2, logInfra } from '../../utils/helpers.js';
import { INDEX_SYMBOLS } from '../../db/seed-data/universe.js';

/**
 * DevelopmentMarketDataProvider — deterministic offline market data.
 *
 * data_source=development. Reads seeded instruments/candles from the local
 * database and computes quotes, index levels, breadth and volatility from
 * them. Works fully offline after seeding. Never presented as live data.
 */
export class DevelopmentMarketDataProvider extends MarketDataProvider {
  constructor() {
    super('development', 'development');
    this.dataSource = 'development';
  }

  async _audit(operation, status, message, instrumentCount, start) {
    const durationMs = start ? Math.round(performance.now() - start) : null;
    await prisma.marketDataAudit
      .create({
        data: {
          provider: this.name,
          source: this.dataSource,
          operation,
          instrumentCount,
          status,
          message: message ?? null,
          durationMs,
        },
      })
      .catch(() => {});
  }

  async getInstruments({ enabled = true } = {}) {
    const start = performance.now();
    const rows = await prisma.instrument.findMany({
      where: enabled ? { enabled: true } : {},
      orderBy: { symbol: 'asc' },
    });
    await this._audit('getInstruments', 'success', null, rows.length, start);
    return rows;
  }

  async _candleMap(symbols, exchange, timeframe = '1d', limit = 100) {
    if (!symbols.length) return new Map();
    const rows = await prisma.marketCandle.findMany({
      where: { symbol: { in: symbols }, exchange: exchange ?? undefined, timeframe },
      orderBy: { ts: 'asc' },
    });
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.symbol)) map.set(row.symbol, []);
      map.get(row.symbol).push(row);
    }
    for (const [sym, arr] of map) {
      map.set(sym, arr.slice(-limit));
    }
    return map;
  }

  async getCandles(symbol, timeframe = '1d', limit = 100, exchange = 'NSE') {
    const start = performance.now();
    const rows = await prisma.marketCandle.findMany({
      where: { symbol, timeframe, exchange },
      orderBy: { ts: 'asc' },
      take: limit,
    });
    await this._audit('getCandles', 'success', null, rows.length, start);
    return rows.map((c) => ({
      symbol: c.symbol,
      exchange: c.exchange,
      timeframe: c.timeframe,
      date: c.ts,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
      source: c.source,
      provider: c.provider,
    }));
  }

  async getQuote(symbol, exchange = 'NSE', { seedKey, dateSeed } = {}) {
    const candles = await this._candleMap([symbol], exchange);
    const series = candles.get(symbol) ?? [];
    const seed = seedKey || dateSeed || new Date().toISOString().slice(0, 10);
    const quote = generateQuote(symbol, series, seed);
    if (!quote) return null;
    const instrument = await prisma.instrument.findFirst({
      where: { symbol, exchange },
      orderBy: { instrumentType: 'asc' },
    });
    if (instrument) {
      const quoteTs = new Date();
      quoteTs.setMinutes(0, 0, 0);
      await prisma.marketQuote
        .upsert({
          where: { instrumentId_timestamp: { instrumentId: instrument.id, timestamp: quoteTs } },
          create: {
            instrumentId: instrument.id,
            symbol,
            exchange,
            lastPrice: quote.lastPrice,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            prevClose: quote.prevClose,
            change: quote.change,
            changePct: quote.changePct,
            volume: BigInt(quote.volume),
            bid: quote.bid,
            ask: quote.ask,
            source: 'development',
            provider: 'development',
            timestamp: quoteTs,
          },
          update: {},
        })
        .catch(() => {});
    }
    return { ...quote, dataSource: this.dataSource };
  }

  async getQuotes({ symbols = [], exchange = 'NSE', seedKey } = {}) {
    if (!symbols.length) return [];
    const candleMap = await this._candleMap(symbols, exchange);
    const seed = seedKey || new Date().toISOString().slice(0, 10);
    return symbols.map((symbol) => {
      const quote = generateQuote(symbol, candleMap.get(symbol) ?? [], seed);
      return quote ? { ...quote, dataSource: this.dataSource } : null;
    });
  }

  async getIndexData() {
    const symbols = [...INDEX_SYMBOLS];
    const candleMap = await this._candleMap(symbols, 'NSE', '1d', 2);
    const indexes = [];
    for (const sym of symbols) {
      const series = candleMap.get(sym) ?? [];
      if (!series.length) continue;
      const stats = dailySeriesStats(series);
      indexes.push({
        symbol: sym,
        exchange: 'NSE',
        instrumentType: 'INDEX',
        level: stats.last,
        prevClose: stats.prev,
        change: round2(stats.last - stats.prev),
        changePct: stats.prev > 0 ? round2(((stats.last - stats.prev) / stats.prev) * 100) : 0,
        dataSource: this.dataSource,
      });
    }
    return indexes;
  }

  async getMarketBreadth() {
    const universe = await prisma.scanUniverse.findMany({
      where: { enabled: true, instrumentType: 'EQUITY', excluded: false },
      include: { instrument: true },
    });
    const symbols = universe.map((u) => u.symbol);
    const candleMap = await this._candleMap(symbols, 'NSE', '1d', 60);
    let aboveSma20 = 0;
    let aboveSma50 = 0;
    let advancing = 0;
    let declining = 0;
    let unchanged = 0;
    let sumChangePct = 0;

    for (const sym of symbols) {
      const series = candleMap.get(sym) ?? [];
      if (series.length < 21) continue;
      const closes = series.map((c) => Number(c.close));
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      if (last > sma20) aboveSma20 += 1;
      if (last > sma50) aboveSma50 += 1;
      const chg = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      sumChangePct += chg;
      if (chg > 0.1) advancing += 1;
      else if (chg < -0.1) declining += 1;
      else unchanged += 1;
    }

    const total = advancing + declining + unchanged;
    return {
      advancing,
      declining,
      unchanged,
      total,
      breadthPctAboveSma20: total ? round2((aboveSma20 / total) * 100) : 0,
      breadthPctAboveSma50: total ? round2((aboveSma50 / total) * 100) : 0,
      averageChangePct: total ? round2(sumChangePct / total) : 0,
      dataSource: this.dataSource,
    };
  }

  async getVolatility(symbol, exchange = 'NSE') {
    const candleMap = await this._candleMap([symbol], exchange, '1d', 21);
    const series = candleMap.get(symbol) ?? [];
    if (series.length < 3) return null;
    const stats = dailySeriesStats(series);
    return {
      symbol,
      exchange,
      dailyVolatilityPct: round2(stats.vol * 100),
      annualizedVolatilityPct: round2(stats.vol * Math.sqrt(252) * 100),
      meanDailyReturnPct: round2(stats.meanReturn * 100),
      sampleDays: series.length,
      dataSource: this.dataSource,
    };
  }

  /**
   * Regenerates development candles for the full universe. Used by the seed
   * script; data_source stays 'development'.
   */
  async regenerateMarketData() {
    const start = performance.now();
    const instruments = await prisma.instrument.findMany({
      where: { enabled: true },
    });
    let created = 0;
    for (const inst of instruments) {
      const basePrice = Number(inst.basePrice) || Number(inst.strikePrice) || 500;
      const candles = generateCandles(inst.symbol, inst.exchange, basePrice, 'development-seed');
      for (const c of candles) {
        await prisma.marketCandle
          .upsert({
            where: {
              instrumentId_timeframe_ts: {
                instrumentId: inst.id,
                timeframe: c.timeframe,
                ts: c.ts,
              },
            },
            create: {
              instrumentId: inst.id,
              symbol: c.symbol,
              exchange: c.exchange,
              timeframe: c.timeframe,
              ts: c.ts,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: BigInt(c.volume),
              source: 'development',
              provider: 'development',
            },
            update: {},
          });
        created += 1;
      }
    }
    await this._audit('regenerate', 'success', null, instruments.length, start);
    logInfra('info', 'market-data', `Regenerated ${created} development candles across ${instruments.length} instruments`);
    return { instruments: instruments.length, candles: created };
  }
}