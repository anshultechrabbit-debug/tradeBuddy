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
import { analyzeStock } from './stockAnalysisService.js';

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

async function getIndexReturn20FromCache() {
  const rows = await prisma.marketCandle.findMany({
    where: { symbol: 'NIFTY', exchange: 'NSE', timeframe: '1d' },
    orderBy: { ts: 'desc' },
    take: 30,
  });
  if (rows.length < 21) return null;
  const closes = rows.reverse().map((r) => Number(r.close));
  return (closes[closes.length - 1] / closes[closes.length - 21] - 1) * 100;
}

async function getIndexAboveSma50FromCache() {
  const rows = await prisma.marketCandle.findMany({
    where: { symbol: 'NIFTY', exchange: 'NSE', timeframe: '1d' },
    orderBy: { ts: 'desc' },
    take: 60,
  });
  if (rows.length < 50) return null;
  const closes = rows.reverse().map((r) => Number(r.close));
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  return closes[closes.length - 1] > sma50;
}

async function computeBreadthFromCache(symbols) {
  if (!symbols.length) {
    return {
      advancing: 0,
      declining: 0,
      unchanged: 0,
      total: 0,
      covered: 0,
      breadthPctAboveSma20: 0,
      breadthPctAboveSma50: 50,
      averageChangePct: 0,
    };
  }
  const rows = await prisma.marketCandle.findMany({
    where: { symbol: { in: symbols }, exchange: 'NSE', timeframe: '1d' },
    orderBy: { ts: 'asc' },
  });
  const bySymbol = new Map();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }

  let aboveSma20 = 0;
  let aboveSma50 = 0;
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let sumChangePct = 0;
  let covered = 0;

  for (const candles of bySymbol.values()) {
    if (candles.length < 21) continue;
    covered += 1;
    const closes = candles.map((c) => Number(c.close));
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
    covered,
    breadthPctAboveSma20: total ? round2((aboveSma20 / total) * 100) : 0,
    breadthPctAboveSma50: total ? round2((aboveSma50 / total) * 100) : 50,
    averageChangePct: total ? round2(sumChangePct / total) : 0,
  };
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
async function computeScan({ userId = null, limit = 15, useCachedOnly = true }) {
  const provider = getMarketDataProvider();
  const scanId = `scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const universe = await prisma.scanUniverse.findMany({
    where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
    include: { instrument: true },
    orderBy: { priority: 'asc' },
    take: config.maxScanSymbols,
  });

  let breadth, indexReturn20, indexAboveSma50;

  if (useCachedOnly) {
    const [cachedBreadth, cachedIndexReturn20, cachedIndexAboveSma50] = await Promise.all([
      computeBreadthFromCache(universe.map((u) => u.symbol)),
      getIndexReturn20FromCache(),
      getIndexAboveSma50FromCache(),
    ]);
    breadth = cachedBreadth;
    indexReturn20 = cachedIndexReturn20;
    indexAboveSma50 = cachedIndexAboveSma50;
  } else {
    const [fetchedBreadth, fetchedIndexReturn20, fetchedIndexAboveSma50] = await Promise.all([
      provider.getMarketBreadth(),
      getIndexReturn20(provider),
      getIndexAboveSma50(provider),
    ]);
    breadth = fetchedBreadth;
    indexReturn20 = fetchedIndexReturn20;
    indexAboveSma50 = fetchedIndexAboveSma50;
  }

  const regime = computeRegime({
    breadthPctAboveSma50: breadth?.breadthPctAboveSma50 ?? 50,
    indexAboveSma50,
  });

  const breadthPct = breadth?.breadthPctAboveSma50 ?? 50;

  // A manual scan is a snapshot calculation over data already stored in
  // Postgres. It never fetches missing/stale history inline. The independent
  // backfill loop may improve the stored dataset for the next scan.
  const freshnessRows = await prisma.marketCandle.groupBy({
    by: ['symbol'],
    where: { symbol: { in: universe.map((u) => u.symbol) }, timeframe: '1d' },
    _max: { ts: true },
    _count: { _all: true },
  });
  const freshBySymbol = new Map(freshnessRows.map((r) => [r.symbol, r]));
  const hasEnoughData = (symbol) => {
    const r = freshBySymbol.get(symbol);
    return !!r && r._count._all >= 30;
  };

  const universeToScan = [];
  const failures = [];
  for (const entry of universe) {
    if (hasEnoughData(entry.symbol)) universeToScan.push(entry);
    else failures.push(entry.symbol);
  }

  // Read the snapshot directly instead of calling provider.getCandles(),
  // which is allowed to refresh stale data from an external source.
  const candlesList = await mapLimit(universeToScan, 20, async (entry) => {
    const rows = await prisma.marketCandle.findMany({
      where: { symbol: entry.symbol, exchange: entry.exchange, timeframe: '1d' },
      orderBy: { ts: 'desc' },
      take: 60,
    });
    return rows.reverse().map((row) => ({
      ...row,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));
  });

  // Phase 1 scores every usable symbol from cached candle closes.
  function scoreEntry(entry, candles, livePrice) {
    if (!candles || candles.length < 30) return null;
    const features = computeFeatures(candles, { indexReturn20, breadthPct, livePrice });
    if (!features) return null;
    // Per-stock price direction, separate from the one global Nifty market
    // regime. Use the same BULLISH/NEUTRAL/BEARISH language as AI Strategy,
    // based only on directional technical categories that are actually known.
    const directionalParts = [
      [features.subscores.trend, 0.5],
      [features.subscores.momentum, 0.35],
      [features.subscores.relativeStrength, 0.15],
    ].filter(([value]) => value != null);
    const directionalWeight = directionalParts.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    const directionalScore = directionalParts.reduce(
      (sum, [value, weight]) => sum + Number(value) * weight,
      0,
    ) / directionalWeight;
    features.directionalScore = round2(directionalScore);
    features.directionalOutlook = directionalScore >= 65
      ? 'BULLISH'
      : directionalScore <= 35
        ? 'BEARISH'
        : 'NEUTRAL';
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

  // Phase 2 applies the latest quotes already persisted in Postgres. Clicking
  // Run Scan therefore never makes a market API call midway through scoring.
  const CANDIDATE_POOL = Math.min(scanned.length, limit > 0 ? Math.max(limit * 8, 100) : 150);
  const candidates = scanned.slice(0, CANDIDATE_POOL);
  if (candidates.length) {
    const quoteRows = await prisma.marketQuote.findMany({
      where: { symbol: { in: candidates.map((c) => c.symbol) }, exchange: 'NSE' },
      orderBy: { timestamp: 'desc' },
      select: { symbol: true, lastPrice: true },
    });
    const latestQuotes = new Map();
    for (const quote of quoteRows) {
      if (!latestQuotes.has(quote.symbol)) latestQuotes.set(quote.symbol, quote);
    }
    for (let i = 0; i < candidates.length; i += 1) {
      const q = latestQuotes.get(candidates[i].symbol);
      const livePrice = q && Number(q.lastPrice) > 0 ? q.lastPrice : null;
      if (livePrice == null) continue;
      const entry = { instrumentId: candidates[i].instrumentId, symbol: candidates[i].symbol, exchange: candidates[i].exchange, priority: candidates[i].priority };
      const rescored = scoreEntry(entry, candidates[i].candles, livePrice);
      if (rescored) candidates[i] = rescored;
    }
    scanned.splice(0, CANDIDATE_POOL, ...candidates);
    scanned.sort((a, b) => b.convictionScore - a.convictionScore);
  }

  // A technical screen may nominate a BUY, but only the full AI prediction
  // engine is allowed to publish an actionable BUY. It applies the additional
  // risk/reward, higher-timeframe, evidence-quality, freshness and trade-plan
  // gates used by the AI Strategy page. This prevents contradictions such as
  // Radar BUY while AI Strategy says WATCH/WAIT for the same stock.
  const radarBuys = scanned.filter((s) => s.signal === 'BUY');
  const aiChecks = await mapLimit(radarBuys, 4, (entry) =>
    analyzeStock(entry.symbol).catch(() => null),
  );
  for (let i = 0; i < radarBuys.length; i += 1) {
    const entry = radarBuys[i];
    const analysis = aiChecks[i];
    const valid = analysis?.ok && analysis.finalValidation?.passed;
    const aiSignal = valid ? analysis.finalSignal : null;
    const actionable = aiSignal === 'BUY' || aiSignal === 'STRONG BUY';
    entry.signal = actionable ? 'BUY' : aiSignal === 'AVOID' ? 'AVOID' : 'WATCH';
    if (valid) {
      entry.convictionScore = Number(analysis.overallScore ?? entry.convictionScore);
      entry.features = {
        ...entry.features,
        aiStrategy: {
          signal: aiSignal,
          directionalOutlook: analysis.engine?.directionalOutlook ?? 'NEUTRAL',
          tradeStatus: analysis.engine?.tradeStatus ?? 'WAIT',
          score: analysis.overallScore,
        },
      };
      entry.reason = `AI Strategy: ${analysis.oneLiner}`;
    } else {
      entry.reason = `${entry.reason}; AI Strategy validation unavailable, so BUY was downgraded to WATCH`;
    }
  }
  scanned.sort((a, b) => b.convictionScore - a.convictionScore);

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
      aiSignal: s.features?.aiStrategy?.signal ?? null,
      directionalOutlook: s.features?.aiStrategy?.directionalOutlook ?? s.features?.directionalOutlook ?? null,
      tradeStatus: s.features?.aiStrategy?.tradeStatus ?? null,
      dataSource: provider.dataSource,
    })),
  };
}

/**
 * Full scan (on demand). Persists signals + opportunities + audit, and also
 * refreshes the in-memory "latest" result used by the live polling endpoint.
 */
export async function runScan({ userId = null, limit = 15, persist = true, useCachedOnly = true } = {}) {
  const { scanId, provider, regime, breadth, breadthPct, scanned, top, failures } =
    await computeScan({ userId, limit, useCachedOnly });

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
    const writes = [
      prisma.scanSignal.deleteMany({ where: { userId } }),
      prisma.radarOpportunity.deleteMany({ where: { userId } }),
      prisma.scanSignal.createMany({ data: signalsData }),
    ];
    if (oppData.length) writes.push(prisma.radarOpportunity.createMany({ data: oppData }));
    // Automatic scans replace the user's prior snapshot atomically. This
    // keeps every Radar section aligned and prevents unbounded row growth.
    await prisma.$transaction(writes);

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
  const { scanId, provider, regime, breadth, top } = await computeScan({ userId: null, limit, useCachedOnly: true });
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

async function backfillStaleCandles(batchSize = 150) {
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

/**
 * Starts the background candle-backfill loop. Safe to call multiple times —
 * only one timer runs. batchSize/intervalMs were tuned up from an earlier,
 * much slower pass (20 symbols/20s) that left hundreds of universe symbols
 * without any signal for a long stretch after each restart — computeScan
 * only scores symbols that are already fresh, so incomplete backfill showed
 * up to users as "signals don't generate for everything" and a set of
 * opportunities that kept changing scan to scan as coverage slowly shifted.
 * The `backfillRunning` guard means a short interval just lets the next
 * batch start the moment the previous one finishes — it does not raise peak
 * concurrent NSE load, which stays capped by mapLimit's concurrency (3) and
 * the shared Python-process semaphore regardless of batch size.
 */
export function startCandleBackfillLoop(intervalMs = 5000) {
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
      orderBy: [{ timestamp: 'desc' }, { convictionScore: 'desc' }],
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
      aiSignal: s.features?.aiStrategy?.signal ?? null,
      directionalOutlook: s.features?.aiStrategy?.directionalOutlook ?? s.features?.directionalOutlook ?? null,
      tradeStatus: s.features?.aiStrategy?.tradeStatus ?? null,
      dataSource: s.dataSource,
    })),
    total,
  };
}

export async function listOpportunities({ userId, page = 1, limit = 20, signal, symbol }) {
  const latest = await prisma.radarOpportunity.findFirst({
    where: userId != null ? { userId } : {},
    orderBy: { createdAt: 'desc' },
    select: { scanId: true },
  });
  if (!latest) return { rows: [], total: 0 };

  const where = { scanId: latest.scanId };
  if (userId != null) where.userId = userId;
  if (signal) where.signal = signal;
  if (symbol) where.symbol = { contains: symbol.toUpperCase() };
  const [total, rows] = await Promise.all([
    prisma.radarOpportunity.count({ where }),
    prisma.radarOpportunity.findMany({
      where,
      orderBy: { convictionScore: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
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
  const latest = await prisma.radarOpportunity.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { scanId: true },
  });
  if (!latest) return [];
  return prisma.radarOpportunity.findMany({
    where: { scanId: latest.scanId },
    orderBy: { convictionScore: 'desc' },
    take: limit,
  });
}

export { sma };
