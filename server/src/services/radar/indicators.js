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

// Annualized historical volatility (%) — thin wrapper around stdDevOfReturns
// so both radar/engine.js and predictionEngine.js share one implementation
// instead of each inlining `stdDevOfReturns(...) * sqrt(252) * 100`.
export function historicalVolatilityPct(closes, period = 20) {
  if (closes.length < period + 1) return null;
  return stdDevOfReturns(closes, period) * Math.sqrt(252) * 100;
}

/**
 * Stochastic Oscillator: %K from the close's position within the recent
 * high/low range, %D as a short SMA of %K. Returns null on insufficient data.
 */
export function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (candles.length < kPeriod + dPeriod) return null;
  const kValues = [];
  for (let i = kPeriod - 1; i < candles.length; i += 1) {
    const window = candles.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...window.map((c) => Number(c.high)));
    const ll = Math.min(...window.map((c) => Number(c.low)));
    const close = Number(candles[i].close);
    kValues.push(hh > ll ? ((close - ll) / (hh - ll)) * 100 : 50);
  }
  const k = kValues[kValues.length - 1];
  const d = sma(kValues, dPeriod);
  return { k, d };
}

/**
 * Commodity Channel Index: how far today's typical price sits from its
 * recent mean, scaled by mean absolute deviation.
 */
export function cci(candles, period = 20) {
  if (candles.length < period) return null;
  const tp = candles.map((c) => (Number(c.high) + Number(c.low) + Number(c.close)) / 3);
  const slice = tp.slice(-period);
  const meanTp = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev = slice.reduce((a, b) => a + Math.abs(b - meanTp), 0) / period;
  if (meanDev === 0) return 0;
  return (tp[tp.length - 1] - meanTp) / (0.015 * meanDev);
}

/**
 * Williams %R: close's position within the recent high/low range, on a
 * 0 (top of range) to -100 (bottom of range) scale.
 */
export function williamsR(candles, period = 14) {
  if (candles.length < period) return null;
  const window = candles.slice(-period);
  const hh = Math.max(...window.map((c) => Number(c.high)));
  const ll = Math.min(...window.map((c) => Number(c.low)));
  const close = Number(candles[candles.length - 1].close);
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

/**
 * ADX/DMI trend strength. Uses a simple rolling-average smoothing of
 * +DM/-DM/TR rather than Wilder's exact recursive smoothing — a deliberate,
 * simpler variant (same spirit as the rsi() comment above), not a bug;
 * values will diverge somewhat from ADX(14) shown on retail charting
 * platforms but track the same trend-strength story.
 */
export function adxDmi(candles, period = 14) {
  if (candles.length < period * 2) return null;
  const plusDM = [];
  const minusDM = [];
  const tr = [];
  for (let i = 1; i < candles.length; i += 1) {
    const upMove = Number(candles[i].high) - Number(candles[i - 1].high);
    const downMove = Number(candles[i - 1].low) - Number(candles[i].low);
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(trueRange(Number(candles[i].high), Number(candles[i].low), Number(candles[i - 1].close)));
  }
  const rollingSum = (arr) => {
    let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [sum];
    for (let i = period; i < arr.length; i += 1) {
      sum = sum - sum / period + arr[i];
      out.push(sum);
    }
    return out;
  };
  const smoothedTR = rollingSum(tr);
  const smoothedPlusDM = rollingSum(plusDM);
  const smoothedMinusDM = rollingSum(minusDM);
  const plusDI = smoothedPlusDM.map((v, i) => (smoothedTR[i] > 0 ? (v / smoothedTR[i]) * 100 : 0));
  const minusDI = smoothedMinusDM.map((v, i) => (smoothedTR[i] > 0 ? (v / smoothedTR[i]) * 100 : 0));
  const dx = plusDI.map((p, i) => {
    const m = minusDI[i];
    return p + m > 0 ? (Math.abs(p - m) / (p + m)) * 100 : 0;
  });
  if (dx.length < period) return null;
  const adx = dx.slice(-period).reduce((a, b) => a + b, 0) / period;
  return { adx, plusDI: plusDI[plusDI.length - 1], minusDI: minusDI[minusDI.length - 1] };
}

/**
 * Bollinger Bands from closes: mid = SMA(period), bands = mid ± mult*stdDev.
 * bandwidthPct measures how "squeezed" the bands are; percentB is the
 * close's position within the bands (0 = lower band, 1 = upper band).
 */
export function bollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const last = closes[closes.length - 1];
  return {
    upper,
    mid,
    lower,
    bandwidthPct: mid > 0 ? ((upper - lower) / mid) * 100 : null,
    percentB: upper > lower ? (last - lower) / (upper - lower) : 0.5,
  };
}

