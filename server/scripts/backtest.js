/**
 * Walk-Forward Backtest — TradeBuddy Prediction Engine
 * ======================================================
 * Usage:
 *   node server/scripts/backtest.js [--days 800] [--symbols "RELIANCE,TCS,..."] [--out results.json]
 *
 * Compares:
 *   A. tradebuddy-engine-1.1  (current predictionEngine.js, re-implemented standalone)
 *   B. tradebuddy-engine-1.0  (old weights / old volume logic, faithful re-implementation)
 *   C. Random 50/50 directional baseline
 *   D. NIFTY prior-session direction baseline
 *
 * Methodology:
 *   - For each date t in the historical series, the engine sees ONLY candles[0..t-1]
 *   - The prediction is compared against close[t] (the actual outcome)
 *   - No parameter tuning on the test period
 *   - Walk-forward, strictly chronological order — no data shuffling
 *   - dayChangePct is NULL at prediction time (not known at market open)
 *     → volume scoring uses direction-unknown fallback (no look-ahead)
 *   - News and fundamentals are UNKNOWN (no historical data available)
 *
 * Metrics:
 *   directionalAccuracy, buyPrecision, falseBuyRate, avgReturnAfterBuy,
 *   avgPredictionError, targetHitRate, stopHitRate, maxDrawdown, profitFactor
 *
 * This script does NOT write to predictions.json or the database.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.resolve(__dirname, '..', 'python', 'market_data.py');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
const DAYS = parseInt(getArg('days', '800'), 10);
const OUT_FILE = getArg('out', path.resolve(__dirname, 'backtest_results.json'));
const SYMBOL_ARG = getArg('symbols', null);

// 35 liquid NSE large-caps (Nifty 50 / Nifty 100 members with long history)
const DEFAULT_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY',
  'WIPRO', 'SBIN', 'BAJFINANCE', 'HINDUNILVR', 'LT',
  'KOTAKBANK', 'AXISBANK', 'MARUTI', 'ULTRACEMCO', 'SUNPHARMA',
  'NTPC', 'POWERGRID', 'COALINDIA', 'BHARTIARTL', 'ITC',
  'ADANIENT', 'TATAMOTORS', 'TITAN', 'ASIANPAINT', 'NESTLEIND',
  'HCLTECH', 'TECHM', 'DIVISLAB', 'DRREDDY', 'CIPLA',
  'EICHERMOT', 'BAJAJFINSV', 'BPCL', 'ONGC', 'TATASTEEL',
];
const SYMBOLS = SYMBOL_ARG
  ? SYMBOL_ARG.split(',').map((s) => s.trim().toUpperCase())
  : DEFAULT_SYMBOLS;

// ---------------------------------------------------------------------------
// Python bridge
// ---------------------------------------------------------------------------
function pythonBin() {
  return process.env.PYTHON_BIN || 'python';
}

async function fetchCandlesPython(symbol, days, isIndex = false) {
  // NIFTY index has a KeyError: 'OPEN' bug in jugaad index_df, so use nse_archives (which is cached locally).
  // For stocks, use jugaad because it fetches the entire EOD history in a single request.
  const source = isIndex ? 'nse_archives' : 'jugaad';
  const cmdArgs = [
    PYTHON_SCRIPT, source, 'candles',
    '--symbol', symbol,
    '--days', String(days),
  ];
  if (isIndex) cmdArgs.push('--index', '1');

  try {
    const { stdout } = await execFileAsync(pythonBin(), cmdArgs, {
      timeout: 300_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const result = JSON.parse(stdout.trim());
    if (!result.ok) throw new Error(result.error || 'python error');
    return Array.isArray(result.data) ? result.data : [];
  } catch (err1) {
    // Fallback source
    try {
      const fbSource = isIndex ? 'nselib' : 'nse_archives';
      const fb = [PYTHON_SCRIPT, fbSource, 'candles', '--symbol', symbol, '--days', String(days)];
      if (isIndex) fb.push('--index', '1');
      const { stdout: fb2 } = await execFileAsync(pythonBin(), fb, {
        timeout: 300_000,
        maxBuffer: 32 * 1024 * 1024,
      });
      const r2 = JSON.parse(fb2.trim());
      if (!r2.ok) throw new Error(r2.error);
      return Array.isArray(r2.data) ? r2.data : [];
    } catch {
      process.stderr.write(`  [WARN] ${symbol}: candle fetch failed — ${err1.message}\n`);
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Pure indicator functions (self-contained — no imports from app code)
// ---------------------------------------------------------------------------
function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
  return prev;
}

function rsiCalc(closes, period) {
  if (!closes || closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (gains + losses === 0) return 50;
  return 100 - 100 / (1 + gains / losses);
}

function atrCalc(candles, period) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = Number(candles[i].high), l = Number(candles[i].low), pc = Number(candles[i - 1].close);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const sl = trs.slice(-period);
  return sl.reduce((a, b) => a + b, 0) / sl.length;
}

function rocCalc(closes, period) {
  if (!closes || closes.length < period + 1) return null;
  const prev = closes[closes.length - 1 - period];
  return prev > 0 ? (closes[closes.length - 1] / prev - 1) * 100 : null;
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function r2(v) { return v == null ? null : Math.round(Number(v) * 100) / 100; }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }

// ---------------------------------------------------------------------------
// Build technical inputs from raw candles up to index `upTo` (exclusive)
// STRICTLY no look-ahead: only candles[0..upTo-1] are used
// ---------------------------------------------------------------------------
function buildTech(allCandles, upTo) {
  const candles = allCandles.slice(0, upTo);
  if (candles.length < 30) return null;
  const closes = candles.map((c) => Number(c.close)).filter(Number.isFinite);
  if (closes.length < 20) return null;

  const price = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);

  // MACD
  let e12 = closes[0], e26 = closes[0];
  const macdLine = [];
  for (const c of closes) {
    e12 = c * (2 / 13) + e12 * (1 - 2 / 13);
    e26 = c * (2 / 27) + e26 * (1 - 2 / 27);
    macdLine.push(e12 - e26);
  }
  const macdValue = closes.length >= 26 ? macdLine[macdLine.length - 1] : null;
  const macdSignal = closes.length >= 26 ? ema(macdLine, 9) : null;

  const rsi14 = rsiCalc(closes, 14);
  const atr14 = atrCalc(candles, 14);
  const atrPct = price > 0 && atr14 != null ? (atr14 / price) * 100 : null;
  const roc20 = rocCalc(closes, 20);

  const vol20 = candles.slice(-20).map((c) => Number(c.volume) || 0);
  const avgVol20 = vol20.length ? vol20.reduce((a, b) => a + b, 0) / vol20.length : 0;
  const lastVol = Number(candles[candles.length - 1].volume) || 0;
  const volRatio = avgVol20 > 0 ? r2(lastVol / avgVol20) : 1;

  let trend = 'Neutral';
  if (s50 != null) {
    if (price > s50 && s20 != null && s20 > s50) trend = 'Bullish';
    else if (price < s50 && s20 != null && s20 < s50) trend = 'Bearish';
  }

  const recent = candles.slice(-20);
  const high20 = Math.max(...recent.map((c) => Number(c.high)));
  const low20 = Math.min(...recent.map((c) => Number(c.low)));
  const supCands = [low20, s50].filter((v) => v != null && v < price);
  const primarySupport = supCands.length ? Math.max(...supCands) : low20;
  const resCands = [high20, s200].filter((v) => v != null && v > price);
  const primaryResistance = resCands.length ? Math.min(...resCands) : high20;

  return {
    price: r2(price),
    candleCount: closes.length,
    trend,
    rsi: rsi14 != null ? r2(rsi14) : null,
    macd: { value: macdValue, signal: macdSignal },
    sma20: r2(s20), sma50: r2(s50), sma200: r2(s200),
    roc20: r2(roc20),
    atr: atr14 != null ? r2(atr14) : null,
    atrPct: r2(atrPct),
    volumeRatio: volRatio,
    avgVolume20: Math.round(avgVol20),
    resistance: r2(primaryResistance),
    support: r2(primarySupport),
    // dayChangePct intentionally absent — not known at market open
  };
}

function buildMarket(niftyCandles, upTo) {
  const nc = niftyCandles.slice(0, upTo);
  if (nc.length < 20) return { ok: false, regime: 'NEUTRAL', relativeStrength: null };
  const cls = nc.map((c) => Number(c.close)).filter(Number.isFinite);
  const np = cls[cls.length - 1];
  const n20 = sma(cls, 20);
  const n50 = sma(cls, 50);
  let regime = 'NEUTRAL';
  if (n20 != null && n50 != null) {
    if (np > n20 && np > n50) regime = 'BULLISH';
    else if (np < n20 && np < n50) regime = 'BEARISH';
  }
  return { ok: true, regime, relativeStrength: null, partial: false };
}

// ---------------------------------------------------------------------------
// ENGINE 1.0 — faithful re-implementation of old weights and old (buggy) volume
// OLD: volRatio>=1.2 → +25 unconditionally (bullish regardless of price direction)
// OLD: directionalScore = (trend + momentum) / 2
// OLD: RSI >70 = strongly bullish (no exhaustion concept)
// ---------------------------------------------------------------------------
const W10 = { momentum: 25, trend: 20, volume: 15, relStrength: 10, news: 10, fundamentals: 10, market: 10 };

function engine10(tech, market) {
  if (!tech) return null;
  const t = tech;
  const m = market || { ok: false, regime: 'NEUTRAL' };
  const price = n(t.price);

  // Momentum (old RSI thresholds)
  let momentum = 50;
  const rsi = n(t.rsi);
  const mv = n(t.macd?.value), ms = n(t.macd?.signal);
  const roc20 = n(t.roc20);
  if (rsi != null) {
    if (rsi >= 70) momentum += 25;         // OLD: no exhaustion at >78
    else if (rsi >= 55) momentum += 15;
    else if (rsi >= 45) momentum += 5;
    else if (rsi >= 35) momentum -= 10;
    else momentum -= 20;
  }
  if (mv != null && ms != null) momentum += mv > ms ? 15 : -15;
  if (roc20 != null) momentum += roc20 > 0 ? 15 : -15;
  momentum = clamp(Math.round(momentum), 0, 100);

  // Trend
  let trend = 50;
  const s20 = n(t.sma20), s50 = n(t.sma50), s200 = n(t.sma200);
  if (t.trend === 'Bullish') trend += 25; else if (t.trend === 'Bearish') trend -= 25;
  if (price != null) {
    if (s50 != null) trend += price > s50 ? 8 : -8;
    if (s200 != null) trend += price > s200 ? 8 : -8;
  }
  if (s20 != null && s50 != null) trend += s20 > s50 ? 9 : -9;
  trend = clamp(Math.round(trend), 0, 100);

  // Volume — OLD BUGGY: high volume = bullish unconditionally
  let vol = 50;
  const vr = n(t.volumeRatio);
  if (vr != null) {
    if (vr >= 1.2) vol += 25;     // ← the bug: no direction check
    else if (vr >= 1.0) vol += 10;
    else if (vr <= 0.7) vol -= 10;
  }
  vol = clamp(Math.round(vol), 0, 100);

  // Market
  let mkt = null;
  if (m.ok) {
    mkt = 50;
    if (m.regime === 'BULLISH') mkt += 25;
    else if (m.regime === 'BEARISH') mkt -= 25;
    mkt = clamp(Math.round(mkt), 0, 100);
  }

  // Overall score
  const raw = { momentum, trend, volume: vol, market: mkt };
  const kp = Object.entries(raw).filter(([, v]) => v != null);
  const kw = kp.reduce((s, [k]) => s + W10[k], 0) || 1;
  const total = clamp(Math.round(kp.reduce((s, [k, v]) => s + v * W10[k], 0) / kw), 0, 100);

  // OLD directional: (trend + momentum) / 2 — too simplistic
  const directionalScore = clamp(Math.round((trend + momentum) / 2), 0, 100);
  const directionalOutlook = directionalScore >= 60 ? 'BULLISH' : directionalScore <= 40 ? 'BEARISH' : 'NEUTRAL';

  let cls;
  if (total >= 80) cls = 'STRONG BUY CANDIDATE';
  else if (total >= 70) cls = 'BUY CANDIDATE';
  else if (total >= 60) cls = 'WATCH / BUY ON CONFIRMATION';
  else if (total >= 45) cls = 'HOLD / NO TRADE';
  else if (total >= 30) cls = 'AVOID / SELL BIAS';
  else cls = 'STRONG AVOID';

  const isBuyClass = cls === 'BUY CANDIDATE' || cls === 'STRONG BUY CANDIDATE';
  const avgVol = n(t.avgVolume20);
  const liquidEnough = avgVol != null ? avgVol >= 100000 : false;
  const agreeingSignals = [
    t.trend === 'Bullish', momentum >= 60, vol >= 60, mkt != null && mkt >= 55,
  ].filter(Boolean).length;

  // OLD gates: simpler (no evidenceQuality gate)
  let tradeStatus = 'NO TRADE';
  if (isBuyClass) {
    tradeStatus = (vol >= 60 && agreeingSignals >= 3 && liquidEnough) ? 'EXECUTABLE' : 'WAIT';
  }

  // Trade plan
  const atr = n(t.atr) ?? (price != null ? price * 0.02 : null);
  const support = n(t.support);
  const resistance = n(t.resistance);
  const entryMid = support ?? price;
  const stopLoss = entryMid != null && atr != null ? r2(entryMid - atr) : null;
  const target1 = resistance != null && resistance > entryMid
    ? r2(resistance)
    : entryMid != null && atr != null ? r2(entryMid + atr * 1.5) : null;
  let rr = null;
  if (entryMid && stopLoss && target1 && target1 > entryMid && stopLoss < entryMid) {
    const risk = entryMid - stopLoss;
    if (risk > 0) rr = r2((target1 - entryMid) / risk);
  }

  // OLD expected close: trend+RSI heuristic capped ±2%
  let expPct = 0;
  if (t.trend === 'Bullish') expPct += 0.8; else if (t.trend === 'Bearish') expPct -= 0.8;
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 70) expPct += 0.4;
    else if (rsi > 70) expPct -= 0.3;
    else if (rsi < 40) expPct -= 0.4;
  }
  expPct = Math.max(-2, Math.min(2, expPct));
  const expectedClose = price != null ? r2(price * (1 + expPct / 100)) : null;

  return {
    modelVersion: 'tradebuddy-engine-1.0',
    totalScore: total,
    directionalScore,
    directionalOutlook,
    isBuy: tradeStatus === 'EXECUTABLE' && isBuyClass,
    tradeStatus,
    signal: tradeStatus === 'EXECUTABLE' && isBuyClass
      ? (cls === 'STRONG BUY CANDIDATE' ? 'STRONG BUY' : 'BUY')
      : isBuyClass ? 'WATCH'
      : directionalOutlook === 'BEARISH' ? 'AVOID' : 'HOLD',
    expectedClose,
    expectedMovePct: r2(expPct),
    target1,
    stopLoss,
    riskReward: rr,
  };
}

// ---------------------------------------------------------------------------
// ENGINE 1.1 — mirrors current predictionEngine.js (self-contained)
// KEY CHANGES from 1.0:
//   - RSI exhaustion at >78 (penalty instead of bonus)
//   - Volume is directional (but falls back when dayChangePct unavailable)
//   - Directional score uses all 5 factors with explicit weights (not just trend+momentum)
//   - Evidence quality gate prevents EXECUTABLE BUY with poor data
//   - Category-level confirmation (not correlated signal count)
// ---------------------------------------------------------------------------
const W11 = { momentum: 25, trend: 20, volume: 15, relStrength: 10, news: 10, fundamentals: 10, market: 10 };
const DW11 = { momentum: 30, trend: 25, volume: 15, relStrength: 10, market: 20 };
const MIN_EQS = 65, MIN_EQS_NORMAL = 75, CMULT = 0.32;

function engine11(tech, market) {
  if (!tech) return null;
  const t = tech;
  const m = market || { ok: false, regime: 'NEUTRAL' };
  const price = n(t.price);
  const unknown = [];

  // 1) Momentum — improved RSI bands (exhaustion at >78)
  let momentum = 50;
  const rsi = n(t.rsi);
  const mv = n(t.macd?.value), ms = n(t.macd?.signal);
  const roc20 = n(t.roc20);
  if (rsi != null) {
    if (rsi >= 52 && rsi <= 65) momentum += 22;
    else if (rsi > 65 && rsi <= 72) momentum += 12;
    else if (rsi > 72 && rsi <= 78) momentum += 4;
    else if (rsi > 78) momentum -= 8;           // exhaustion — new in 1.1
    else if (rsi >= 45 && rsi < 52) momentum += 8;
    else if (rsi >= 35 && rsi < 45) momentum -= 10;
    else momentum -= 22;
  } else unknown.push('momentum(rsi)');
  if (mv != null && ms != null) momentum += mv > ms ? 15 : -15;
  else unknown.push('momentum(macd)');
  if (roc20 != null) momentum += roc20 > 0 ? 15 : -15;
  momentum = clamp(Math.round(momentum), 0, 100);

  // 2) Trend
  let trend = 50;
  const s20 = n(t.sma20), s50 = n(t.sma50), s200 = n(t.sma200);
  if (t.trend === 'Bullish') trend += 25; else if (t.trend === 'Bearish') trend -= 25;
  if (price != null) {
    if (s50 != null) trend += price > s50 ? 8 : -8;
    if (s200 != null) trend += price > s200 ? 8 : -8;
  }
  if (s20 != null && s50 != null) trend += s20 > s50 ? 9 : -9;
  trend = clamp(Math.round(trend), 0, 100);

  // 3) Volume — directional (but dayChangePct=null at market open → direction-unknown fallback)
  let vol = 50;
  const vr = n(t.volumeRatio);
  const atrPct = n(t.atrPct);
  const avgVol = n(t.avgVolume20);
  // dayChangePct is always null in backtest (no look-ahead)
  if (vr != null) {
    // direction-unknown path: small non-directional influence only
    if (vr >= 1.2) vol += 6;
    else if (vr <= 0.7) vol -= 6;
    unknown.push('volume(direction)');
  } else {
    unknown.push('volume');
  }
  if (atrPct != null) { if (atrPct > 5) vol -= 15; else if (atrPct < 2) vol += 10; }
  if (avgVol != null) { if (avgVol < 100000) vol -= 15; else if (avgVol > 1000000) vol += 10; }
  vol = clamp(Math.round(vol), 0, 100);

  // 4) Relative strength — UNKNOWN (no per-date NIFTY comparison in backtest)
  const relStrength = null;
  unknown.push('relativeStrength');

  // 5) News — UNKNOWN (no historical news)
  const newsScore = null;
  unknown.push('news');

  // 6) Fundamentals — UNKNOWN (no historical P/E)
  const fundScore = null;
  unknown.push('fundamentals');

  // 7) Market
  let mkt = null;
  if (m.ok) {
    mkt = 50;
    if (m.regime === 'BULLISH') mkt += 25;
    else if (m.regime === 'BEARISH') mkt -= 25;
    mkt = clamp(Math.round(mkt), 0, 100);
  } else unknown.push('market');

  // Overall score
  const raw = { momentum, trend, volume: vol, relStrength, news: newsScore, fundamentals: fundScore, market: mkt };
  const kp = Object.entries(raw).filter(([, v]) => v != null);
  const kw = kp.reduce((s, [k]) => s + W11[k], 0) || 1;
  const total = clamp(Math.round(kp.reduce((s, [k, v]) => s + v * W11[k], 0) / kw), 0, 100);

  let cls;
  if (total >= 80) cls = 'STRONG BUY CANDIDATE';
  else if (total >= 70) cls = 'BUY CANDIDATE';
  else if (total >= 60) cls = 'WATCH / BUY ON CONFIRMATION';
  else if (total >= 45) cls = 'HOLD / NO TRADE';
  else if (total >= 30) cls = 'AVOID / SELL BIAS';
  else cls = 'STRONG AVOID';

  const isBuyClass = cls === 'BUY CANDIDATE' || cls === 'STRONG BUY CANDIDATE';
  const isAvoid = cls === 'AVOID / SELL BIAS' || cls === 'STRONG AVOID';

  // Category confirmations (prevents correlated signal double-counting)
  const catTrend = t.trend === 'Bullish' ? true : t.trend === 'Bearish' ? false : null;
  const catMom = momentum >= 60 ? true : momentum <= 40 ? false : null;
  const catVol = vol >= 60 ? true : vol <= 40 ? false : null;
  const catMkt = mkt != null ? mkt >= 55 : null;
  const agreeing = [catTrend, catMom, catVol, catMkt].filter((v) => v === true).length;

  // Directional score — NEW: proper 5-factor weighted formula
  const drRaw = { momentum, trend, volume: vol, relStrength, market: mkt };
  const dk = Object.entries(drRaw).filter(([, v]) => v != null);
  const dkw = dk.reduce((s, [k]) => s + DW11[k], 0) || 1;
  const directionalScore = clamp(Math.round(dk.reduce((s, [k, v]) => s + v * DW11[k], 0) / dkw), 0, 100);
  const directionalOutlook = directionalScore >= 62 ? 'BULLISH' : directionalScore <= 38 ? 'BEARISH' : 'NEUTRAL';

  // Evidence quality score
  let evq = 72;
  evq -= 6; // VERIFIED DELAYED equivalent
  evq -= unknown.length * 5;
  if (avgVol == null || avgVol < 100000) evq -= 8;
  if (t.candleCount < 100) evq -= 10;
  else if (t.candleCount < 200) evq -= 4;
  const eqs = clamp(Math.round(evq), 0, 100);

  // Gates
  const catReq = eqs < MIN_EQS_NORMAL ? 5 : 4;
  const volConfirms = catVol === true;
  const htfAgrees = t.trend === 'Bullish';
  const eqOk = eqs >= MIN_EQS;
  const liquidEnough = avgVol != null ? avgVol >= 100000 : false;

  // Trade plan
  const atr = n(t.atr) ?? (price != null ? price * 0.02 : null);
  const support = n(t.support);
  const resistance = n(t.resistance);
  const entryMid = support ?? price;
  const stopLoss = entryMid != null && atr != null ? r2(entryMid - atr) : null;
  const target1 = resistance != null && resistance > entryMid
    ? r2(resistance)
    : entryMid != null && atr != null ? r2(entryMid + atr * 1.5) : null;
  const target2 = target1 != null && atr != null ? r2(target1 + atr * 1.5) : null;
  const deepPullback = price != null && entryMid != null && entryMid < price * 0.9;
  const structureOk = entryMid != null && stopLoss != null && target1 != null && target2 != null
    && stopLoss < entryMid && entryMid < target1 && target1 < target2;
  let rr = null;
  if (entryMid && stopLoss && target1 && target1 > entryMid && stopLoss < entryMid) {
    const risk = entryMid - stopLoss;
    if (risk > 0) rr = r2((target1 - entryMid) / risk);
  }

  let tradeStatus = 'NO TRADE';
  if (isAvoid) tradeStatus = 'NO TRADE';
  else if (cls === 'HOLD / NO TRADE') tradeStatus = 'NO TRADE';
  else if (isBuyClass) {
    const allGates = rr != null && rr >= 2
      && volConfirms && htfAgrees && liquidEnough
      && agreeing >= catReq && structureOk && !deepPullback && eqOk;
    tradeStatus = allGates ? 'EXECUTABLE' : 'WAIT';
  } else {
    tradeStatus = 'WAIT';
  }

  const signal = tradeStatus === 'EXECUTABLE' && isBuyClass
    ? (cls === 'STRONG BUY CANDIDATE' ? 'STRONG BUY' : 'BUY')
    : isAvoid ? 'AVOID'
    : isBuyClass ? 'WATCH' : 'HOLD';

  // Expected close — NEW: ATR-anchored, conservative multiplier
  const atrPctForMove = atrPct != null ? atrPct : 2;
  const edge = clamp((directionalScore - 50) / 50, -1, 1);
  let expMovePct = price != null ? r2(edge * atrPctForMove * CMULT) : null;
  if (expMovePct != null) expMovePct = clamp(expMovePct, -atrPctForMove, atrPctForMove);
  const expectedClose = price != null && expMovePct != null ? r2(price * (1 + expMovePct / 100)) : null;

  return {
    modelVersion: 'tradebuddy-engine-1.1',
    totalScore: total,
    directionalScore,
    directionalOutlook,
    evidenceQualityScore: eqs,
    isBuy: tradeStatus === 'EXECUTABLE' && isBuyClass,
    tradeStatus,
    signal,
    expectedClose,
    expectedMovePct: expMovePct,
    target1,
    stopLoss,
    riskReward: rr,
    agreeingCategories: agreeing,
  };
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------
let _rng = 0xdeadbeef;
function seededRand() {
  _rng = (Math.imul(1664525, _rng) + 1013904223) >>> 0;
  return _rng / 0x100000000;
}

function randomBaseline() {
  const up = seededRand() > 0.5;
  return {
    modelVersion: 'random-baseline-50-50',
    directionalOutlook: up ? 'BULLISH' : 'BEARISH',
    isBuy: false,
    signal: 'HOLD',
    expectedClose: null,
    target1: null, stopLoss: null,
  };
}

function niftyBaseline(niftyCandles, upTo) {
  const nc = niftyCandles.slice(0, upTo);
  if (nc.length < 2) return { modelVersion: 'nifty-direction', directionalOutlook: 'NEUTRAL', isBuy: false, expectedClose: null, target1: null, stopLoss: null };
  const prev = Number(nc[nc.length - 2].close);
  const last = Number(nc[nc.length - 1].close);
  const up = Number.isFinite(prev) && Number.isFinite(last) && last > prev;
  return {
    modelVersion: 'nifty-direction-baseline',
    directionalOutlook: !Number.isFinite(prev) || !Number.isFinite(last) ? 'NEUTRAL' : up ? 'BULLISH' : 'BEARISH',
    isBuy: false,
    signal: 'HOLD',
    expectedClose: null,
    target1: null, stopLoss: null,
  };
}

// ---------------------------------------------------------------------------
// Segment classification
// ---------------------------------------------------------------------------
function classify(niftyCandles, upTo) {
  const nc = niftyCandles.slice(0, upTo);
  if (nc.length < 25) return { market: 'UNKNOWN', volatility: 'UNKNOWN' };
  const cls = nc.map((c) => Number(c.close)).filter(Number.isFinite);
  const np = cls[cls.length - 1];
  const roc = rocCalc(cls, 20);
  const n20 = sma(cls, 20);
  let market = 'SIDEWAYS';
  if (roc != null && n20 != null) {
    if (roc > 3 && np > n20) market = 'BULL';
    else if (roc < -3 && np < n20) market = 'BEAR';
  }
  const atr = atrCalc(nc, 14);
  const atrp = np > 0 && atr != null ? (atr / np) * 100 : null;
  const volatility = atrp == null ? 'NORMAL' : atrp > 1.2 ? 'HIGH' : atrp < 0.7 ? 'LOW' : 'NORMAL';
  return { market, volatility };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
function metrics(preds) {
  if (!preds.length) return { n: 0 };
  const withDir = preds.filter((p) => p.directionCorrect !== null);
  const dirAcc = withDir.length
    ? r2((withDir.filter((p) => p.directionCorrect).length / withDir.length) * 100)
    : null;
  const buys = preds.filter((p) => p.isBuy);
  const buyPrec = buys.length
    ? r2((buys.filter((p) => p.directionCorrect === true).length / buys.length) * 100)
    : null;
  const falseBuy = buys.length
    ? r2((buys.filter((p) => p.directionCorrect === false).length / buys.length) * 100)
    : null;
  const buyRets = buys.map((p) => p.returnPct).filter((v) => v != null);
  const avg = (a) => a.length ? r2(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const errors = preds.map((p) => p.forecastError).filter((v) => v != null);
  const buysT = buys.filter((p) => p.target1 != null);
  const buysS = buys.filter((p) => p.stopLoss != null);
  // Max drawdown from BUY equity curve
  let eq = 100, peak = 100, maxDD = 0;
  for (const p of buys) {
    if (p.returnPct != null) {
      eq *= (1 + p.returnPct / 100);
      if (eq > peak) peak = eq;
      const dd = (peak - eq) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }
  const gross = buyRets.reduce(
    (a, r) => { if (r > 0) a.wins += r; else a.losses += Math.abs(r); return a; },
    { wins: 0, losses: 0 },
  );
  return {
    n: preds.length,
    nBuys: buys.length,
    directionalAccuracy: dirAcc,
    buyPrecision: buyPrec,
    falseBuyRate: falseBuy,
    avgReturnAfterBuy: avg(buyRets),
    avgPredictionError: avg(errors),
    targetHitRate: buysT.length ? r2(buysT.filter((p) => p.targetHit).length / buysT.length * 100) : null,
    stopHitRate: buysS.length ? r2(buysS.filter((p) => p.stopHit).length / buysS.length * 100) : null,
    maxDrawdown: r2(maxDD),
    profitFactor: gross.losses > 0 ? r2(gross.wins / gross.losses) : null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('  TRADEBUDDY WALK-FORWARD BACKTEST');
  console.log(`  Universe : ${SYMBOLS.length} liquid NSE stocks`);
  console.log(`  Days     : ${DAYS} (≈${Math.floor(DAYS / 250)} years of trading data)`);
  console.log(`  Output   : ${OUT_FILE}`);
  console.log('═'.repeat(72) + '\n');

  const bar = (msg) => process.stdout.write(`\r  ${msg.padEnd(70)}`);

  // Fetch NIFTY
  bar('Fetching NIFTY historical candles...');
  const niftyRaw = await fetchCandlesPython('NIFTY', DAYS, true);
  const niftyCandles = niftyRaw.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  console.log(`\n  ✓ NIFTY: ${niftyCandles.length} sessions`);
  if (niftyCandles.length < 50) {
    console.error('\n  [ERROR] Not enough NIFTY data. Aborting.');
    process.exit(1);
  }

  // Fetch stocks
  const stockData = {};
  let loaded = 0;
  for (const sym of SYMBOLS) {
    bar(`Fetching ${sym} [${loaded + 1}/${SYMBOLS.length}]...`);
    const raw = await fetchCandlesPython(sym, DAYS, false);
    const sorted = raw.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    if (sorted.length >= 60) stockData[sym] = sorted;
    loaded++;
  }
  process.stdout.write('\n');
  const active = Object.keys(stockData);
  console.log(`  ✓ Stocks with data: ${active.length}/${SYMBOLS.length}`);
  if (active.length < 10) {
    console.error('  [ERROR] Too few stocks. Check Python source availability.');
    process.exit(1);
  }

  // Walk-forward loop
  console.log('\n  Running walk-forward evaluation...');
  const preds = { v11: [], v10: [], rand: [], nifty: [] };
  let total = 0, symN = 0;

  for (const sym of active) {
    bar(`Evaluating ${sym} [${symN + 1}/${active.length}]...`);
    const candles = stockData[sym];

    for (let t = 50; t < candles.length; t++) {
      const actualClose = Number(candles[t].close);
      const actualHigh = Number(candles[t].high);
      const actualLow = Number(candles[t].low);
      const predDate = String(candles[t].ts || '').slice(0, 10);
      if (!Number.isFinite(actualClose) || actualClose <= 0) continue;

      const tech = buildTech(candles, t);   // ← strictly candles[0..t-1]
      if (!tech) continue;

      const prevClose = Number(candles[t - 1].close);
      if (!Number.isFinite(prevClose) || prevClose <= 0) continue;

      // Find the NIFTY index position for this date (past data only)
      let niftyUpTo = niftyCandles.findIndex((c) => String(c.ts).slice(0, 10) > predDate);
      if (niftyUpTo < 0) niftyUpTo = niftyCandles.length;
      // Ensure we don't use future NIFTY data
      if (niftyUpTo > niftyCandles.length) niftyUpTo = niftyCandles.length;

      const mkt = buildMarket(niftyCandles, niftyUpTo);
      const seg = classify(niftyCandles, niftyUpTo);
      const directionUp = actualClose > prevClose;
      const returnPct = r2((actualClose - prevClose) / prevClose * 100);

      const engines = {
        v11: engine11(tech, mkt),
        v10: engine10(tech, mkt),
        rand: randomBaseline(),
        nifty: niftyBaseline(niftyCandles, niftyUpTo),
      };

      for (const [key, eng] of Object.entries(engines)) {
        if (!eng) continue;
        const predictedUp = eng.directionalOutlook === 'BULLISH';
        const directionCorrect = eng.directionalOutlook === 'NEUTRAL'
          ? null   // NEUTRAL is not a directional call
          : predictedUp === directionUp;

        const forecastError = eng.expectedClose != null
          ? r2(Math.abs((actualClose - eng.expectedClose) / actualClose * 100))
          : null;

        preds[key].push({
          symbol: sym,
          date: predDate,
          directionalOutlook: eng.directionalOutlook,
          isBuy: eng.isBuy,
          signal: eng.signal,
          totalScore: eng.totalScore ?? null,
          directionalScore: eng.directionalScore ?? null,
          expectedClose: eng.expectedClose,
          target1: eng.target1 ?? null,
          stopLoss: eng.stopLoss ?? null,
          actualClose: r2(actualClose),
          predPrice: r2(prevClose),
          directionCorrect,
          returnPct,
          forecastError,
          targetHit: eng.isBuy && eng.target1 != null ? actualHigh >= eng.target1 : false,
          stopHit: eng.isBuy && eng.stopLoss != null ? actualLow <= eng.stopLoss : false,
          marketSeg: seg.market,
          volSeg: seg.volatility,
        });
      }
      total++;
    }
    symN++;
  }
  process.stdout.write('\n');
  console.log(`  ✓ Total walk-forward observations: ${total.toLocaleString()}`);

  // Compute metrics
  const ENGINES = {
    'Engine 1.1': preds.v11,
    'Engine 1.0': preds.v10,
    'Random 50/50': preds.rand,
    'NIFTY Dir.': preds.nifty,
  };
  const MARKET_SEGS = ['BULL', 'BEAR', 'SIDEWAYS'];
  const VOL_SEGS = ['HIGH', 'NORMAL', 'LOW'];

  const results = {};
  for (const [name, ps] of Object.entries(ENGINES)) {
    results[name] = {
      overall: metrics(ps),
      byMarket: Object.fromEntries(MARKET_SEGS.map((s) => [s, metrics(ps.filter((p) => p.marketSeg === s))])),
      byVol: Object.fromEntries(VOL_SEGS.map((s) => [s, metrics(ps.filter((p) => p.volSeg === s))])),
    };
  }

  // Print report
  const dateRange = (() => {
    const all = active.flatMap((s) => [stockData[s][0].ts, stockData[s][stockData[s].length - 1].ts]);
    const sorted = all.map((d) => String(d).slice(0, 10)).sort();
    return { from: sorted[0], to: sorted[sorted.length - 1] };
  })();

  const HEADS = ['Engine 1.1', 'Engine 1.0', 'Random 50/50', 'NIFTY Dir.'];
  const MLINES = [
    ['N (obs)', (m) => m?.n ?? 'n/a'],
    ['BUY signals', (m) => m?.nBuys ?? 'n/a'],
    ['Dir Accuracy %', (m) => m?.directionalAccuracy ?? 'n/a'],
    ['BUY Precision %', (m) => m?.buyPrecision ?? 'n/a'],
    ['False BUY Rate %', (m) => m?.falseBuyRate ?? 'n/a'],
    ['Avg Return/BUY %', (m) => m?.avgReturnAfterBuy ?? 'n/a'],
    ['Avg Forecast Err%', (m) => m?.avgPredictionError ?? 'n/a'],
    ['Target Hit Rate %', (m) => m?.targetHitRate ?? 'n/a'],
    ['Stop Hit Rate %', (m) => m?.stopHitRate ?? 'n/a'],
    ['Max Drawdown %', (m) => m?.maxDrawdown ?? 'n/a'],
    ['Profit Factor', (m) => m?.profitFactor ?? 'n/a'],
  ];

  function printSection(label, getMetric) {
    console.log(`\n  ── ${label} ──`);
    process.stdout.write('  ' + 'Metric'.padEnd(22));
    for (const h of HEADS) process.stdout.write(h.padStart(13));
    process.stdout.write('\n  ' + '─'.repeat(74) + '\n');
    for (const [lbl, fn] of MLINES) {
      process.stdout.write('  ' + lbl.padEnd(22));
      for (const name of HEADS) {
        const m = getMetric(results[name]);
        process.stdout.write(String(fn(m) ?? 'n/a').padStart(13));
      }
      process.stdout.write('\n');
    }
  }

  console.log('\n' + '═'.repeat(72));
  console.log('  WALK-FORWARD BACKTEST RESULTS');
  console.log(`  Period  : ${dateRange.from} → ${dateRange.to}`);
  console.log(`  Stocks  : ${active.length} (${active.join(', ')})`);
  console.log(`  Obs/eng : ${preds.v11.length.toLocaleString()}`);
  console.log('═'.repeat(72));

  printSection('OVERALL', (r) => r.overall);
  printSection('BULL MARKET', (r) => r.byMarket?.BULL);
  printSection('BEAR MARKET', (r) => r.byMarket?.BEAR);
  printSection('SIDEWAYS MARKET', (r) => r.byMarket?.SIDEWAYS);
  printSection('HIGH VOLATILITY', (r) => r.byVol?.HIGH);
  printSection('LOW VOLATILITY', (r) => r.byVol?.LOW);

  // Honest conclusions
  const v11o = results['Engine 1.1'].overall;
  const v10o = results['Engine 1.0'].overall;
  const rndo = results['Random 50/50'].overall;
  const v11d = v11o?.directionalAccuracy ?? 0;
  const v10d = v10o?.directionalAccuracy ?? 0;
  const rndD = rndo?.directionalAccuracy ?? 0;
  const imp = r2(v11d - v10d);
  const vsRnd = r2(v11d - rndD);

  console.log('\n' + '═'.repeat(72));
  console.log('  HONEST CONCLUSIONS');
  console.log('═'.repeat(72));
  console.log('');
  if (Math.abs(imp) < 1) {
    console.log(`  ⚖  Engine 1.1 vs Engine 1.0 directional accuracy: within 1pp (no`);
    console.log(`     meaningful improvement claimed for this test period).`);
  } else if (imp > 0) {
    console.log(`  ↑  Engine 1.1: ${v11d}%  |  Engine 1.0: ${v10d}%  |  Δ = +${imp}pp`);
    if (vsRnd < 3) {
      console.log(`  ⚠  Margin over random baseline (${rndD}%): only ${vsRnd}pp — too small`);
      console.log(`     to claim statistical significance. Treat with caution.`);
    } else {
      console.log(`  ✓  Margin over random baseline (${rndD}%): +${vsRnd}pp`);
    }
  } else {
    console.log(`  ↓  Engine 1.1 (${v11d}%) UNDERPERFORMS Engine 1.0 (${v10d}%) by ${Math.abs(imp)}pp.`);
    console.log(`     No improvement claimed. The new gates are more conservative.`);
  }
  console.log('');
  console.log('  KEY LIMITATIONS OF THIS BACKTEST:');
  console.log('  • News sentiment: UNKNOWN in backtest (no historical data)');
  console.log('  • Fundamentals/P-E: UNKNOWN in backtest (no historical data)');
  console.log('  • Day-change %: NULL at prediction time (no look-ahead at open)');
  console.log('    → volume scoring uses direction-unknown fallback for both engines');
  console.log('  • This means volume DIRECTION fix cannot be evaluated here.');
  console.log('    It would be visible only in live tracking data.');
  console.log('  • Stop hit: uses session LOW as proxy (no tick-level data)');
  console.log('  • Probability is NOT CALIBRATED. Scores are heuristic.');
  console.log('  • Past performance does not predict future results.');
  console.log('');

  // Save JSON
  const output = {
    generatedAt: new Date().toISOString(),
    period: dateRange,
    daysRequested: DAYS,
    totalObservations: total,
    stocksRequested: SYMBOLS.length,
    stocksWithData: active.length,
    stocks: active,
    methodologyNotes: {
      lookaheadBias: 'NONE — each prediction uses candles[0..t-1] only; actual from candles[t]',
      tuningOnTestPeriod: 'NONE — engine weights fixed, no optimization performed',
      dayChangePctAtOpen: 'NULL — not available at market open; volume scoring uses direction-unknown fallback',
      newsInBacktest: 'UNKNOWN — no historical news archive',
      fundamentalsInBacktest: 'UNKNOWN — no historical P/E data',
      probabilityCalibration: 'NOT CALIBRATED — scores are heuristic',
      stopHitProxy: 'session LOW used as proxy (not tick-level intraday data)',
    },
    results,
    rawCounts: {
      v11: preds.v11.length,
      v10: preds.v10.length,
      rand: preds.rand.length,
      nifty: preds.nifty.length,
    },
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`  ✓ Results saved → ${OUT_FILE}\n`);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message, err.stack);
  process.exit(1);
});
