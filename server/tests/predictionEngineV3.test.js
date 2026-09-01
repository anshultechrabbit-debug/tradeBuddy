import { describe, expect, it } from 'vitest';
import { calculateContextForecastTilt, generateEnginePredictionV3 } from '../src/services/predictionEngineV3.js';

function candlesFrom(closes) {
  return closes.map((close, i) => ({
    date: new Date(2026, 0, i + 1), open: close - 0.5, high: close + 1,
    low: close - 1, close, volume: 100_000 + i * 100,
  }));
}

describe('Prediction Engine V3 context factors', () => {
  it('keeps missing context UNKNOWN and applies no artificial neutral score', () => {
    const result = calculateContextForecastTilt(null, { atrPct: 2 });
    expect(result.movePct).toBe(0);
    expect(result.technicalShare).toBe(1);
    expect(result.weightedScore).toBeNull();
    expect(result.missingFactors).toHaveLength(5);
  });

  it('treats explicit null context as UNKNOWN rather than a bearish zero', () => {
    const result = calculateContextForecastTilt({ news: null, earnings: null }, { atrPct: 2 });
    expect(result.availableFactors).toHaveLength(0);
    expect(result.movePct).toBe(0);
  });

  it('positive context raises and negative context lowers the point forecast', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.08);
    const candles = candlesFrom(closes);
    const positive = { news: 90, fundamentals: 85, earnings: 80, valuation: 75, financialStatements: 85 };
    const negative = { news: 10, fundamentals: 15, earnings: 20, valuation: 25, financialStatements: 15 };
    const pos = generateEnginePredictionV3(closes.at(-1), closes, candles, null, undefined, positive);
    const neg = generateEnginePredictionV3(closes.at(-1), closes, candles, null, undefined, negative);
    expect(pos.baseTarget).toBeGreaterThan(neg.baseTarget);
    expect(pos.contextForecast.availableFactors).toHaveLength(5);
    expect(pos.forecastWeights.technical).toBe(65);
  });

  it('renormalises over only the context factors that are actually available', () => {
    const result = calculateContextForecastTilt({ news: 80 }, { atrPct: 2 });
    expect(result.weightedScore).toBe(80);
    expect(result.availableFactors.map((x) => x.key)).toEqual(['news']);
    expect(result.missingFactors).toContain('fundamentals');
  });
});