/**
 * Keltner Channels: EMA midline ± mult*ATR. Used alongside Bollinger Bands
 * to flag volatility expansion (price piercing the ATR-based channel).
 */
export function keltnerChannels(candles, emaPeriod = 20, atrPeriod = 10, mult = 2) {
  const closes = candles.map((c) => Number(c.close));
  if (closes.length < emaPeriod || candles.length < atrPeriod + 1) return null;
  const mid = ema(closes, emaPeriod);
  const atrVal = atr(candles, atrPeriod);
  if (mid == null || atrVal == null) return null;
  return { upper: mid + mult * atrVal, mid, lower: mid - mult * atrVal };
}

/**
 * On-Balance Volume: cumulative running total, plus the direction of its
 * short-term slope (rising/falling/flat over the last ~10 points).
 */
export function obv(candles) {
  if (candles.length < 2) return null;
  let value = 0;
  const series = [0];
  for (let i = 1; i < candles.length; i += 1) {
    const c = Number(candles[i].close);
    const p = Number(candles[i - 1].close);
    const v = Number(candles[i].volume) || 0;
    if (c > p) value += v;
    else if (c < p) value -= v;
    series.push(value);
  }
  const tail = series.slice(-Math.min(10, series.length));
  const trend = tail[tail.length - 1] > tail[0] ? 'rising' : tail[tail.length - 1] < tail[0] ? 'falling' : 'flat';
  return { value, trend };
}

/**
 * Chaikin Money Flow: volume-weighted average of each candle's close
 * position within its own high/low range, over `period` candles.
 * Positive = buying pressure (accumulation), negative = selling (distribution).
 */
export function cmf(candles, period = 20) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  let mfVolSum = 0;
  let volSum = 0;
  for (const c of slice) {
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const v = Number(c.volume) || 0;
    const mult = h > l ? (cl - l - (h - cl)) / (h - l) : 0;
    mfVolSum += mult * v;
    volSum += v;
  }
  return volSum > 0 ? mfVolSum / volSum : null;
}

/**
 * Money Flow Index: RSI's volume-weighted cousin — 0-100, banded the same
 * way (>80 overbought, <20 oversold).
 */
export function mfi(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const tp = candles.map((c) => (Number(c.high) + Number(c.low) + Number(c.close)) / 3);
  let posFlow = 0;
  let negFlow = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    const rawFlow = tp[i] * (Number(candles[i].volume) || 0);
    if (tp[i] > tp[i - 1]) posFlow += rawFlow;
    else if (tp[i] < tp[i - 1]) negFlow += rawFlow;
  }
  if (negFlow === 0) return 100;
  const mr = posFlow / negFlow;
  return 100 - 100 / (1 + mr);
}

/**
 * Supertrend direction/value. Uses one ATR value (computed once over the
 * whole lookback) rather than recomputing ATR at every bar — a simplifying
 * approximation that still tracks trend flips correctly for recent history.
 */
export function supertrend(candles, atrPeriod = 10, mult = 3) {
  if (candles.length < atrPeriod + 2) return null;
  const atrVal = atr(candles, atrPeriod);
  if (atrVal == null) return null;
  let finalUpper = null;
  let finalLower = null;
  let trendUp = true;
  for (let i = 1; i < candles.length; i += 1) {
    const close = Number(candles[i].close);
    const prevClose = Number(candles[i - 1].close);
    const hl2 = (Number(candles[i].high) + Number(candles[i].low)) / 2;
    const basicUpper = hl2 + mult * atrVal;
    const basicLower = hl2 - mult * atrVal;
    finalUpper = finalUpper == null || basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower = finalLower == null || basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
    if (trendUp && close < finalLower) trendUp = false;
    else if (!trendUp && close > finalUpper) trendUp = true;
  }
  return { value: trendUp ? finalLower : finalUpper, direction: trendUp ? 'up' : 'down' };
}

/**
 * Parabolic SAR: standard accelerating stop-and-reverse, run over the full
 * candle history so the direction/value reflect the latest trend state.
 */
