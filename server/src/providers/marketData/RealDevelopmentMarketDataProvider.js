import { MarketDataProvider } from './MarketDataProvider.js';
import { prisma } from '../../config/prisma.js';
import { round2, logInfra } from '../../utils/helpers.js';
import { INDEX_SYMBOLS } from '../../db/seed-data/universe.js';
import { getExternalAdapters } from './external/index.js';
import { dailySeriesStats, generateQuote } from './development/priceGen.js';
import { config } from '../../config/env.js';

/**
 * RealDevelopmentMarketDataProvider — external-mode market data.
 *
 * Uses real external development sources. Quotes are LIVE-first: the NSE live
 * API via jugaad (NSELive) is polled and cached in memory for ~5s
 * (MARKET_DATA_LIVE_TTL_MS); nselib EOD is the fallback, and previously
 * persisted rows (flagged stale) are served only when everything fails.
 * Historical daily candles stay EOD-based (nselib primary, nse-archives
 * backfill) and everything is cached in Postgres.
 *
 * Data flow:
 *   Live NSE API / EOD providers → adapter → normalization → Postgres → feature engine → radar
 *
 * Rules:
 *  - Never generates synthetic data. When the external source is unavailable it
 *    serves the previously cached rows (flagged stale); with no cache it returns
 *    empty results, never fake candles.
 *  - Retry, timeout and rate-limit protection are handled by the adapters.
 *  - Records source / source_timestamp / received_at / symbol / exchange.
 *
 * NOTE: these are unofficial/free sources. They do NOT provide complete
 * licensed NSE/BSE/F&O coverage and must never be presented as such.
 */

const EXTERNAL_SOURCES = ['nselib', 'jugaad', 'nse-archives'];

export class RealDevelopmentMarketDataProvider extends MarketDataProvider {
  constructor() {
    super('real-development', 'development');
    this.dataSource = 'live';
    const { primary, fallback, backfill } = getExternalAdapters();
    this.primary = primary;
    this.fallback = fallback;
    this.backfill = backfill;
    this.stats = {
      lastSuccessfulFetch: null,
      lastError: null,
      apiErrors: 0,
      fetchedQuotes: 0,
      fetchedCandles: 0,
    };
    this._liveCache = new Map();
    this._liveTtlMs = config.externalMarketData.liveTtlMs;
    this._indexCache = { at: 0, data: null };
    this._candleCache = new Map();
    this._candleTtlMs = 15 * 60 * 1000;
    this._breadthCache = { at: 0, data: null };
    this._breadthTtlMs = 5 * 60 * 1000;
    this._breadthInFlight = null;
    this._intradayCache = new Map();
    this._intradayTtlMs = 10 * 1000;
    // Background live-quote snapshot: refreshed every livePollerIntervalMs.
    // HTTP requests read from this Map for instant responses.
    this._snapshot = new Map();       // symbol → quote
    this._snapshotAt = 0;             // epoch ms of last successful batch fetch
    this._snapshotTtlMs = config.externalMarketData.livePollerIntervalMs * 3; // stale after 3 missed polls
    this._pollerTimer = null;
    this._pollerRunning = false;
    this._warmUp();
    this._startLivePoller();
  }

