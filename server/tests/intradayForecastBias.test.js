import { describe, expect, it } from 'vitest';
import { buildRegimeAwareForecast, classifyIntradayDirection } from '../src/services/predictionEngine.js';
import { recencyWeightedVwmaClose, vwmaClose } from '../src/services/radar/indicators.js';

const base = {
  price: 100, regressionValue: 103, regressionSlope: 0, historicalAnchor: 105,
  sessionProgress: 0.5, recentTrend: 'Neutral', marketRegime: 'NEUTRAL',
  relativeStrength: 0, buyingPressure: 50, confirmations: 3,
  below50: false, below200: false, atrPct: 2, directionalScore: 50,
};

describe('regime-aware intraday forecast', () => {
  it('prevents a high historical average from flipping a strong bearish regime bullish', () => {
    const forecast = buildRegimeAwareForecast({ ...base, regressionSlope: -1, recentTrend: 'Bearish', marketRegime: 'BEARISH', relativeStrength: -4, buyingPressure: 35, confirmations: 0, below50: true, below200: true });
    expect(forecast.historicalAnchorWeight).toBeLessThanOrEqual(0.02);
    expect(forecast.validatedPredictedClose).toBeLessThanOrEqual(100);
    expect(forecast.validatedDirection).not.toBe('BULLISH');
  });

  it('prevents a lower historical anchor from suppressing a strong bullish regime', () => {
    const forecast = buildRegimeAwareForecast({ ...base, regressionValue: 102, regressionSlope: 1, historicalAnchor: 90, recentTrend: 'Bullish', marketRegime: 'BULLISH', relativeStrength: 4, buyingPressure: 62, confirmations: 6 });
    expect(forecast.validatedPredictedClose).toBeGreaterThanOrEqual(100);
    expect(forecast.validatedDirection).not.toBe('BEARISH');
  });

  it('allows moderate historical influence in a sideways regime', () => {
    const forecast = buildRegimeAwareForecast(base);
    expect(forecast.historicalAnchorWeight).toBeGreaterThan(0.02);
    expect(forecast.historicalAnchorWeight).toBeLessThanOrEqual(0.10);
  });

  it.each([[0.09, 'NEUTRAL'], [0.40, 'BULLISH'], [-0.40, 'BEARISH']])('classifies %s percent as %s', (move, direction) => {
    expect(classifyIntradayDirection(move)).toBe(direction);
  });

  it('never marks 0/7 confirmation as HIGH_SIGNAL', () => {
    const forecast = buildRegimeAwareForecast({ ...base, regressionSlope: -0.5, confirmations: 0 });
    expect(forecast.forecastQuality).not.toBe('HIGH_SIGNAL');
  });

  it('uses true volume weighting and explicit recency weighting, not arithmetic SMA', () => {
    const candles = [{ close: 90, volume: 1000 }, { close: 110, volume: 100 }];
    expect(vwmaClose(candles, 2)).not.toBe(100);
    expect(recencyWeightedVwmaClose(candles, 2, 0.5)).toBeGreaterThan(vwmaClose(candles, 2));
  });

  it('is deterministic from the supplied snapshot and has no wall-clock/future input', () => {
    expect(buildRegimeAwareForecast(base)).toEqual(buildRegimeAwareForecast({ ...base }));
  });
});
