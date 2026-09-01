import { describe, it, expect } from 'vitest';
import {
  stochastic,
  cci,
  williamsR,
  adxDmi,
  bollingerBands,
  keltnerChannels,
  historicalVolatilityPct,
  obv,
  cmf,
  mfi,
  supertrend,
  parabolicSar,
  ichimoku,
  previousDayLevels,
  gapPct,
  swingStructure,
  candlestickPattern,
  betaAndCorrelation,
} from '../src/services/radar/indicators.js';

function makeTrendingCandles(n, { start = 100, dailyChangePct = 0.5, volBase = 100000 } = {}) {
  const candles = [];
  let close = start;
  for (let i = 0; i < n; i += 1) {
    const open = close;
    close = open * (1 + dailyChangePct / 100);
    const high = Math.max(open, close) * 1.005;
    const low = Math.min(open, close) * 0.995;
    candles.push({ open, high, low, close, volume: volBase + i * 100 });
  }
  return candles;
}

const uptrend = makeTrendingCandles(120, { dailyChangePct: 0.6 });
const downtrend = makeTrendingCandles(120, { dailyChangePct: -0.6 });

// A zigzag with explicit, unambiguous swing points (each leg linearly
// interpolated between control prices) — a straight-line uptrend has no
// interior local extrema, so swingStructure() correctly finds none on it.
function makeZigzagCandles(controlPrices, segLen = 8) {
  const closes = [];
  for (let seg = 0; seg < controlPrices.length - 1; seg += 1) {
    const from = controlPrices[seg];
    const to = controlPrices[seg + 1];
    for (let i = 0; i < segLen; i += 1) {
      closes.push(from + ((to - from) * i) / segLen);
    }
  }
  closes.push(controlPrices[controlPrices.length - 1]);
  const candles = [];
  for (let i = 0; i < closes.length; i += 1) {
    const open = i === 0 ? closes[0] : closes[i - 1];
    const close = closes[i];
    candles.push({
      open,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
      close,
      volume: 100000,
    });
  }
  return candles;
}
// Higher highs + higher lows: 100→90(low)→105(high)→95(low)→112(high)→102(low)→118(high)
const zigzagUp = makeZigzagCandles([100, 90, 105, 95, 112, 102, 118]);
// Lower highs + lower lows: mirror image
const zigzagDown = makeZigzagCandles([100, 110, 95, 105, 88, 98, 82]);

