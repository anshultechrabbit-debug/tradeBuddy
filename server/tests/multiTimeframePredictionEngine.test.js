import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildMultiTimeframePredictions } from '../src/services/multiTimeframePredictionEngine.js';

function analysis(overrides = {}) {
  return {
    price: 100,
    dataTimestamp: '2026-09-02T05:00:00.000Z',
    quote: { stale: false },
    scores: { fundamentals: 82, valuation: 74, news: 70, market: 72, risk: 70 },
    news: { available: true }, valuation: { available: true },
    fundamentals: { available: true, revenueGrowth: 20, earningsGrowth: 24, roe: 22, roic: 18, profitMargin: 16, debtToEquity: 0.3, currentRatio: 1.8, freeCashflow: 1 },
    technical: { trend: 'Bullish', sma200: 80, roc5: 3, roc20: 8, atrPct: 2 },
    market: { available: true, relativeStrength: 5 },
    engine: { signal: 'BUY', totalScore: 76, evidenceQualityScore: 80, dataStatus: 'VERIFIED DELAYED', predictionHorizon: 'CURRENT_SESSION_CLOSE', closingRange: { base: 101, range: [98, 103], expectedMovePct: 1 }, gates: {}, buy: { riskReward: 2.5, stopLoss: 96 } },
    intradayPrediction: null, positiveFactors: ['Trend supportive'], negativeFactors: [], disclaimer: 'Not guaranteed.',
    ...overrides,
  };
}

test('builds five explicitly separated horizons', () => {
  const result = buildMultiTimeframePredictions(analysis());
  assert.deepEqual(result.horizons.map((item) => item.key), ['INTRADAY', 'SHORT_TERM', 'SWING', 'MEDIUM_TERM', 'LONG_TERM']);
  assert.equal(result.current.key, 'INTRADAY');
  assert.match(result.separationRule, /independently/i);
});

test('long-term model prioritizes fundamental categories and requires six confirmations', () => {
  const result = buildMultiTimeframePredictions(analysis());
  const longTerm = result.horizons.find((item) => item.key === 'LONG_TERM');
  assert.equal(longTerm.requiredConfirmations, 6);
  assert.ok(longTerm.confirmationConditions.some((item) => item.name === 'Business quality'));
  assert.match(longTerm.thresholdStatus, /PROVISIONAL/);
});

test('missing fundamentals stay unavailable and block long-term BUY', () => {
  const input = analysis({
    fundamentals: { available: false },
    scores: { fundamentals: null, valuation: null, news: 70, market: 72, risk: 70 },
    valuation: { available: false },
  });
  const longTerm = buildMultiTimeframePredictions(input).horizons.find((item) => item.key === 'LONG_TERM');
  assert.equal(longTerm.gates.fundamentalEvidence, false);
  assert.doesNotMatch(longTerm.signal, /BUY$/);
  const businessQuality = longTerm.confirmationConditions.find((item) => item.name === 'Business quality');
  assert.equal(businessQuality.available, false);
  assert.equal(businessQuality.passed, null);
});

test('uses one generated timestamp without future information', () => {
  const timestamp = '2026-09-02T05:00:00.000Z';
  const result = buildMultiTimeframePredictions(analysis(), timestamp);
  assert.ok(result.horizons.every((item) => item.generatedAt === timestamp && item.lastUpdatedAt === timestamp));
});

test('uses only the final checkpoint snapshot after close and does not mix next-session fields', () => {
  const input = analysis({
    engine: {
      ...analysis().engine,
      predictionHorizon: 'NEXT_SESSION_CLOSE',
      closingRange: {
        base: 98.5, range: [97, 101], expectedMovePct: -1.5,
        rawPredictedClose: 98, rawExpectedMovePct: -2,
        validatedDirection: 'BEARISH', forecastQuality: 'VALIDATED',
      },
    },
    intradayPrediction: {
      current: null,
      latest: { signal: 'AVOID', score: 18, confidence: 71, predictedClose: 105, expectedReturnPct: 5, expectedDirection: 'BULLISH', targetZone: [99, 108] },
    },
  });
  const current = buildMultiTimeframePredictions(input).current;
  assert.equal(current.expectedPrice, 105);
  assert.equal(current.rawExpectedPrice, 105);
  assert.equal(current.expectedReturnPct, 5);
  assert.equal(current.validatedDirection, 'BULLISH');
});
