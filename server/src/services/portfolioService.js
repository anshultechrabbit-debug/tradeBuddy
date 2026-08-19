import { prisma } from '../config/prisma.js';
import { round2, clamp } from '../utils/helpers.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { sync } from './brokerService.js';

export async function syncPortfolio(userId, broker, opts = {}) {
  const result = await sync(userId, broker, opts);
  await computeSnapshot(userId);
  return result;
}

/**
 * Diversification score (0-100), deterministic and explainable:
 *
 *   w_i = holding weight (current value share)
 *   s_j = sector weight (current value share)
 *   HHI_holdings = Σ w_i²   (1 = single stock, 0 = infinitely many)
 *   HHI_sector   = Σ s_j²
 *   score = 100 · (1 − sqrt((HHI_holdings + HHI_sector) / 2))
 *
 * Single holding of a single sector → HHI both 1 → score 0.
 * Many small, well-spread holdings → score approaches 100.
 */
export function computeDiversification(holdings) {
  const withValue = holdings.filter((h) => Number(h.currentValue) > 0);
  const total = withValue.reduce((a, h) => a + Number(h.currentValue), 0);
  if (!withValue.length || total <= 0) return 0;

  const sectorWeights = new Map();
  let hhiHoldings = 0;
  for (const h of withValue) {
    const w = Number(h.currentValue) / total;
    hhiHoldings += w * w;
    const sector = h.sector || 'Unknown';
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + w);
  }
  let hhiSector = 0;
  for (const w of sectorWeights.values()) hhiSector += w * w;

  const avgHhi = (hhiHoldings + hhiSector) / 2;
  return Math.round(clamp(100 * (1 - Math.sqrt(avgHhi)), 0, 100));
}

export function computeConcentration(holdings) {
  const total = holdings.reduce((a, h) => a + Number(h.currentValue ?? 0), 0);
  if (total <= 0) return { risks: [], warnings: [] };

  const risks = [];
  const warnings = [];
  const sectorMap = new Map();

  for (const h of holdings) {
    const value = Number(h.currentValue ?? 0);
    const weight = (value / total) * 100;
    if (weight >= 25) {
      risks.push({
        type: 'SINGLE_STOCK',
        symbol: h.symbol,
        weightPct: round2(weight),
        message: `${h.symbol} makes up ${round2(weight)}% of the portfolio (limit 25%)`,
      });
    } else if (weight >= 20) {
      warnings.push({
        type: 'SINGLE_STOCK',
        symbol: h.symbol,
        weightPct: round2(weight),
        message: `${h.symbol} is approaching the 25% single-stock limit`,
      });
    }
    const sector = h.sector || 'Unknown';
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + value);
  }

  for (const [sector, value] of sectorMap) {
    const weight = (value / total) * 100;
    if (weight >= 40) {
      risks.push({
        type: 'SECTOR',
        sector,
        weightPct: round2(weight),
        message: `${sector} sector makes up ${round2(weight)}% of the portfolio (limit 40%)`,
      });
    } else if (weight >= 30) {
      warnings.push({
        type: 'SECTOR',
        sector,
        weightPct: round2(weight),
        message: `${sector} sector is approaching the 40% sector limit`,
      });
    }
  }

  return { risks, warnings };
}

export async function getPortfolioSummary(userId) {
  const holdings = await prisma.portfolioHolding.findMany({
    where: { userId },
    include: { instrument: { select: { sector: true, name: true } } },
  });
  const withSector = holdings.map((h) => ({
    ...h,
    sector: h.instrument?.sector ?? null,
    instrumentName: h.instrument?.name ?? null,
  }));

  const invested = round2(withSector.reduce((a, h) => a + Number(h.costValue ?? 0), 0));
  const current = round2(withSector.reduce((a, h) => a + Number(h.currentValue ?? 0), 0));
  const totalPnl = round2(current - invested);
  const pnlPct = invested > 0 ? round2((totalPnl / invested) * 100) : 0;

  const diversification = computeDiversification(withSector);
  const concentration = computeConcentration(withSector);

  return {
    invested,
    currentValue: current,
    totalPnl,
    pnlPct,
    holdingsCount: withSector.length,
    diversificationScore: diversification,
    concentrationRisk: concentration,
    dataSource: 'development',
  };
}

export async function getHoldings(userId) {
  const rows = await prisma.portfolioHolding.findMany({
    where: { userId },
    include: { instrument: { select: { sector: true, name: true } } },
    orderBy: { currentValue: 'desc' },
  });
  return rows.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    exchange: h.exchange,
    sector: h.instrument?.sector ?? null,
    instrumentName: h.instrument?.name ?? null,
    quantity: h.quantity,
    averagePrice: Number(h.averagePrice),
    currentPrice: Number(h.currentPrice),
    costValue: Number(h.costValue),
    currentValue: Number(h.currentValue),
    pnl: Number(h.pnl),
    pnlPct: Number(h.pnlPct),
    source: h.source,
    syncedAt: h.syncedAt,
  }));
}

export async function getSectorExposure(userId) {
  const holdings = await getHoldings(userId);
  const total = holdings.reduce((a, h) => a + h.currentValue, 0);
  const map = new Map();
  for (const h of holdings) {
    const key = h.sector || 'Unknown';
    map.set(key, (map.get(key) ?? 0) + h.currentValue);
  }
  return [...map.entries()].map(([sector, value]) => ({
    sector,
    value: round2(value),
    weightPct: total > 0 ? round2((value / total) * 100) : 0,
  }));
}

export async function getPositions(userId) {
  return prisma.portfolioPosition.findMany({
    where: { userId },
    orderBy: { symbol: 'asc' },
  });
}

export async function getFunds(userId, broker) {
  const conn = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId, broker } },
  });
  if (!conn || conn.status !== 'CONNECTED') {
    throw new BadRequestError('No connected broker', 'BROKER_NOT_CONNECTED');
  }
  const { getBrokerProvider } = await import('../providers/broker/index.js');
  const funds = await getBrokerProvider().getFunds({ seedKey: String(userId) });
  return funds;
}

export async function computeSnapshot(userId) {
  const summary = await getPortfolioSummary(userId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.portfolioSnapshot.upsert({
    where: { userId_snapshotDate: { userId, snapshotDate: today } },
    create: {
      userId,
      snapshotDate: today,
      investedValue: summary.invested,
      currentValue: summary.currentValue,
      totalPnl: summary.totalPnl,
      pnlPct: summary.pnlPct,
      holdingsCount: summary.holdingsCount,
    },
    update: {
      investedValue: summary.invested,
      currentValue: summary.currentValue,
      totalPnl: summary.totalPnl,
      pnlPct: summary.pnlPct,
      holdingsCount: summary.holdingsCount,
    },
  });
}

export async function getSnapshots(userId, { limit = 30 } = {}) {
  return prisma.portfolioSnapshot.findMany({
    where: { userId },
    orderBy: { snapshotDate: 'desc' },
    take: limit,
  });
}

export async function getPortfolioOrThrow(userId) {
  const summary = await getPortfolioSummary(userId);
  if (!summary.holdingsCount) {
    throw new NotFoundError('No portfolio data. Connect a broker and give consent to sync holdings.');
  }
  return summary;
}