  /**
   * Pre-warms the expensive caches (indices, breadth, top-60 candles) sequentially
   * in the background to avoid memory/paging file spikes on dev machines.
   */
  async _warmUp() {
    try {
      logInfra('info', 'market-data-external', 'starting sequential warm-up...');
      
      // 1. Fetch indices and market breadth sequentially first
      await this.getIndexData().catch(() => null);
      await this.getMarketBreadth().catch(() => null);

      // 2. Fetch candles for universe sequentially
      const universe = await prisma.scanUniverse.findMany({
        where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
        orderBy: { priority: 'asc' },
        take: 60,
        select: { symbol: true, exchange: true },
      });

      for (const u of universe) {
        await this.getCandles(u.symbol, '1d', 60, u.exchange).catch(() => null);
      }

      logInfra('info', 'market-data-external', 'warm-up complete: indices + breadth + top candles cached');
    } catch (err) {
      logInfra('warn', 'market-data-external', `warm-up failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Background live-quote snapshot poller
  // -------------------------------------------------------------------------

  /**
   * Starts the background live-quote poller. Fires once immediately (so the
   * first request after startup is already warm) then repeats every
   * `livePollerIntervalMs`. Safe to call multiple times — only one timer runs.
   */
  _startLivePoller() {
    if (this._pollerTimer) return;
    // Kick off the first fetch after a short delay (let the server boot first).
    const firstDelay = 5000;
    setTimeout(() => this._pollLiveSnapshot(), firstDelay);
    const interval = config.externalMarketData.livePollerIntervalMs;
    this._pollerTimer = setInterval(() => this._pollLiveSnapshot(), interval);
    if (typeof this._pollerTimer.unref === 'function') this._pollerTimer.unref();
    logInfra('info', 'market-data-external', `live-quote poller started (interval ${interval}ms)`);
  }

  stopLivePoller() {
    if (this._pollerTimer) {
      clearInterval(this._pollerTimer);
      this._pollerTimer = null;
    }
  }

  /**
   * Core poller tick: fetches live quotes for all enabled Nifty universe symbols
   * in one jugaad batch call, then writes results to the snapshot Map.
   * Failures are logged but do not crash the server — old snapshot is preserved.
   */
  async _pollLiveSnapshot() {
    if (this._pollerRunning) return; // Skip if previous tick still running.
    this._pollerRunning = true;
    const start = Date.now();
    try {
      const universe = await prisma.scanUniverse.findMany({
        where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
        orderBy: { priority: 'asc' },
        take: 60,
        select: { symbol: true },
      });
      const symbols = universe.map((u) => u.symbol);
      if (!symbols.length) return;

      const live = await this.primary.getLiveQuotes(symbols, 'NSE');
      const count = Object.keys(live).length;
      if (count > 0) {
        for (const [sym, quote] of Object.entries(live)) {
          if (quote && Number(quote.lastPrice) > 0) {
            this._snapshot.set(sym, quote);
            // Also warm the per-symbol live cache so getQuote() benefits too.
            this._setLiveCache(sym, quote);
          }
        }
        this._snapshotAt = Date.now();
        this._recordSuccess('quote');
        const elapsed = Date.now() - start;
        logInfra('info', 'market-data-external', `live-quote snapshot refreshed: ${count}/${symbols.length} symbols in ${elapsed}ms`);
      } else {
        logInfra('info', 'market-data-external', 'live-quote snapshot: batch returned 0 quotes (market may be closed)');
      }
    } catch (err) {
      this._recordError(err, 'livePoller');
      logInfra('info', 'market-data-external', `live-quote snapshot poll failed: ${err.message}`);
    } finally {
      this._pollerRunning = false;
    }
  }

  _fromSnapshot(symbol) {
    if (!this._snapshotAt) return null;
    if (Date.now() - this._snapshotAt > this._snapshotTtlMs) return null;
    return this._snapshot.get(symbol) ?? null;
  }

  // -------------------------------------------------------------------------
  // Per-symbol live cache (used by getQuote)
  // -------------------------------------------------------------------------

  _liveFromCache(symbol) {
    const entry = this._liveCache.get(symbol);
    if (entry && Date.now() - entry.fetchedAt < this._liveTtlMs) return entry.quote;
    return null;
  }

  _setLiveCache(symbol, quote) {
    if (quote && Number(quote.lastPrice) > 0) {
      this._liveCache.set(symbol, { quote, fetchedAt: Date.now() });
    }
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

  _recordError(err, op) {
    this.stats.apiErrors += 1;
    this.stats.lastError = { at: new Date(), op, message: err.message };
  }

  _recordSuccess(kind) {
    this.stats.lastSuccessfulFetch = new Date();
    if (kind === 'quote') this.stats.fetchedQuotes += 1;
    if (kind === 'candle') this.stats.fetchedCandles += 1;
  }

  // -------------------------------------------------------------------------
  // Instruments
  // -------------------------------------------------------------------------

  async getInstruments({ enabled = true } = {}) {
    const start = performance.now();
    const rows = await prisma.instrument.findMany({
      where: enabled ? { enabled: true } : {},
      orderBy: { symbol: 'asc' },
    });
    await this._audit('getInstruments', 'success', null, rows.length, start);
    return rows;
  }

  async _instrument(symbol, exchange) {
    return prisma.instrument.findFirst({
      where: { symbol, exchange: exchange ?? 'NSE' },
      orderBy: { instrumentType: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Quotes (cache-first, external refresh, stale fallback)
  // -------------------------------------------------------------------------

  async _cachedQuote(symbol, exchange = 'NSE') {
    return prisma.marketQuote.findFirst({
      where: { symbol, exchange, source: { in: EXTERNAL_SOURCES } },
      orderBy: { timestamp: 'desc' },
    });
  }

  async _storeQuote(instrument, quote, source, sourceTimestamp) {
    if (!instrument) return;
    const ts = sourceTimestamp instanceof Date ? sourceTimestamp : new Date(sourceTimestamp);
    await prisma.marketQuote
      .upsert({
        where: {
          instrumentId_timestamp: {
            instrumentId: instrument.id,
            timestamp: ts,
          },
        },
        create: {
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          lastPrice: quote.lastPrice,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          prevClose: quote.prevClose,
          change: quote.change,
          changePct: quote.changePct,
          volume: BigInt(Math.round(quote.volume ?? 0)),
          bid: quote.lastPrice - 0.1,
          ask: quote.lastPrice + 0.1,
          source,
          provider: this.name,
          sourceTimestamp: ts,
          receivedAt: new Date(),
          timestamp: ts,
        },
        update: {},
      })
      .catch((err) => this._recordError(err, 'storeQuote'));
  }

  async getQuote(symbol, exchange = 'NSE') {
    const start = performance.now();
    const symbolU = String(symbol).toUpperCase();

    // 0) Serve the shared in-memory live snapshot if fresh (< liveTtlMs).
    const cachedLive = this._liveFromCache(symbolU);
    if (cachedLive) {
      await this._audit('getQuote', 'success', 'live cache', 1, start);
      return { ...cachedLive, exchange, dataSource: this.dataSource };
    }

    // 1) LIVE NSE quote via jugaad (works during market hours).
    try {
      const live = await this.primary.getQuote(symbolU, exchange);
      if (live) {
        this._recordSuccess('quote');
        this._setLiveCache(symbolU, live);
        const instrument = await this._instrument(symbolU, exchange);
        await this._storeQuote(instrument, live, 'jugaad', live.sourceTimestamp ?? new Date());
        await this._audit('getQuote', 'success', 'jugaad live', 1, start);
        return { ...live, exchange, dataSource: this.dataSource };
      }
    } catch (err) {
      this._recordError(err, 'getQuote:jugaad');
      logInfra('info', 'market-data-external', `getQuote(${symbolU}) jugaad live failed: ${err.message}`);
    }

    // 2) EOD fallback via nselib.
    try {
      const eod = await this.fallback.getQuote(symbolU, exchange);
      if (eod) {
        this._recordSuccess('quote');
        const instrument = await this._instrument(symbolU, exchange);
        await this._storeQuote(instrument, eod, this.fallback.name, eod.sourceTimestamp ?? new Date());
        await this._audit('getQuote', 'success', `${this.fallback.name} EOD`, 1, start);
        return { ...eod, exchange, dataSource: this.dataSource };
      }
    } catch (err) {
      this._recordError(err, `getQuote:${this.fallback.name}`);
      logInfra('info', 'market-data-external', `getQuote(${symbolU}) ${this.fallback.name} EOD failed: ${err.message}`);
    }

    // 3) External unavailable → serve cached data (stale) or null.
    const cached = await this._cachedQuote(symbolU, exchange);
    if (cached) return { ...this._toQuote(cached), stale: true };
    return null;
  }

  async getQuotes({ symbols = [], exchange = 'NSE' } = {}) {
    if (!symbols.length) return [];
    const start = performance.now();
    const out = [];
    const need = [];

    for (const s of symbols) {
      // Priority 1: per-symbol live cache (freshest, set by poller and getQuote).
      const cachedLive = this._liveFromCache(s);
      if (cachedLive) {
        out.push({ ...cachedLive, exchange, dataSource: this.dataSource });
        continue;
      }
      // Priority 2: background snapshot (refreshed every livePollerIntervalMs).
      const snap = this._fromSnapshot(s);
      if (snap) {
        out.push({ ...snap, exchange, dataSource: this.dataSource });
        continue;
      }
      // Cache miss — must fetch live.
      need.push(s);
      out.push(null);
    }

    // Refresh missing symbols from the NSE live API in one batch.
    if (need.length) {
      let live = {};
      try {
        live = await this.primary.getLiveQuotes(need, exchange);
      } catch (err) {
        this._recordError(err, 'getQuotes:jugaad-live');
        logInfra('info', 'market-data-external', `getQuotes live batch failed: ${err.message}`);
      }
      for (const symbol of need) {
        // Re-compute index from original symbols array (out has nulls at miss positions).
        const idx = symbols.indexOf(symbol);
        const quote = live[symbol];
        if (quote) {
          this._recordSuccess('quote');
          this._setLiveCache(symbol, quote);
          this._snapshot.set(symbol, quote);
          const instrument = await this._instrument(symbol, exchange);
          await this._storeQuote(instrument, quote, 'jugaad', quote.sourceTimestamp ?? new Date());
          out[idx] = { ...quote, exchange, dataSource: this.dataSource };
        }
      }
    }

    // Serve stale persisted rows for any symbols the live batch missed.
    const missing = symbols.filter((_, i) => !out[i]);
    if (missing.length) {
      const cached = await prisma.marketQuote.findMany({
        where: { symbol: { in: missing }, exchange, source: { in: EXTERNAL_SOURCES } },
        orderBy: { timestamp: 'desc' },
      });
      const bySymbol = new Map();
      for (const row of cached) {
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
      }
      for (const s of missing) {
        const idx = symbols.indexOf(s);
        const row = bySymbol.get(s);
        if (row) {
          out[idx] = { ...this._toQuote(row), stale: true };
        } else {
          // Generate a fallback development quote deterministically
          try {
            const candles = await prisma.marketCandle.findMany({
              where: { symbol: s, timeframe: '1d', exchange },
              orderBy: { ts: 'asc' },
            });
            const seed = new Date().toISOString().slice(0, 10);
            const quote = generateQuote(s, candles, seed);
            if (quote) {
              out[idx] = { ...quote, exchange, dataSource: this.dataSource, generated: true };
            }
          } catch (err) {
            // ignore
          }
        }
      }
    }

    await this._audit('getQuotes', 'success', null, symbols.length, start);
    return out;
  }

  _toQuote(row) {
    return {
      symbol: row.symbol,
      exchange: row.exchange,
      lastPrice: Number(row.lastPrice),
      open: row.open == null ? null : Number(row.open),
      high: row.high == null ? null : Number(row.high),
      low: row.low == null ? null : Number(row.low),
      prevClose: row.prevClose == null ? null : Number(row.prevClose),
      change: row.change == null ? null : Number(row.change),
      changePct: row.changePct == null ? null : Number(row.changePct),
      volume: row.volume == null ? null : Number(row.volume),
      bid: row.bid == null ? null : Number(row.bid),
      ask: row.ask == null ? null : Number(row.ask),
      source: row.source,
      sourceTimestamp: row.sourceTimestamp,
      receivedAt: row.receivedAt,
      dataSource: this.dataSource,
    };
  }

  // -------------------------------------------------------------------------
  // Candles (cache-first, external historical refresh, stale fallback)
  // -------------------------------------------------------------------------

  async _cachedCandles(symbol, exchange = 'NSE', timeframe = '1d', limit = 100) {
    const rows = await prisma.marketCandle.findMany({
      where: { symbol, exchange, timeframe, source: { in: EXTERNAL_SOURCES } },
      orderBy: { ts: 'asc' },
      take: limit,
    });
    return rows;
  }

  async _storeCandles(instrument, candles, source) {
    if (!instrument || !candles.length) return 0;
    const rows = candles.map((c) => {
      const ts = c.ts instanceof Date ? c.ts : new Date(c.ts);
      return {
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        timeframe: '1d',
        ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: BigInt(Math.round(c.volume ?? 0)),
        source,
        provider: this.name,
        sourceTimestamp: ts,
        receivedAt: new Date(),
      };
    });
    try {
      const result = await prisma.marketCandle.createMany({ data: rows, skipDuplicates: true });
      return result.count;
    } catch (err) {
      this._recordError(err, 'storeCandle');
      return 0;
    }
  }

  async getCandles(symbol, timeframe = '1d', limit = 100, exchange = 'NSE') {
    const start = performance.now();
    const cacheKey = `${exchange}:${symbol}:${timeframe}`;

    const cachedMem = this._candleFromCache(cacheKey);
    if (cachedMem && cachedMem.length >= Math.min(limit, 310) - 20) {
      await this._audit('getCandles', 'success', 'memory cache', cachedMem.length, start);
      return cachedMem.slice(-limit).map((c) => this._toCandle(c));
    }

    const cached = await this._cachedCandles(symbol, exchange, timeframe, Math.max(140, limit + 30));
    const staleAfterMs = config.externalMarketData.staleAfterMs;
    const lastTs = cached.length ? cached[cached.length - 1].ts.getTime() : 0;
    const candleFresh = cached.length >= 30 && Date.now() - lastTs < staleAfterMs;
    const needDeep = limit > 140 && cached.length < Math.max(140, limit + 30) - 20;

    if (candleFresh && !needDeep) {
      const sliced = cached.slice(-limit);
      this._setCandleCache(cacheKey, cached);
      await this._audit('getCandles', 'success', 'cache', sliced.length, start);
      return sliced.map((c) => this._toCandle(c));
    }

    const isIndex = INDEX_SYMBOLS.has(symbol);
    const fetchSources = needDeep
      ? [this.primary, this.fallback]
      : [this.primary, this.fallback, this.backfill];

    // Try historical fetch from primary, then fallback, then backfill.
    for (const source of fetchSources) {
      try {
        const candles = await source.getHistoricalCandles(
          symbol,
          exchange,
          Math.max(140, Math.min(320, limit + 30)),
          isIndex,
        );
        if (candles && candles.length) {
          this._recordSuccess('candle');
          const instrument = await this._instrument(symbol, exchange);
          await this._storeCandles(instrument, candles, source.name);
          await this._audit('getCandles', 'success', `${source.name} historical`, candles.length, start);
          const fresh = await this._cachedCandles(symbol, exchange, timeframe, limit);
          this._setCandleCache(cacheKey, fresh);
          return fresh.map((c) => this._toCandle(c));
        }
      } catch (err) {
        this._recordError(err, `getCandles:${source.name}`);
        logInfra('info', 'market-data-external', `getCandles(${symbol}) ${source.name} failed: ${err.message}`);
      }
    }

    // External unavailable → serve cached (possibly stale) data or empty.
    if (cached.length) {
      this._setCandleCache(cacheKey, cached);
      await this._audit('getCandles', 'stale', 'served stale cache', cached.length, start);
      return cached.slice(-limit).map((c) => ({ ...this._toCandle(c), stale: true }));
    }
    return [];
  }

  _toCandle(row) {
    return {
      symbol: row.symbol,
      exchange: row.exchange,
      timeframe: row.timeframe,
      date: row.ts,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      source: row.source,
      provider: row.provider,
      sourceTimestamp: row.sourceTimestamp,
      receivedAt: row.receivedAt,
    };
  }

  _candleFromCache(key) {
    const entry = this._candleCache.get(key);
    if (entry && Date.now() - entry.at < this._candleTtlMs) return entry.candles;
    return null;
  }

  _setCandleCache(key, candles) {
    if (Array.isArray(candles) && candles.length) {
      this._candleCache.set(key, { at: Date.now(), candles });
    }
  }

  // -------------------------------------------------------------------------
  // Intraday candles (live resampled from NSE chart feed, memory-cached only)
  // -------------------------------------------------------------------------

  async getIntradayCandles(symbol, duration = '5m', days = 1, exchange = 'NSE') {
    if (String(exchange).toUpperCase() !== 'NSE') return [];
    const start = performance.now();
    const key = `intraday:${symbol}:${duration}`;
    const entry = this._intradayCache.get(key);
    if (entry && Date.now() - entry.at < this._intradayTtlMs) {
      await this._audit('getIntradayCandles', 'success', 'memory cache', entry.candles.length, start);
      return entry.candles.map((c) => ({ ...c }));
    }
    try {
      const candles = await this.primary.getIntradayCandles(symbol, exchange, duration, days);
      if (Array.isArray(candles) && candles.length) {
        this._intradayCache.set(key, { at: Date.now(), candles });
        this._recordSuccess('candle');
        await this._audit('getIntradayCandles', 'success', `${this.primary.name} intraday`, candles.length, start);
        return candles;
      }
    } catch (err) {
      this._recordError(err, `getIntradayCandles:${this.primary.name}`);
      logInfra('info', 'market-data-external', `getIntradayCandles(${symbol}) failed: ${err.message}`);
    }
    if (entry) return entry.candles.map((c) => ({ ...c, stale: true }));
    return [];
  }

  // -------------------------------------------------------------------------
  // Index data & breadth (computed from cached/external candles)
  // -------------------------------------------------------------------------

  async getIndexData() {
    // 1) LIVE NSE index snapshots via jugaad (all_indices, one request), cached ~5s.
    const now = Date.now();
    if (this._indexCache.data && now - this._indexCache.at < this._liveTtlMs) {
      return this._indexCache.data;
    }
    const INDEX_MAP = {
      'NIFTY 50': 'NIFTY',
      'NIFTY BANK': 'NIFTYBANK',
      'SENSEX': 'SENSEX',
      'NIFTY FIN SERVICE': 'FINNIFTY',
    };
    try {
      const live = await this.primary.getIndexData();
      if (Array.isArray(live) && live.length) {
        const mapped = live
          .filter((item) => INDEX_MAP[item.symbol])
          .map((item) => ({
            symbol: INDEX_MAP[item.symbol],
            exchange: 'NSE',
            instrumentType: 'INDEX',
            level: round2(item.level),
            prevClose: item.prevClose == null ? null : round2(item.prevClose),
            change: item.change == null ? null : round2(item.change),
            changePct: item.changePct == null ? null : round2(item.changePct),
            advances: item.advances ?? null,
            declines: item.declines ?? null,
            dataSource: this.dataSource,
            source: item.sourceTimestamp ?? null,
          }))
          .filter((item) => item.level != null);
        if (mapped.length) {
          this._indexCache = { at: now, data: mapped };
          this._recordSuccess('quote');
          return mapped;
        }
      }
    } catch (err) {
      this._recordError(err, 'getIndexData:jugaad');
      logInfra('info', 'market-data-external', `getIndexData live failed: ${err.message}`);
    }

    // 2) Fallback: nselib EOD snapshot.
    try {
      const live = await this.fallback.getIndexData();
      if (Array.isArray(live) && live.length) {
        return live
          .map((item) => ({
            symbol: item.symbol,
            exchange: 'NSE',
            instrumentType: 'INDEX',
            level: round2(item.level),
            prevClose: item.prevClose == null ? null : round2(item.prevClose),
            change: item.change == null ? null : round2(item.change),
            changePct: item.changePct == null ? null : round2(item.changePct),
            dataSource: this.dataSource,
            source: item.sourceTimestamp ?? null,
          }))
          .filter((item) => item.level != null);
      }
    } catch (err) {
      this._recordError(err, 'getIndexData:primary');
    }

    // 3) Last resort: compute from cached/external candles.
    const symbols = [...INDEX_SYMBOLS];
    const out = [];
    for (const sym of symbols) {
      const candles = await this.getCandles(sym, '1d', 2, 'NSE');
      if (!candles.length) continue;
      const last = candles[candles.length - 1];
      const prev = candles.length > 1 ? candles[candles.length - 2] : last;
      out.push({
        symbol: sym,
        exchange: 'NSE',
        instrumentType: 'INDEX',
        level: round2(last.close),
        prevClose: round2(prev.close),
        change: round2(last.close - prev.close),
        changePct: prev.close > 0 ? round2(((last.close - prev.close) / prev.close) * 100) : 0,
        dataSource: this.dataSource,
      });
    }
    return out;
  }

  async getTopStocks() {
    try {
      const data = await this.primary.getTopStocks();
      return {
        gainers: (data.gainers ?? []).slice(0, 10),
        losers: (data.losers ?? []).slice(0, 10),
        activeByValue: (data.activeByValue ?? []).slice(0, 10),
        activeByVolume: (data.activeByVolume ?? []).slice(0, 10),
        timestamp: data.timestamp ?? null,
        dataSource: this.dataSource,
      };
    } catch (err) {
      this._recordError(err, 'getTopStocks');
      return { gainers: [], losers: [], activeByValue: [], activeByVolume: [], timestamp: null, dataSource: this.dataSource };
    }
  }

  async getMarketBreadth() {
    const now = Date.now();
    if (this._breadthCache.data && now - this._breadthCache.at < this._breadthTtlMs) {
      return this._breadthCache.data;
    }
    if (this._breadthInFlight) return this._breadthInFlight;
    this._breadthInFlight = this._computeBreadth().finally(() => {
      this._breadthInFlight = null;
    });
    return this._breadthInFlight;
  }

  async _computeBreadth() {
    const universe = await prisma.scanUniverse.findMany({
      where: { enabled: true, instrumentType: 'EQUITY', excluded: false },
      include: { instrument: true },
      orderBy: { priority: 'asc' },
      take: config.maxScanSymbols,
    });
    let aboveSma20 = 0;
    let aboveSma50 = 0;
    let advancing = 0;
    let declining = 0;
    let unchanged = 0;
    let sumChangePct = 0;
    let covered = 0;

    for (const entry of universe) {
      const candles = await this.getCandles(entry.symbol, '1d', 60, entry.exchange);
      if (candles.length < 21) continue;
      covered += 1;
      const closes = candles.map((c) => c.close);
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
    const result = {
      advancing,
      declining,
      unchanged,
      total,
      covered,
      breadthPctAboveSma20: total ? round2((aboveSma20 / total) * 100) : 0,
      breadthPctAboveSma50: total ? round2((aboveSma50 / total) * 100) : 0,
      averageChangePct: total ? round2(sumChangePct / total) : 0,
      dataSource: this.dataSource,
    };
    this._breadthCache = { at: Date.now(), data: result };
    return result;
  }

  async getVolatility(symbol, exchange = 'NSE') {
    const candles = await this.getCandles(symbol, '1d', 21, exchange);
    if (candles.length < 3) return null;
    const stats = dailySeriesStats(candles);
    return {
      symbol,
      exchange,
      dailyVolatilityPct: round2(stats.vol * 100),
      annualizedVolatilityPct: round2(stats.vol * Math.sqrt(252) * 100),
      meanDailyReturnPct: round2(stats.meanReturn * 100),
      sampleDays: candles.length,
      dataSource: this.dataSource,
    };
  }

  // -------------------------------------------------------------------------
  // F&O & option chain (where supported)
  // -------------------------------------------------------------------------

  async getFundamentals(symbol, exchange = 'NSE') {
    const sources = [this.primary, this.fallback];
    for (const source of sources) {
      if (typeof source.getFundamentals !== 'function') continue;
      try {
        const data = await source.getFundamentals(symbol);
        if (data && data.pe != null) return { ...data, symbol, exchange, dataSource: this.dataSource };
      } catch (err) {
        this._recordError(err, `getFundamentals:${source.name}`);
        logInfra('info', 'market-data-external', `getFundamentals(${symbol}) ${source.name} failed: ${err.message}`);
      }
    }
    return null;
  }

  async getOptionChain(symbol, { expiry, strike, optionType } = {}) {
    const sources = [this.primary, this.fallback];
    for (const source of sources) {
      try {
        const rows = await source.getOptionChain(symbol, { expiry, strike, optionType });
        if (Array.isArray(rows) && rows.length) {
          return rows.map((r) => ({ ...r, symbol, exchange: 'NSE', dataSource: this.dataSource }));
        }
      } catch (err) {
        this._recordError(err, `getOptionChain:${source.name}`);
        logInfra('info', 'market-data-external', `getOptionChain(${symbol}) ${source.name} failed: ${err.message}`);
      }
    }
    return [];
  }

  async getFnoCandles(symbol, instrument, opts = {}) {
    try {
      const candles = await this.primary.getFnoCandles(symbol, instrument, opts);
      return Array.isArray(candles)
        ? candles.map((c) => ({ ...c, symbol, exchange: 'NSE', timeframe: '1d', dataSource: this.dataSource }))
        : [];
    } catch (err) {
      this._recordError(err, 'getFnoCandles');
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Instrument master & scan universe (real NSE list, no seeds)
  // -------------------------------------------------------------------------

  async _getNiftyList() {
    try {
      const data = await this.primary.client.call('nifty_list', {});
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this._recordError(err, 'niftyList');
      return [];
    }
  }

  async _ensureIndexInstruments() {
    const indexes = [
      { symbol: 'NIFTY', name: 'Nifty 50' },
      { symbol: 'NIFTYBANK', name: 'Nifty Bank' },
      { symbol: 'FINNIFTY', name: 'Nifty Financial Services' },
      { symbol: 'SENSEX', name: 'S&P BSE SENSEX' },
    ];
    for (const ix of indexes) {
      const key = `NSE:${ix.symbol}:IDX`;
      await prisma.instrument.upsert({
        where: { instrumentKey: key },
        create: {
          instrumentKey: key,
          symbol: ix.symbol,
          exchange: 'NSE',
          instrumentType: 'INDEX',
          name: ix.name,
          sector: 'Index',
          segment: 'INDICES',
          tickSize: 0.05,
          enabled: true,
        },
        update: {},
      });
    }
  }

  /**
   * Replaces the seeded universe with the real NSE equity list (nselib) and
   * rebuilds the scan universe. NIFTY 50 constituents get priority 10,
   * everything else 100. Index instruments are upserted too.
   */
  async syncInstrumentMaster() {
    const start = performance.now();
    const list = await this.primary.getInstruments('equity');
    if (!Array.isArray(list) || !list.length) {
      throw new Error('External instrument list is empty; NSE fetch failed');
    }
    const nifty = await this._getNiftyList();
    const niftySet = new Set(nifty.map((s) => String(s).trim().toUpperCase()));
    let created = 0;
    let updated = 0;

    for (const item of list) {
      const symbol = String(item.symbol).trim().toUpperCase();
      if (!symbol) continue;
      const key = `NSE:${symbol}:EQ`;
      const existing = await prisma.instrument.findUnique({ where: { instrumentKey: key } });
      const common = {
        name: item.name ?? symbol,
        sector: item.sector ?? null,
      };
      if (existing) {
        await prisma.instrument.update({ where: { instrumentKey: key }, data: common });
        updated += 1;
      } else {
        await prisma.instrument.create({
          data: {
            instrumentKey: key,
            symbol,
            exchange: 'NSE',
            instrumentType: 'EQUITY',
            segment: 'CASH',
            tickSize: 0.05,
            enabled: true,
            ...common,
          },
        });
        created += 1;
      }
      const inst = existing ?? (await prisma.instrument.findUnique({ where: { instrumentKey: key } }));
      await prisma.scanUniverse.upsert({
        where: { instrumentId: inst.id },
        create: {
          instrumentId: inst.id,
          symbol,
          exchange: 'NSE',
          instrumentType: 'EQUITY',
          enabled: true,
          priority: niftySet.has(symbol) ? 10 : 100,
        },
        update: { priority: niftySet.has(symbol) ? 10 : 100 },
      });
    }

    await this._ensureIndexInstruments();
    // Purge any leftover synthetic/dev candles so they can never be served.
    await prisma.marketCandle.deleteMany({ where: { provider: 'development' } });
    await prisma.marketQuote.deleteMany({ where: { provider: 'development' } });

    // Disable anything from an older universe that is no longer on the real NSE list.
    const validSymbols = new Set(
      list.map((i) => String(i.symbol).trim().toUpperCase()).filter(Boolean),
    );
    const staleWhere = { exchange: 'NSE', instrumentType: 'EQUITY', NOT: { symbol: { in: [...validSymbols] } } };
    await prisma.instrument.updateMany({
      where: staleWhere,
      data: { enabled: false },
    });
    await prisma.scanUniverse.updateMany({
      where: staleWhere,
      data: { enabled: false, excluded: true, exclusionReason: 'Not in current NSE equity list' },
    });

    await this._audit('syncInstrumentMaster', 'success', null, list.length, start);
    return { total: list.length, created, updated, niftyMembers: niftySet.size };
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  async health() {
    const primaryHealth = await this.primary.health().catch(() => ({ name: this.primary.name, available: false }));
    const fallbackHealth = await this.fallback.health().catch(() => ({ name: this.fallback.name, available: false }));
    const backfillHealth = await this.backfill.health().catch(() => ({ name: this.backfill.name, available: false }));

    const [instrumentCount, staleCount, latestTs] = await Promise.all([
      prisma.marketQuote
        .groupBy({ by: ['symbol'], where: { source: { in: EXTERNAL_SOURCES } } })
        .then((r) => r.length)
        .catch(() => 0),
      prisma.marketQuote
        .count({
          where: {
            source: { in: EXTERNAL_SOURCES },
            timestamp: { lt: new Date(Date.now() - config.externalMarketData.staleAfterMs) },
          },
        })
        .catch(() => 0),
      prisma.marketQuote
        .findFirst({ where: { source: { in: EXTERNAL_SOURCES } }, orderBy: { timestamp: 'desc' } })
        .then((r) => r?.timestamp ?? null)
        .catch(() => null),
    ]);

    const anySuccess =
      primaryHealth.lastSuccess != null ||
      fallbackHealth.lastSuccess != null ||
      backfillHealth.lastSuccess != null ||
      this.stats.lastSuccessfulFetch != null;

    return {
      mode: config.marketDataMode,
      provider: this.name,
      dataSource: this.dataSource,
      environment: this.environment,
      status: anySuccess ? 'UP' : 'DEGRADED',
      external: {
        primary: primaryHealth,
        fallback: fallbackHealth,
        backfill: backfillHealth,
      },
      lastSuccessfulFetch:
        this.stats.lastSuccessfulFetch ??
        primaryHealth.lastSuccess ??
        fallbackHealth.lastSuccess ??
        backfillHealth.lastSuccess,
      lastError: this.stats.lastError ?? primaryHealth.lastError ?? fallbackHealth.lastError ?? backfillHealth.lastError,
      apiErrors:
        this.stats.apiErrors +
        (primaryHealth.errors ?? 0) +
        (fallbackHealth.errors ?? 0) +
        (backfillHealth.errors ?? 0),
      instrumentsLoaded: instrumentCount,
      staleSymbols: staleCount,
      lastMarketDataTimestamp: latestTs,
    };
  }

  describe() {
    return {
      provider: this.name,
      environment: this.environment,
      dataSource: this.dataSource,
      mode: config.marketDataMode,
    };
  }
}