import { prisma } from '../config/prisma.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { getDeepDive } from './radarService.js';

const RECOMMENDATIONS = ['BUY', 'WATCH', 'AVOID'];

function guidance(recommendation) {
  switch (recommendation) {
    case 'BUY':
      return 'Conviction is strong and aligned with the current regime. Radar supports building a position.';
    case 'WATCH':
      return 'Signal is developing. Monitor for confirmation before acting.';
    case 'AVOID':
      return 'Weak conviction or unfavourable regime. No action is supported by the radar.';
    default:
      return '';
  }
}

/**
 * AI Strategy Router (deterministic when no LLM provider is configured).
 * Input is Radar/scan_signals only — the router never invents market
 * information. Confidence is derived from the deterministic conviction score.
 */
export async function generateRecommendation(userId, { symbol }) {
  if (!symbol) throw new BadRequestError('symbol is required');

  let signal = await prisma.scanSignal.findFirst({
    where: { userId, symbol },
    orderBy: { timestamp: 'desc' },
  });

  let deepDive = null;
  if (!signal) {
    deepDive = await getDeepDive(symbol);
    if (!deepDive) throw new NotFoundError(`No signal available for ${symbol}`);
  }

  const recommendation = signal ? signal.signal : deepDive.signal;
  const conviction = signal ? signal.convictionScore : deepDive.convictionScore;
  const reason = signal ? signal.reason : deepDive.reason;

  if (!RECOMMENDATIONS.includes(recommendation)) {
    throw new BadRequestError(`Unexpected signal value: ${recommendation}`);
  }

  const confidence = Math.round((conviction / 100) * 100) / 100;

  const supportingSignals = await prisma.scanSignal.findMany({
    where: { symbol },
    orderBy: { timestamp: 'desc' },
    take: 5,
    select: {
      symbol: true, signal: true, convictionScore: true, regime: true, timestamp: true,
    },
  });

  return {
    recommendation,
    confidence,
    convictionScore: conviction,
    reason: `${reason}. ${guidance(recommendation)}`,
    supportingSignals: supportingSignals.map((s) => ({
      symbol: s.symbol,
      signal: s.signal,
      convictionScore: s.convictionScore,
      regime: s.regime,
      timestamp: s.timestamp,
    })),
    source: 'deterministic-radar',
    timestamp: new Date(),
  };
}

export async function recommendTop(userId, { limit = 5 } = {}) {
  const latest = await prisma.radarOpportunity.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!latest) throw new NotFoundError('Run a radar scan first');
  const top = await prisma.radarOpportunity.findMany({
    where: { scanId: latest.scanId },
    orderBy: { convictionScore: 'desc' },
    take: limit,
  });
  return Promise.all(
    top.map(async (o) => ({
      symbol: o.symbol,
      exchange: o.exchange,
      recommendation: o.signal,
      convictionScore: o.convictionScore,
      confidence: Math.round((o.convictionScore / 100) * 100) / 100,
      reason: o.explanation,
      timestamp: o.createdAt,
    })),
  );
}