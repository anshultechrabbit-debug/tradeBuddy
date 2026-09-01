import { describe, expect, it } from 'vitest';
import { extractNextCloseFeatures, generateNextClosePrediction, NEXT_CLOSE_CONFIG } from '../src/services/nextClosePredictionModel.js';

function candles(count = 120, drift = 0.15) {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * drift;
    return { ts: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, open: close - 0.1, high: close + 0.6, low: close - 0.7, close, volume: 100_000 + i * 500 };
  });
}

describe('isolated next-close return model', () => {
  it('predicts a bounded return from prediction-time price', () => {
    const bars = candles();
    const result = generateNextClosePrediction({
      currentPrice: bars.at(-1).close,
      candles: bars,
      predictionTimestamp: '2026-09-01T10:00:00+05:30',
      dataTimestamp: '2026-09-01T10:00:00+05:30',
      dataQuality: 'LIVE',
    });
    expect(result.ok).toBe(true);
    expect(result.predictedClose).toBeCloseTo(result.predictionTimePrice * (1 + result.predictedReturn), 1);
    expect(Math.abs(result.predictedReturn)).toBeLessThanOrEqual(result.features.atrPct * NEXT_CLOSE_CONFIG.maxAtrMultiplier);
    expect(result.predictionHorizon).toBe('CURRENT_SESSION_CLOSE');
  });

  it('marks missing news UNKNOWN and renormalises its weight away', () => {
    const bars = candles();
    const result = generateNextClosePrediction({ currentPrice: bars.at(-1).close, candles: bars, news: null });
    expect(result.missingFactors).toContain('news');
    expect(result.missingFactors).toContain('marketSector');
    expect(result.appliedWeight).toBe(75);
    expect(result.groupScores.news).toBeNull();
  });

  it('uses only material news, never a neutral placeholder', () => {
    const bars = candles();
    const unavailable = extractNextCloseFeatures({ currentPrice: bars.at(-1).close, candles: bars, news: { available: true, materialEvents: 0, score: 90 } });
    const material = extractNextCloseFeatures({ currentPrice: bars.at(-1).close, candles: bars, news: { available: true, materialEvents: 2, score: 90 } });
    expect(unavailable.groupSignals.news).toBeNull();
    expect(material.groupSignals.news).toBeGreaterThan(0);
  });

  it('returns empirically calibrated nested intervals', () => {
    const bars = candles();
    const result = generateNextClosePrediction({ currentPrice: bars.at(-1).close, candles: bars });
    expect(result.intervalCalibrationStatus).toBe('EMPIRICALLY_CALIBRATED_OUT_OF_SAMPLE');
    expect(result.intervals.p90.low).toBeLessThan(result.intervals.p50.low);
    expect(result.intervals.p90.high).toBeGreaterThan(result.intervals.p50.high);
  });
});
