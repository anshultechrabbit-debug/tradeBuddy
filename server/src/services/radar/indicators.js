/**
 * Technical indicators (pure functions, deterministic).
 */

export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

// Simple-average RSI over a flat `period` window — NOT Wilder's exponential
// smoothing, which is what most retail charting platforms (and "RSI(14)" as
// commonly understood) actually use. Values will diverge somewhat from RSI
// shown elsewhere for the same stock; this is a deliberate, simpler variant,
// not a bug, but callers displaying it to users should label it as such.
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function trueRange(high, low, prevClose) {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

export function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    trs.push(
      trueRange(Number(candles[i].high), Number(candles[i].low), Number(candles[i - 1].close)),
    );
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function roc(closes, period) {
  if (closes.length < period + 1) return null;
  const prev = closes[closes.length - 1 - period];
  return prev > 0 ? (closes[closes.length - 1] / prev - 1) * 100 : null;
}

export function stdDevOfReturns(closes, window = 20) {
  if (closes.length < 3) return 0;
  const slice = closes.slice(-(window + 1));
  const returns = [];
  for (let i = 1; i < slice.length; i += 1) {
    returns.push(slice[i] / slice[i - 1] - 1);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

export function zscoreOfLatest(closes, window = 20) {
  if (closes.length < window + 1) return 0;
  const slice = closes.slice(-(window + 1));
  const base = slice.slice(0, window);
  const mean = base.reduce((a, b) => a + b, 0) / window;
  const variance =
    base.reduce((a, b) => a + (b - mean) ** 2, 0) / (window - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (closes[closes.length - 1] - mean) / std;
}

/**
 * Linear regression: fit y = a + bx to the last `period` values and return
 * the projected value one step BEYOND the last point (i.e. tomorrow's close
 * if `values` contains daily closes up to today).
 * Returns null if fewer than 3 data points are available.
 */
export function linReg(values, period = 10) {
  const slice = values.length >= period ? values.slice(-period) : values.slice();
  const n = slice.length;
  if (n < 3) return null;
  const xMean = (n - 1) / 2;
  const yMean = slice.reduce((s, v) => s + v, 0) / n;
  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (i - xMean) * (slice[i] - yMean);
    ssXX += (i - xMean) ** 2;
  }
  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  // Predict at index n (one beyond the last observed point)
  return yMean + slope * (n - xMean);
}

/**
 * Volume-weighted mean close over the last `period` candles.
 * Acts as a VWAP proxy (where did price spend most time weighted by activity).
 * Returns null if no volume data is present.
 */
export function vwmaClose(candles, period = 10) {
  const slice = candles.length >= period ? candles.slice(-period) : candles.slice();
  let sumPV = 0;
  let sumV = 0;
  for (const c of slice) {
    const v = Number(c.volume) || 0;
    const p = Number(c.close);
    if (Number.isFinite(p) && v > 0) {
      sumPV += p * v;
      sumV += v;
    }
  }
  return sumV > 0 ? sumPV / sumV : null;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}