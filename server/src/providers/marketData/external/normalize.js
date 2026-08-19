import { round2 } from '../../../utils/helpers.js';

/**
 * Normalization for external market-data sources.
 *
 * Unofficial/free sources have unstable field shapes, so extraction is
 * defensive: it probes a list of likely keys and takes the first usable
 * numeric value. This layer is the ONLY place that maps vendor payloads to
 * the internal candle/quote contract consumed by the Feature Engine.
 */

export function pickNumber(obj, keys, { scale = 1 } = {}) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key] == null) continue;
    const n = Number(obj[key]);
    if (Number.isFinite(n)) return round2((n * scale) / 1);
  }
  return null;
}

function firstKey(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key] != null) return obj[key];
  }
  return null;
}

const PRICE_KEYS = ['lastPrice', 'last_price', 'ltp', 'close', 'closingPrice', 'currentPrice', 'tradePrice', 'last', 'price'];
const OPEN_KEYS = ['open', 'openingPrice', 'openPrice', 'dayOpen'];
const HIGH_KEYS = ['high', 'dayHigh', 'highPrice', 'dayHighPrice', 'high_price'];
const LOW_KEYS = ['low', 'dayLow', 'lowPrice', 'dayLowPrice', 'low_price'];
const PREV_KEYS = ['prevClose', 'previousClose', 'previousClosePrice', 'prev_close', 'closePrice'];
const VOLUME_KEYS = ['volume', 'totalTradedVolume', 'totalVolume', 'tradedVolume', 'quantity'];
const CHANGE_KEYS = ['change', 'netChange', 'changeValue', 'absChange'];
const CHANGE_PCT_KEYS = ['changePct', 'pctChange', 'percentChange', 'changePercent', 'pChange'];

/**
 * Extracts a normalized quote from an arbitrary vendor payload.
 * Returns null when no usable last price exists.
 */
export function extractQuote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Some payloads nest under priceInfo / price_info / stock / data.
  const priceInfo = firstKey(raw, ['priceInfo', 'price_info', 'quote', 'stock', 'securityInfo', 'current']);

  const lastPrice = pickNumber(priceInfo, PRICE_KEYS) ?? pickNumber(raw, PRICE_KEYS);
  if (lastPrice == null) return null;

  const open = pickNumber(priceInfo, OPEN_KEYS) ?? pickNumber(raw, OPEN_KEYS);
  const high = pickNumber(priceInfo, HIGH_KEYS) ?? pickNumber(raw, HIGH_KEYS);
  const low = pickNumber(priceInfo, LOW_KEYS) ?? pickNumber(raw, LOW_KEYS);
  const prevClose = pickNumber(priceInfo, PREV_KEYS) ?? pickNumber(raw, PREV_KEYS);
  const volume = pickNumber(priceInfo, VOLUME_KEYS) ?? pickNumber(raw, VOLUME_KEYS);

  let change = pickNumber(priceInfo, CHANGE_KEYS) ?? pickNumber(raw, CHANGE_KEYS);
  let changePct = pickNumber(priceInfo, CHANGE_PCT_KEYS) ?? pickNumber(raw, CHANGE_PCT_KEYS);

  if (change == null && prevClose != null) change = round2(lastPrice - prevClose);
  if (changePct == null && prevClose && prevClose > 0) changePct = round2(((lastPrice - prevClose) / prevClose) * 100);
  if (change == null) change = 0;
  if (changePct == null) changePct = 0;

  return {
    lastPrice,
    open,
    high,
    low,
    prevClose,
    change,
    changePct,
    volume,
  };
}

/**
 * Extracts a normalized daily candle from a vendor historical row.
 */
export function extractCandle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const close = pickNumber(raw, PRICE_KEYS);
  if (close == null) return null;
  const open = pickNumber(raw, OPEN_KEYS);
  const high = pickNumber(raw, HIGH_KEYS);
  const low = pickNumber(raw, LOW_KEYS);
  const volume = pickNumber(raw, VOLUME_KEYS) ?? 0;
  const tsRaw = firstKey(raw, ['CH_TIMESTAMP', 'timestamp', 'ts', 'date', 'datetime', 'tradeDate']);
  let ts = null;
  if (tsRaw) {
    const d = new Date(tsRaw);
    if (!Number.isNaN(d.getTime())) ts = d;
  }
  return {
    ts,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Converts an array of raw rows into normalized candles, dropping rows
 * without a close or a parseable date.
 */
export function normalizeCandles(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  const out = [];
  for (const row of rawRows) {
    const c = extractCandle(row);
    if (!c || !c.ts) continue;
    out.push({
      ts: c.ts,
      open: c.open ?? c.close,
      high: c.high ?? c.close,
      low: c.low ?? c.close,
      close: c.close,
      volume: Math.round(c.volume ?? 0),
    });
  }
  // Ascending by date, de-duplicated by day.
  out.sort((a, b) => a.ts - b.ts);
  const seen = new Set();
  return out.filter((c) => {
    const key = c.ts.toISOString().slice(0, 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}