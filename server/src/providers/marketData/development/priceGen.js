import { hashString, mulberry32, seededRng } from '../../../utils/random.js';
import { round2 } from '../../../utils/helpers.js';

/**
 * Deterministic OHLCV candle generator for the development market-data
 * provider. Everything is seeded from symbol + index so results are
 * repeatable. A gentle mean-reversion keeps the series anchored near the
 * instrument base price so quotes/P&L stay realistic.
 */

const TRADING_DAYS = 120;

export function generateCandles(symbol, exchange, basePrice, seed) {
  const rng = seededRng(`${seed}:${symbol}`);
  const trend = (rng() - 0.42) * 0.0012; // per-day drift, deterministic
  const volatility = 0.006 + rng() * 0.012; // per-day sigma (lower = stable)
  const baseVolume = Math.floor(200000 + rng() * 5000000);
  const meanReversion = 0.025;

  let prevClose = basePrice * (1 + (rng() - 0.5) * 0.2);
  const candles = [];
  const now = new Date();
  let dayIndex = 0;

  while (candles.length < TRADING_DAYS) {
    const d = new Date(now);
    d.setDate(now.getDate() - (TRADING_DAYS - dayIndex - 1));
    const dow = d.getDay();
    dayIndex += 1;
    if (dow === 0 || dow === 6) continue;

    const dayRng = mulberry32(hashString(`${seed}:${symbol}:${d.toISOString().slice(0, 10)}`));
    const shock = dayRng() > 0.985 ? (dayRng() - 0.5) * basePrice * 0.02 : 0;
    let close =
      prevClose *
      (1 + trend + (dayRng() - 0.5) * volatility) +
      (basePrice - prevClose) * meanReversion +
      shock;
    close = Math.max(1, close);
    const open = prevClose * (1 + (dayRng() - 0.5) * 0.003);
    const high = Math.max(open, close) * (1 + dayRng() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - dayRng() * volatility * 0.5);
    const volume = Math.floor(baseVolume * (0.6 + dayRng() * 1.1));

    candles.push({
      symbol,
      exchange,
      timeframe: '1d',
      ts: d,
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(1, low)),
      close: round2(close),
      volume,
      source: 'development',
      provider: 'development',
    });
    prevClose = close;
  }
  return candles;
}

export function generateQuote(symbol, candles, dateSeed = '') {
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const lastClose = Number(last.close);
  const prevClose = Number(prev.close);
  const rng = mulberry32(hashString(`${symbol}:${dateSeed}`));
  const jitter = (rng() - 0.5) * 0.004 * lastClose;
  const lastPrice = Math.max(0.5, round2(lastClose + jitter));
  const change = round2(lastPrice - prevClose);
  const changePct = round2((change / prevClose) * 100);
  return {
    symbol,
    exchange: last.exchange,
    lastPrice,
    open: round2(Number(last.open)),
    high: round2(Number(last.high)),
    low: round2(Number(last.low)),
    prevClose,
    change,
    changePct,
    volume: Number(last.volume),
    bid: round2(lastPrice - 0.1),
    ask: round2(lastPrice + 0.1),
    source: 'development',
    provider: 'development',
  };
}

export function dailySeriesStats(candles) {
  const closes = candles.map((c) => Number(c.close));
  if (closes.length < 2) return { meanReturn: 0, vol: 0, last: closes[0] ?? 0, prev: closes[0] ?? 0 };
  const returns = [];
  for (let i = 1; i < closes.length; i += 1) {
    returns.push(closes[i] / closes[i - 1] - 1);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  return {
    meanReturn: mean,
    vol: Math.sqrt(variance),
    last: closes[closes.length - 1],
    prev: closes[closes.length - 2],
  };
}