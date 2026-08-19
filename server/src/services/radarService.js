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
  if (candles.length < 21) return 0;
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
export async function runScan({ userId = null, limit = 15 } = {}) {
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

  const candlesList = await mapLimit(universe, 15, (entry) =>
    provider.getCandles(entry.symbol, '1d', 60, entry.exchange),
  );

  const liveQuotes = await provider.getQuotes({
    symbols: universe.map((e) => e.symbol),
    exchange: 'NSE',
  });
  const livePriceMap = new Map();
  for (let i = 0; i < universe.length; i += 1) {
    const q = liveQuotes[i];
    if (q && Number(q.lastPrice) > 0) livePriceMap.set(universe[i].symbol, q.lastPrice);
  }

  const scanned = [];
  const failures = [];
  for (let i = 0; i < universe.length; i += 1) {
    const entry = universe[i];
    const candles = candlesList[i];
    if (!candles || candles.length < 30) {
      failures.push(entry.symbol);
      continue;
    }
    const features = computeFeatures(candles, {
      indexReturn20,
      breadthPct,
      livePrice: livePriceMap.get(entry.symbol) ?? null,
    });
    if (!features) {
      failures.push(entry.symbol);
      continue;
    }
    const conviction = computeConviction(features);
    const signal = generateSignal({ conviction, regime, features });
    const reason = buildReason(features, regime, conviction);
    scanned.push({
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
    });
  }

  scanned.sort((a, b) => b.convictionScore - a.convictionScore);

  const top = scanned.slice(0, limit);

  if (userId != null) {
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
  }

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

  return {
    scanId,
    regime,
    breadth,
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

export async function listSignals({ userId, page = 1, limit = 20 }) {
  const where = userId != null ? { userId } : {};
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

export async function listOpportunities({ page = 1, limit = 20 }) {
  const [total, rows] = await Promise.all([
    prisma.radarOpportunity.count(),
    prisma.radarOpportunity.findMany({
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
  const [candles, volatility, quote] = await Promise.all([
    provider.getCandles(symbol, '1d', 60, 'NSE'),
    provider.getVolatility(symbol, 'NSE'),
    provider.getQuote(symbol, 'NSE').catch(() => null),
  ]);
  if (!candles.length) return null;
  const breadth = await provider.getMarketBreadth();
  const features = computeFeatures(candles, {
    indexReturn20: 0,
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