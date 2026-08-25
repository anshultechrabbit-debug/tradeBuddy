import crypto from 'node:crypto';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import {
  computeFeatures,
  computeConviction,
  computeRegime,
  generateSignal,
  buildReason,
  deepDive,
} from './radar/engine.js';
import { sma } from './radar/indicators.js';
import { round2, logInfra, audit } from '../utils/helpers.js';
import { publishRadar } from './eventHub.js';

export function mapLimit(items, limit, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)).then(
    () => results,
  );
}

async function getIndexReturn20(provider) {
  const candles = await provider.getCandles('NIFTY', '1d', 30, 'NSE');
  // Insufficient index history is genuinely UNKNOWN, not "the index returned
  // exactly 0%" — a fabricated 0 would make every stock's relative-strength
  // score silently collapse to its own absolute return.
  if (candles.length < 21) return null;
  const closes = candles.map((c) => c.close);
  return (closes[closes.length - 1] / closes[closes.length - 21] - 1) * 100;
}

async function getIndexAboveSma50(provider) {
  const candles = await provider.getCandles('NIFTY', '1d', 60, 'NSE');
  if (candles.length < 50) return null;
  const closes = candles.map((c) => c.close);
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  return closes[closes.length - 1] > sma50;
}

/**
 * Runs a full radar scan over the scan universe. Returns ranked
 * opportunities, regime and breadth. Deterministic: same universe + candles
 * yields identical scores.
 */
let lastScanResult = null;
let schedulerTimer = null;
let schedulerRunning = false;

/**
 * Pure computation of a radar scan (no persistence). Returns the ranked
 * opportunities plus the raw per-symbol results for optional persistence.
 */