export function parabolicSar(candles, step = 0.02, max = 0.2) {
  if (candles.length < 5) return null;
  let isUp = candles[1].close >= candles[0].close;
  let sarVal = isUp ? Number(candles[0].low) : Number(candles[0].high);
  let ep = isUp ? Number(candles[0].high) : Number(candles[0].low);
  let af = step;
  for (let i = 1; i < candles.length; i += 1) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    sarVal = sarVal + af * (ep - sarVal);
    if (isUp) {
      sarVal = Math.min(sarVal, Number(candles[i - 1].low));
      if (low < sarVal) {
        isUp = false;
        sarVal = ep;
        ep = low;
        af = step;
      } else if (high > ep) {
        ep = high;
        af = Math.min(af + step, max);
      }
    } else {
      sarVal = Math.max(sarVal, Number(candles[i - 1].high));
      if (high > sarVal) {
        isUp = true;
        sarVal = ep;
        ep = high;
        af = step;
      } else if (low < ep) {
        ep = low;
        af = Math.min(af + step, max);
      }
    }
  }
  return { value: sarVal, direction: isUp ? 'up' : 'down' };
}

/**
 * Ichimoku cloud read. Simplified: spanA/spanB are computed from the
 * CURRENT bar rather than the standard 26-period-forward-shifted cloud, so
 * this answers "where would the cloud be centered right now" rather than
 * reproducing the exact plotted chart — good enough for a same-day
 * above/below/inside read, not for exact historical cloud levels.
 */
export function ichimoku(candles, conv = 9, base = 26, spanBPeriod = 52) {
  if (candles.length < spanBPeriod) return null;
  const hi = (n) => Math.max(...candles.slice(-n).map((c) => Number(c.high)));
  const lo = (n) => Math.min(...candles.slice(-n).map((c) => Number(c.low)));
  const conversionLine = (hi(conv) + lo(conv)) / 2;
  const baseLine = (hi(base) + lo(base)) / 2;
  const spanA = (conversionLine + baseLine) / 2;
  const spanB = (hi(spanBPeriod) + lo(spanBPeriod)) / 2;
  const price = Number(candles[candles.length - 1].close);
  const cloudTop = Math.max(spanA, spanB);
  const cloudBottom = Math.min(spanA, spanB);
  const cloudPosition = price > cloudTop ? 'above' : price < cloudBottom ? 'below' : 'inside';
  return { conversionLine, baseLine, spanA, spanB, cloudPosition };
}

/**
 * Previous completed session's OHLC — the candle before the latest one.
 */
export function previousDayLevels(candles) {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  return {
    prevOpen: Number(prev.open),
    prevHigh: Number(prev.high),
    prevLow: Number(prev.low),
    prevClose: Number(prev.close),
  };
}

/**
 * Gap % between a live/today session open and the prior session's close.
 * Returns null rather than fabricating a gap when no real open is known —
 * callers must pass an actual quote-provided open, never a daily close
 * standing in for it.
 */
export function gapPct(liveOpen, prevClose) {
  if (liveOpen == null || prevClose == null) return null;
  const o = Number(liveOpen);
  const p = Number(prevClose);
  if (!Number.isFinite(o) || !Number.isFinite(p) || p === 0) return null;
  return ((o - p) / p) * 100;
}

/**
 * Swing structure over recent price action: compares the last two swing
 * highs and the last two swing lows (a swing point = the extreme within
 * `lookback` candles on each side) to classify Higher-High/Higher-Low
 * (uptrend structure), Lower-High/Lower-Low (downtrend structure), or MIXED.
 */
// Collapses adjacent/near-tied raw detections (a single real turning point
// often flags several consecutive candles, e.g. a flat top) into one swing
// point per cluster, keeping the most extreme value in each cluster.
function collapseSwingPoints(points, lookback, pickMax) {
  const clusters = [];
  for (const p of points) {
    const last = clusters[clusters.length - 1];
    if (last && p.i - last[last.length - 1].i <= lookback) last.push(p);
    else clusters.push([p]);
  }
  return clusters.map((cluster) =>
    cluster.reduce((best, p) => ((pickMax ? p.v > best.v : p.v < best.v) ? p : best)),
  );
}

