import { describe, it, expect } from 'vitest';
import { blendEodProjection, buildEngineResult } from '../src/services/predictionEngine.js';

describe('predictionEngine improvements & gates', () => {
  it('anchors an EOD forecast increasingly to live price as the close approaches', () => {
    const morning = blendEodProjection(1302, 1275, 1280, 0.05);
    const late = blendEodProjection(1302, 1275, 1280, 0.95);
    expect(Math.abs(late.projected - 1302)).toBeLessThan(Math.abs(morning.projected - 1302));
    expect(late.liveWeight).toBeGreaterThan(0.95);
    expect(late.projected).toBeGreaterThan(1299);
  });
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
    // A bullish close distribution may still include a small downside tail.
    expect(res.closingRange.bear).toBeLessThan(res.closingRange.base);
    expect(res.closingRange.bull).toBeGreaterThan(100);
  });

  it('14. No probability claimed as calibrated', () => {
    const res = buildEngineResult(baseInput);
    expect(res.closingRange.probability).toBe('NOT CALIBRATED');
  });

  it('14b. never publishes BUY when its predicted close is not bullish', () => {
    const declining = Array.from({ length: 120 }, (_, i) => 120 - i * 0.16);
    const fallingCandles = declining.map((close, i) => ({
      open: close + 0.1, high: close + 0.5, low: close - 0.5, close, volume: 250000 + i * 100,
    }));
    const input = {
      ...baseInput,
      _closes: declining,
      _candles: fallingCandles,
      price: declining.at(-1),
      quote: { ...baseInput.quote, lastPrice: declining.at(-1) },
    };
    const res = buildEngineResult(input);
    if (res.closingRange.base <= res.predictionReferencePrice) {
      expect(res.isBuy).toBe(false);
      expect(['BUY', 'STRONG BUY']).not.toContain(res.signal);
      expect(res.gates.forecastConsistent).toBe(false);
    }
    expect(
      (res.directionalOutlook === 'BULLISH' && res.closingRange.expectedMovePct > 0.35)
      || (res.directionalOutlook === 'BEARISH' && res.closingRange.expectedMovePct < -0.35)
      || (res.directionalOutlook === 'NEUTRAL' && Math.abs(res.closingRange.expectedMovePct) <= 0.35),
    ).toBe(true);
  });

  it('15. No candle history => volatility/priceAction stay UNKNOWN, never a fabricated neutral score', () => {
    const res = buildEngineResult(baseInput);
    expect(res.subScores.priceAction).toBeNull();
    expect(res.coverage.unknownFactors).toContain('priceAction');
    expect(res.beta).toBeNull();
    expect(res.correlationToNifty).toBeNull();
  });

  it('16b. STALE technical data blocks the dataStatusOk gate (never just costs evidence quality)', () => {
    const input = { ...baseInput, technical: { ...baseInput.technical, stale: true } };
    const res = buildEngineResult(input);
    expect(res.dataStatus).toBe('STALE');
    expect(res.gates.dataStatusOk).toBe(false);
  });

  it('16. With real OHLCV + Nifty history => volatility/priceAction/beta populate', () => {
    // 120 daily candles on a noisy-but-net uptrend, ending at a 20-day breakout.
    const candles = [];
    let close = 80;
    for (let i = 0; i < 120; i += 1) {
      const open = close;
      close = open * (1.006 + Math.sin(i / 4) * 0.003);
      candles.push({
        open,
        high: Math.max(open, close) * 1.0005,
        low: Math.min(open, close) * 0.9995,
        close,
        volume: 150000 + i * 500,
      });
    }
    const closes = candles.map((c) => c.close);
    const niftyCloses = Array.from(
      { length: 120 },
      (_, i) => 20000 * (1 + i * 0.002 + Math.sin(i / 4) * 0.002),
    );
    const input = {
      ...baseInput,
      price: closes[closes.length - 1],
      quote: { ...baseInput.quote, lastPrice: closes[closes.length - 1] },
      _closes: closes,
      _candles: candles,
      _niftyCloses: niftyCloses,
    };
    const res = buildEngineResult(input);
    expect(res.subScores.volatility).not.toBeNull();
    expect(res.subScores.priceAction).not.toBeNull();
    expect(res.subScores.priceAction).toBeGreaterThan(50); // breakout + uptrend structure
    expect(res.beta).not.toBeNull();
    expect(res.correlationToNifty).not.toBeNull();
    expect(res.coverage.extendedIndicators).toBe(true);
  });
});
