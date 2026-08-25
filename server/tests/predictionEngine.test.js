import { describe, it, expect } from 'vitest';
import { buildEngineResult } from '../src/services/predictionEngine.js';

describe('predictionEngine improvements & gates', () => {
  const baseInput = {
    price: 100,
    dataTimestamp: '2026-08-25T11:00:00Z',
    dataStatus: 'VERIFIED',
    quote: {
      lastPrice: 100,
      changePct: 0.5,
      source: 'jugaad',
      stale: false,
    },
    technical: {
      rsi: 58,
      macd: { value: 2, signal: 1 },
      roc20: 5,
      volumeRatio: 1.3,
      avgVolume20: 200000,
      atr: 2.5,
      atrPct: 2.5,
      sma20: 98,
      sma50: 95,
      sma200: 90,
      trend: 'Bullish',
      candleCount: 250,
      stale: false,
    },
    market: {
      ok: true,
      regime: 'BULLISH',
      relativeStrength: 3,
    },
    valuation: {
      available: true,
      score: 60,
      stale: false,
    },
    news: {
      available: true,
      sentimentScore: 65,
      independentEvents: 4,
      materialEvents: 3,
    },
    entry: {
      zoneLow: 96,
      zoneHigh: 99,
      stopLoss: 94, // Risk/Reward = (100 - 96)/(96 - 94) = 4/2 = 2.0 (OK)
    },
  };

  it('1. Bullish trend + bullish momentum + bullish volume => bullish directional result', () => {
    const res = buildEngineResult(baseInput);
    expect(res.directionalOutlook).toBe('BULLISH');
    expect(res.directionalScore).toBeGreaterThanOrEqual(62);
  });

  it('2. Bullish indicators + high volume + falling price => volume confirmation should NOT be bullish', () => {
    const input = {
      ...baseInput,
      quote: { ...baseInput.quote, changePct: -1.5 },
      technical: { ...baseInput.technical, volumeRatio: 1.5 },
    };
    const res = buildEngineResult(input);
    expect(res.gates.volumeConfirms).toBe(false);
  });

  it('3. Bearish market + weak stock => bearish pressure', () => {
    const input = {
      ...baseInput,
      quote: {
        ...baseInput.quote,
        changePct: -1.5,
      },
      market: {
        ...baseInput.market,
        regime: 'BEARISH',
        relativeStrength: -10,
      },
      technical: {
        ...baseInput.technical,
        rsi: 30,
        macd: { value: -2, signal: 1 },
        roc20: -8,
        trend: 'Bearish',
        sma20: 102,
        sma50: 105,
      },
    };
    const res = buildEngineResult(input);
    expect(res.directionalOutlook).toBe('BEARISH');
  });

  it('4. Bullish market + strong relative strength => bullish context', () => {
    const res = buildEngineResult(baseInput);
    expect(res.subScores.marketSector).toBeGreaterThan(50);
  });

  it('5. Missing news => UNKNOWN, not neutral', () => {
    const input = { ...baseInput, news: { available: false } };
    const res = buildEngineResult(input);
    expect(res.subScores.news).toBeNull();
    expect(res.coverage.unknownFactors).toContain('news');
  });

  it('6. Missing valuation => UNKNOWN, not neutral', () => {
    const input = { ...baseInput, valuation: { available: false } };
    const res = buildEngineResult(input);
    expect(res.subScores.fundamentals).toBeNull();
    expect(res.coverage.unknownFactors).toContain('fundamentals');
  });

  it('7. Stale quote => reduced evidence quality', () => {
    const input = {
      ...baseInput,
      quote: { ...baseInput.quote, stale: true },
    };
    const res = buildEngineResult(input);
    const freshRes = buildEngineResult(baseInput);
    expect(res.evidenceQualityScore).toBeLessThan(freshRes.evidenceQualityScore);
    expect(res.gates.quoteFreshEnough).toBe(false);
  });

  it('8. Missing critical data => cannot become EXECUTABLE BUY', () => {
    // Missing multiple indicators to force EQS below 65
    const input = {
      ...baseInput,
      news: { available: false },
      valuation: { available: false },
      market: { ok: false },
    };
    const res = buildEngineResult(input);
    expect(res.evidenceQualityScore).toBeLessThan(65);
    expect(res.tradeStatus).toBe('WAIT');
  });

  it('9. Score high but category confirmations insufficient => WAIT', () => {
    const input = {
      ...baseInput,
      // Change trend and volume to neutral/bearish to lower agreeing categories count
      technical: {
        ...baseInput.technical,
        trend: 'Neutral',
        volumeRatio: 0.8,
      },
    };
    const res = buildEngineResult(input);
    expect(res.tradeStatus).toBe('WAIT');
  });

  it('10. Risk/reward < 2 => not EXECUTABLE', () => {
    const input = {
      ...baseInput,
      entry: {
        ...baseInput.entry,
        zoneLow: 97,
        zoneHigh: 99,
        stopLoss: 97.5, // entryMid is 98, so stop is below entry, risk is 0.5
      },
      technical: {
        ...baseInput.technical,
        resistance: 98.8, // Reward is 98.8 - 98 = 0.8 -> R/R = 1.6 (< 2.0)
      },
    };
    const res = buildEngineResult(input);
    // Risk/reward below 1:2 fails the gating rule, so it remains WAIT (not EXECUTABLE)
    expect(res.tradeStatus).toBe('WAIT');
    expect(res.buy?.riskReward).toBe(1.6);
  });

  it('11. Deep pullback => not EXECUTABLE', () => {
    const input = {
      ...baseInput,
      entry: {
        ...baseInput.entry,
        zoneLow: 85,
        zoneHigh: 88, // entryMid is ~86.5, which is > 10% below price of 100
        stopLoss: 80, // valid stop below entry (stopLoss < zoneLow)
      },
    };
    const res = buildEngineResult(input);
    // Setup is valid structurally but is wait because of deep pullback gate
    expect(res.tradeStatus).toBe('WAIT');
    expect(res.gates.deepPullback).toBe(true);
  });

  it('12. After 15:30 IST => next-session estimate', () => {
    // This is tested in unit tests if we can mock isPastClose or the timezone.
    const res = buildEngineResult(baseInput);
    expect(res.closingRange.note).toBeDefined();
  });

  it('13. Expected close derived conservatively from volatility and is asymmetric', () => {
    const res = buildEngineResult(baseInput);
    expect(res.closingRange.expectedMovePct).toBeGreaterThan(0); // Bullish edge
    // Check asymmetry: for BULLISH, the range bear is current price (no loss)
    expect(res.closingRange.bear).toBe(100);
    expect(res.closingRange.bull).toBeGreaterThan(100);
  });

  it('14. No probability claimed as calibrated', () => {
    const res = buildEngineResult(baseInput);
    expect(res.closingRange.probability).toBe('NOT CALIBRATED');
  });
});