export function swingStructure(candles, lookback = 5) {
  if (candles.length < lookback * 4) return null;
  const highs = candles.map((c) => Number(c.high));
  const lows = candles.map((c) => Number(c.low));
  const rawHighs = [];
  const rawLows = [];
  for (let i = lookback; i < candles.length - lookback; i += 1) {
    const windowHighs = highs.slice(i - lookback, i + lookback + 1);
    const windowLows = lows.slice(i - lookback, i + lookback + 1);
    if (highs[i] === Math.max(...windowHighs)) rawHighs.push({ i, v: highs[i] });
    if (lows[i] === Math.min(...windowLows)) rawLows.push({ i, v: lows[i] });
  }
  const swingHighs = collapseSwingPoints(rawHighs, lookback, true);
  const swingLows = collapseSwingPoints(rawLows, lookback, false);
  if (swingHighs.length < 2 || swingLows.length < 2) return null;
  // higherHigh/higherLow are exposed individually (not just the combined
  // `structure`) so callers can read Higher-High/Lower-High and Higher-Low/
  // Lower-Low as the distinct pieces of price-action evidence they are.
  const higherHigh = swingHighs[swingHighs.length - 1].v > swingHighs[swingHighs.length - 2].v;
  const higherLow = swingLows[swingLows.length - 1].v > swingLows[swingLows.length - 2].v;
  const structure = higherHigh && higherLow
    ? 'UPTREND_STRUCTURE'
    : !higherHigh && !higherLow
      ? 'DOWNTREND_STRUCTURE'
      : 'MIXED';
  return { structure, higherHigh, higherLow };
}

/**
 * Latest-candle pattern read, restricted to a small, high-signal set
 * (Doji, Hammer, Shooting Star, Bullish/Bearish Engulfing, Marubozu) rather
 * than an exhaustive pattern library — these are the patterns with the
 * clearest single-candle-or-pair bias.
 */
export function candlestickPattern(candles) {
  if (candles.length < 2) return null;
  const cur = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const o = Number(cur.open);
  const h = Number(cur.high);
  const l = Number(cur.low);
  const c = Number(cur.close);
  const po = Number(prev.open);
  const pc = Number(prev.close);
  const range = h - l;
  if (!(range > 0)) return null;
  const body = Math.abs(c - o);
  const upperWick = h - Math.max(o, c);
  const lowerWick = Math.min(o, c) - l;

  if (body / range < 0.1) return { pattern: 'Doji', bias: 'neutral' };
  if (lowerWick > body * 2 && upperWick < body * 0.5 && c > o) return { pattern: 'Hammer', bias: 'bullish' };
  if (upperWick > body * 2 && lowerWick < body * 0.5 && c < o) return { pattern: 'Shooting Star', bias: 'bearish' };
  if (c > o && po > pc && c > po && o < pc) return { pattern: 'Bullish Engulfing', bias: 'bullish' };
  if (c < o && pc > po && c < po && o > pc) return { pattern: 'Bearish Engulfing', bias: 'bearish' };
  if (body / range > 0.9 && c > o) return { pattern: 'Bullish Marubozu', bias: 'bullish' };
  if (body / range > 0.9 && c < o) return { pattern: 'Bearish Marubozu', bias: 'bearish' };
  return { pattern: 'None', bias: 'neutral' };
}

/**
 * Beta and correlation vs a benchmark's closes, from paired daily returns
 * over `period` sessions, aligned from the end of both arrays (same
 * alignment assumption the existing Nifty relative-strength calc makes:
 * both series are NSE daily closes, so trading calendars line up).
 * Diagnostic only — describes co-movement/risk, not direction, so it is
 * never folded into a 0-100 score.
 */
export function betaAndCorrelation(stockCloses, benchmarkCloses, period = 60) {
  const n = Math.min(stockCloses.length, benchmarkCloses.length);
  if (n < period + 1) return null;
  const s = stockCloses.slice(-(period + 1));
  const b = benchmarkCloses.slice(-(period + 1));
  const sReturns = [];
  const bReturns = [];
  for (let i = 1; i <= period; i += 1) {
    sReturns.push(s[i] / s[i - 1] - 1);
    bReturns.push(b[i] / b[i - 1] - 1);
  }
  const meanS = sReturns.reduce((a, x) => a + x, 0) / period;
  const meanB = bReturns.reduce((a, x) => a + x, 0) / period;
  let cov = 0;
  let varB = 0;
  let varS = 0;
  for (let i = 0; i < period; i += 1) {
    cov += (sReturns[i] - meanS) * (bReturns[i] - meanB);
    varB += (bReturns[i] - meanB) ** 2;
    varS += (sReturns[i] - meanS) ** 2;
  }
  cov /= period - 1;
  varB /= period - 1;
  varS /= period - 1;
  if (varB === 0) return null;
  const beta = cov / varB;
  const correlation = varS > 0 ? cov / Math.sqrt(varS * varB) : null;
  return { beta, correlation };
}