async function computeScan({ userId = null, limit = 15 }) {
  const provider = getMarketDataProvider();
  const scanId = `scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const universe = await prisma.scanUniverse.findMany({
    where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
    include: { instrument: true },
    orderBy: { priority: 'asc' },
    take: config.maxScanSymbols,
  });

  const [breadth, indexReturn20, indexAboveSma50] = await Promise.all([
    provider.getMarketBreadth(),
    getIndexReturn20(provider),
    getIndexAboveSma50(provider),
  ]);

  const regime = computeRegime({
    breadthPctAboveSma50: breadth.breadthPctAboveSma50,
    indexAboveSma50,
  });

  const breadthPct = breadth.breadthPctAboveSma50;

  // Not every symbol has usable cached candles yet (e.g. right after a DB
  // seed, or a symbol nobody has ever analyzed) — for those, getCandles
  // would otherwise fall through to an external historical fetch. An
  // interactive scan must never do that inline: even a bounded batch of
  // external fetches is enough to stall the request for minutes and starve
  // every other page's requests behind the same shared rate limiter. So this
  // scan only ever scores symbols that are ALREADY fresh in the DB — a
  // cheap, purely local read — and skips the rest for this pass. Coverage
  // still improves over time via a fully decoupled background loop (see
  // startCandleBackfillLoop) that fetches stale/missing symbols without
  // ever blocking a user request.
  const staleAfterMs = config.externalMarketData.staleAfterMs;
  const freshnessRows = await prisma.marketCandle.groupBy({
    by: ['symbol'],
    where: { symbol: { in: universe.map((u) => u.symbol) }, timeframe: '1d' },
    _max: { ts: true },
    _count: { _all: true },
  });
  const freshBySymbol = new Map(freshnessRows.map((r) => [r.symbol, r]));
  const now = Date.now();
  const isFresh = (symbol) => {
    const r = freshBySymbol.get(symbol);
    return !!r && r._count._all >= 30 && now - new Date(r._max.ts).getTime() <= staleAfterMs;
  };

  const universeToScan = [];
  const failures = [];
  for (const entry of universe) {
    if (isFresh(entry.symbol)) universeToScan.push(entry);
    else failures.push(entry.symbol);
  }

  // Cache-only reads from here — every symbol in universeToScan is already
  // fresh, so this never triggers an external fetch. Concurrency can be much
  // higher than the external-call paths elsewhere (those are capped low to
  // avoid tripping NSE's rate limiting) since this is pure Postgres I/O.
  const candlesList = await mapLimit(universeToScan, 20, (entry) =>
    provider.getCandles(entry.symbol, '1d', 60, entry.exchange),
  );

  // Phase 1: score every already-fresh symbol off cached candle closes only
  // — no live quotes yet. Live-quoting every symbol up front used to be the
  // dominant cost here: a single scan could mean a live-quote fetch for the
  // entire multi-thousand-symbol universe, which — even chunked — is many
  // minutes of sequential external calls before the request could respond.
  function scoreEntry(entry, candles, livePrice) {
    if (!candles || candles.length < 30) return null;
    const features = computeFeatures(candles, { indexReturn20, breadthPct, livePrice });
    if (!features) return null;
    const conviction = computeConviction(features);
    const signal = generateSignal({ conviction, regime, features });
    const reason = buildReason(features, regime, conviction);
    return {
      instrumentId: entry.instrumentId,
      symbol: entry.symbol,
      exchange: entry.exchange,
      price: features.lastPrice,
      signal,
      regime,
      convictionScore: conviction,
      reason,
      features,
      priority: entry.priority,
      candles,
    };
  }

  const scanned = [];
  for (let i = 0; i < universeToScan.length; i += 1) {
    const entry = universeToScan[i];
    const scored = scoreEntry(entry, candlesList[i], null);
    if (!scored) {
      failures.push(entry.symbol);
      continue;
    }
    scanned.push(scored);
  }

  scanned.sort((a, b) => b.convictionScore - a.convictionScore);

  // Phase 2: refresh live price/intraday-momentum for a bounded candidate
  // pool only — the symbols that could plausibly make the final cut — rather
  // than the whole universe. computeFeatures already treats a missing
  // livePrice as "use the last candle close", so anything outside this pool
  // is still scored, just without today's intraday move factored in. Only
  // worth attempting during market hours: NSE's live-quote API has nothing
  // to serve once trading has closed, and every failed attempt still pays
  // the full per-call timeout (30s) before giving up — three of those in a
  // row (before the circuit breaker opens) is what made an after-hours scan
  // take 90+ seconds for zero benefit.
  const CANDIDATE_POOL = Math.min(scanned.length, limit > 0 ? Math.max(limit * 8, 100) : 150);
  const candidates = scanned.slice(0, CANDIDATE_POOL);
  if (candidates.length && isMarketOpen()) {
    const liveQuotes = await provider.getQuotes({
      symbols: candidates.map((c) => c.symbol),
      exchange: 'NSE',
    });
    for (let i = 0; i < candidates.length; i += 1) {
      const q = liveQuotes[i];
      const livePrice = q && Number(q.lastPrice) > 0 ? q.lastPrice : null;
      if (livePrice == null) continue;
      const entry = { instrumentId: candidates[i].instrumentId, symbol: candidates[i].symbol, exchange: candidates[i].exchange, priority: candidates[i].priority };
      const rescored = scoreEntry(entry, candidates[i].candles, livePrice);
      if (rescored) candidates[i] = rescored;
    }
    scanned.splice(0, CANDIDATE_POOL, ...candidates);
    scanned.sort((a, b) => b.convictionScore - a.convictionScore);
  }

  const top = limit > 0 ? scanned.slice(0, limit) : scanned;

  return { scanId, userId, provider, regime, breadth, breadthPct, scanned, top, failures };
}

function shapeScanResult({ scanId, regime, breadth, top, provider }) {
  return {
    scanId,
    regime,
    breadth,
    lastScannedAt: new Date().toISOString(),
    opportunities: top.map((s) => ({
      symbol: s.symbol,
      exchange: s.exchange,
      price: round2(s.price),
      signal: s.signal,
      regime: s.regime,
      convictionScore: s.convictionScore,
      explanation: s.reason,
      dataSource: provider.dataSource,
    })),
  };
}

/**
 * Full scan (on demand). Persists signals + opportunities + audit, and also
 * refreshes the in-memory "latest" result used by the live polling endpoint.
 */
export async function runScan({ userId = null, limit = 15, persist = true } = {}) {
  const { scanId, provider, regime, breadth, breadthPct, scanned, top, failures } =
    await computeScan({ userId, limit });

  if (persist && userId != null) {
    const signalsData = scanned.map((s) => ({
      userId,
      instrumentId: s.instrumentId,
      symbol: s.symbol,
      exchange: s.exchange,
      signal: s.signal,
      regime: s.regime,
      convictionScore: s.convictionScore,
      features: s.features,
      reason: s.reason,
      dataSource: provider.dataSource,
    }));
    await prisma.scanSignal.createMany({ data: signalsData });

    const oppData = top.map((s) => ({
      scanId,
      userId,
      instrumentId: s.instrumentId,
      symbol: s.symbol,
      exchange: s.exchange,
      price: s.price,
      signal: s.signal,
      regime: s.regime,
      convictionScore: s.convictionScore,
      explanation: s.reason,
      dataSource: provider.dataSource,
    }));
    if (oppData.length) {
      await prisma.radarOpportunity.createMany({ data: oppData });
    }

    logInfra('info', 'radar', `Scan ${scanId}: ${scanned.length} symbols scanned, ${top.length} opportunities, ${failures.length} skipped`);
    await audit(userId, 'RADAR_SCAN', 'radar', scanId, {
      scanned: scanned.length,
      opportunities: top.length,
      regime,
      breadthPctAboveSma50: breadthPct,
    });
  }

  const result = shapeScanResult({ scanId, regime, breadth, top, provider });
  lastScanResult = result;
  publishRadar(result);
  return result;
}

/** Live scan: compute fresh scores WITHOUT persisting, cache for /radar/latest. */
export async function runLiveScan(limit = 0) {
  const { scanId, provider, regime, breadth, top } = await computeScan({ userId: null, limit });
  const result = shapeScanResult({ scanId, regime, breadth, top, provider });
  lastScanResult = result;
  publishRadar(result);
  return result;
}

/** Returns the latest computed scan (live or manual), or null before the first scan. */
export function getLatestScan() {
  return lastScanResult;
}

// -------------------------------------------------------------------------
// Candle backfill loop — decoupled from any interactive request. Steadily
// refreshes stale/missing candle data for a small batch of universe symbols
// each tick, so computeScan's cache-only reads keep finding more of the
// universe fresh over time without ever making a user request wait on an
// external fetch.
// -------------------------------------------------------------------------
let backfillTimer = null;
let backfillRunning = false;

async function backfillStaleCandles(batchSize = 20) {
  if (backfillRunning) return;
  backfillRunning = true;
  try {
    const provider = getMarketDataProvider();
    const universe = await prisma.scanUniverse.findMany({
      where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
      orderBy: { priority: 'asc' },
      take: config.maxScanSymbols,
      select: { symbol: true, exchange: true },
    });
    const staleAfterMs = config.externalMarketData.staleAfterMs;
    const freshnessRows = await prisma.marketCandle.groupBy({
      by: ['symbol'],
      where: { symbol: { in: universe.map((u) => u.symbol) }, timeframe: '1d' },
      _max: { ts: true },
      _count: { _all: true },
    });
    const freshBySymbol = new Map(freshnessRows.map((r) => [r.symbol, r]));
    const now = Date.now();
    const stale = universe.filter((u) => {
      const r = freshBySymbol.get(u.symbol);
      return !r || r._count._all < 30 || now - new Date(r._max.ts).getTime() > staleAfterMs;
    });
    if (!stale.length) return;
    const batch = stale.slice(0, batchSize);
    await mapLimit(batch, 3, (entry) => provider.getCandles(entry.symbol, '1d', 60, entry.exchange));
    logInfra('debug', 'radar', `Candle backfill: refreshed ${batch.length}/${stale.length} stale symbols`);
  } catch (err) {
    logInfra('error', 'radar', `Candle backfill failed: ${err.message}`);
  } finally {
    backfillRunning = false;
  }
}

/** Starts the background candle-backfill loop. Safe to call multiple times — only one timer runs. */
export function startCandleBackfillLoop(intervalMs = 20000) {
  if (backfillTimer) return backfillTimer;
  backfillStaleCandles();
  backfillTimer = setInterval(() => backfillStaleCandles(), intervalMs);
  if (typeof backfillTimer.unref === 'function') backfillTimer.unref();
  return backfillTimer;
}

/**
 * Falls back to the most recent persisted scan group when the in-memory
 * snapshot was lost (e.g. server restart). Keeps the radar page populated.
 */
export async function getLatestScanFromDb(limit = 0) {
  const latestRow = await prisma.radarOpportunity.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { scanId: true, regime: true, createdAt: true },
  });
  if (!latestRow) return null;
  const where = { scanId: latestRow.scanId };
  const opps = await prisma.radarOpportunity.findMany({
    where,
    orderBy: { convictionScore: 'desc' },
    ...(limit > 0 ? { take: limit } : {}),
  });
  return {
    scanId: latestRow.scanId,
    regime: latestRow.regime,
    breadth: null,
    lastScannedAt: latestRow.createdAt.toISOString(),
    fromDb: true,
    opportunities: opps.map((o) => ({
      symbol: o.symbol,
      exchange: o.exchange,
      price: o.price == null ? null : round2(Number(o.price)),
      signal: o.signal,
      regime: o.regime,
      convictionScore: o.convictionScore,
      explanation: o.explanation,
      dataSource: o.dataSource,
    })),
  };
}

function isMarketOpen() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const t = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return t >= 9 * 60 + 15 && t <= 15 * 60 + 30;
}

/** Starts the live-radar loop: recomputes scores continuously (all symbols, no limits). */
export function startRadarScheduler(intervalMs = 60000) {
  if (schedulerTimer) return schedulerTimer;
  const run = async () => {
    if (schedulerRunning) return;
    // A full-universe scan (thousands of symbols) is expensive against a
    // rate-sensitive external source — only run it while NSE is actually
    // open, not continuously 24/7.
    if (!isMarketOpen()) return;
    schedulerRunning = true;
    try {
      await runLiveScan(0);
      logInfra('debug', 'radar', 'Live scan refreshed');
    } catch (err) {
      logInfra('error', 'radar', `Live scan failed: ${err.message}`);
    } finally {
      schedulerRunning = false;
    }
  };
  run();
  schedulerTimer = setInterval(run, intervalMs);
  if (typeof schedulerTimer.unref === 'function') schedulerTimer.unref();
  return schedulerTimer;
}

export async function listSignals({ userId, page = 1, limit = 20, signal, symbol }) {
  const where = userId != null ? { userId } : {};
  if (signal) where.signal = signal;
  if (symbol) where.symbol = { contains: symbol.toUpperCase() };
  const [total, rows] = await Promise.all([
    prisma.scanSignal.count({ where }),
    prisma.scanSignal.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return {
    rows: rows.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      exchange: s.exchange,
      timestamp: s.timestamp,
      signal: s.signal,
      regime: s.regime,
      convictionScore: s.convictionScore,
      features: s.features,
      reason: s.reason,
      dataSource: s.dataSource,
    })),
    total,
  };
}

export async function listOpportunities({ page = 1, limit = 20, signal, symbol }) {
  const where = {};
  if (signal) where.signal = signal;
  if (symbol) where.symbol = { contains: symbol.toUpperCase() };
  const [total, rows] = await Promise.all([
    prisma.radarOpportunity.count({ where }),
    prisma.radarOpportunity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      distinct: ['symbol'],
    }),
  ]);
  return {
    rows: rows.map((o) => ({
      id: o.id,
      scanId: o.scanId,
      symbol: o.symbol,
      exchange: o.exchange,
      price: Number(o.price),
      signal: o.signal,
      regime: o.regime,
      convictionScore: o.convictionScore,
      explanation: o.explanation,
      dataSource: o.dataSource,
      createdAt: o.createdAt,
    })),
    total,
  };
}

export async function getDeepDive(symbol) {
  const provider = getMarketDataProvider();
  const [candles, volatility, quote, indexReturn20] = await Promise.all([
    provider.getCandles(symbol, '1d', 60, 'NSE'),
    provider.getVolatility(symbol, 'NSE'),
    provider.getQuote(symbol, 'NSE').catch(() => null),
    getIndexReturn20(provider),
  ]);
  if (!candles.length) return null;
  const breadth = await provider.getMarketBreadth();
  const features = computeFeatures(candles, {
    indexReturn20,
    breadthPct: breadth.breadthPctAboveSma50,
    livePrice: quote?.lastPrice ?? null,
  });
  if (!features) return null;
  const regime = computeRegime({
    breadthPctAboveSma50: breadth.breadthPctAboveSma50,
    indexAboveSma50: null,
  });
  const conviction = computeConviction(features);
  const signal = generateSignal({ conviction, regime, features });
  const dive = deepDive(candles, features, { regime });
  return {
    symbol,
    lastPrice: round2(features.lastPrice),
    signal,
    regime,
    convictionScore: conviction,
    reason: buildReason(features, regime, conviction),
    features,
    deepDive: dive,
    volatility,
    dataSource: provider.dataSource,
  };
}

export async function topOpportunities(limit = 5) {
  return prisma.radarOpportunity.findMany({
    orderBy: [{ createdAt: 'desc' }, { convictionScore: 'desc' }],
    distinct: ['symbol'],
    take: limit,
  });
}

export { sma };