describe('radar/indicators — new TA functions', () => {
  it('stochastic: reads overbought on a steady uptrend, null on short history', () => {
    const s = stochastic(uptrend);
    expect(s.k).toBeGreaterThan(70);
    expect(s.d).not.toBeNull();
    expect(stochastic(uptrend.slice(0, 5))).toBeNull();
  });

  it('cci: positive on an uptrend, negative on a downtrend', () => {
    expect(cci(uptrend)).toBeGreaterThan(0);
    expect(cci(downtrend)).toBeLessThan(0);
  });

  it('williamsR: near the top of range (close to 0) on an uptrend', () => {
    expect(williamsR(uptrend)).toBeGreaterThan(-30);
    expect(williamsR(downtrend)).toBeLessThan(-70);
  });

  it('adxDmi: +DI leads -DI on an uptrend, and vice versa on a downtrend', () => {
    const up = adxDmi(uptrend);
    const down = adxDmi(downtrend);
    expect(up.plusDI).toBeGreaterThan(up.minusDI);
    expect(down.minusDI).toBeGreaterThan(down.plusDI);
    expect(adxDmi(uptrend.slice(0, 10))).toBeNull();
  });

  it('bollingerBands: upper > mid > lower, percentB/bandwidth are sane', () => {
    const bb = bollingerBands(uptrend.map((c) => c.close));
    expect(bb.upper).toBeGreaterThan(bb.mid);
    expect(bb.mid).toBeGreaterThan(bb.lower);
    expect(bb.percentB).toBeGreaterThan(0);
    expect(bb.bandwidthPct).toBeGreaterThan(0);
  });

  it('keltnerChannels: upper > mid > lower', () => {
    const kc = keltnerChannels(uptrend);
    expect(kc.upper).toBeGreaterThan(kc.mid);
    expect(kc.mid).toBeGreaterThan(kc.lower);
  });

  it('historicalVolatilityPct: positive number on noisy history, null on too little', () => {
    expect(historicalVolatilityPct(zigzagUp.map((c) => c.close))).toBeGreaterThan(0);
    expect(historicalVolatilityPct(uptrend.slice(0, 5).map((c) => c.close))).toBeNull();
  });

  it('obv: rising on a steady uptrend, falling on a steady downtrend', () => {
    expect(obv(uptrend).trend).toBe('rising');
    expect(obv(downtrend).trend).toBe('falling');
  });

  it('cmf/mfi: not null with enough OHLCV history, null with too little', () => {
    expect(cmf(uptrend)).not.toBeNull();
    expect(cmf(uptrend.slice(0, 5))).toBeNull();
    expect(mfi(uptrend)).toBeGreaterThan(50);
    expect(mfi(downtrend)).toBeLessThan(50);
  });

  it('supertrend/parabolicSar: both read "up" on a steady uptrend, "down" on a downtrend', () => {
    expect(supertrend(uptrend).direction).toBe('up');
    expect(supertrend(downtrend).direction).toBe('down');
    expect(parabolicSar(uptrend).direction).toBe('up');
    expect(parabolicSar(downtrend).direction).toBe('down');
  });

  it('ichimoku: price sits above the cloud on an uptrend, below on a downtrend', () => {
    expect(ichimoku(uptrend).cloudPosition).toBe('above');
    expect(ichimoku(downtrend).cloudPosition).toBe('below');
    expect(ichimoku(uptrend.slice(0, 10))).toBeNull();
  });

  it('previousDayLevels: reads the second-to-last candle', () => {
    const levels = previousDayLevels(uptrend);
    const prev = uptrend[uptrend.length - 2];
    expect(levels.prevClose).toBeCloseTo(prev.close);
    expect(levels.prevHigh).toBeCloseTo(prev.high);
  });

  it('gapPct: computes % gap, null on missing/invalid input', () => {
    expect(gapPct(102, 100)).toBeCloseTo(2);
    expect(gapPct(null, 100)).toBeNull();
    expect(gapPct(102, 0)).toBeNull();
  });

  it('swingStructure: classifies clear HH/HL vs LH/LL sequences, and exposes each individually', () => {
    const up = swingStructure(zigzagUp);
    expect(up.structure).toBe('UPTREND_STRUCTURE');
    expect(up.higherHigh).toBe(true);
    expect(up.higherLow).toBe(true);
    const down = swingStructure(zigzagDown);
    expect(down.structure).toBe('DOWNTREND_STRUCTURE');
    expect(down.higherHigh).toBe(false);
    expect(down.higherLow).toBe(false);
    expect(swingStructure(zigzagUp.slice(0, 10))).toBeNull();
  });

  it('candlestickPattern: recognizes a bullish engulfing candle', () => {
    const candles = [
      { open: 100, high: 101, low: 98, close: 99, volume: 1000 }, // red candle
      { open: 98.5, high: 103, low: 98, close: 102, volume: 1000 }, // engulfs it, bullish
    ];
    const p = candlestickPattern(candles);
    expect(p.pattern).toBe('Bullish Engulfing');
    expect(p.bias).toBe('bullish');
  });

  it('candlestickPattern: recognizes a doji', () => {
    const candles = [
      { open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { open: 100.02, high: 102, low: 98, close: 100, volume: 1000 },
    ];
    expect(candlestickPattern(candles).pattern).toBe('Doji');
  });

  it('betaAndCorrelation: beta/correlation track a scaled, perfectly-correlated series', () => {
    const niftyCloses = [];
    const stockCloses = [];
    let n = 20000;
    let s = 1000;
    for (let i = 0; i < 65; i += 1) {
      const r = Math.sin(i / 3) * 0.01; // shared return driver
      n *= 1 + r;
      s *= 1 + r * 1.5; // stock moves 1.5x the index
      niftyCloses.push(n);
      stockCloses.push(s);
    }
    const result = betaAndCorrelation(stockCloses, niftyCloses, 60);
    expect(result.beta).toBeCloseTo(1.5, 1);
    expect(result.correlation).toBeGreaterThan(0.95);
    expect(betaAndCorrelation(stockCloses.slice(0, 10), niftyCloses.slice(0, 10))).toBeNull();
  });
});
