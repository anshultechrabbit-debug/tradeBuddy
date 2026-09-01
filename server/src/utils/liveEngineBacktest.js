/**
 * Walk-forward backtest of the ACTUAL LIVE engine — buildEngineResult() in
 * predictionEngine.js, the same function stockAnalysisService.js calls for
 * every AI Picks prediction. The existing backtestEngine.js in this
 * directory never calls buildEngineResult() at all (it tests V2/V3, which
 * are backtest-only tooling, plus a hand-reimplemented copy of old v1.0/v1.1
 * math) — so it cannot answer "is the live engine's prediction accurate".
 * This script builds the same `technical`/`market` shape
 * stockAnalysisService.js builds (from real historical OHLCV, walking one
 * day at a time), feeds it through the real buildEngineResult(), and scores
 * the result against what actually happened the next session.
 *
 * News/valuation are marked unavailable — point-in-time historical
 * news/fundamentals aren't available here, so pretending otherwise would
 * fabricate evidence the backtest doesn't actually have.
 */
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { sma, ema, rsi, atr, roc } from '../services/radar/indicators.js';
import { buildEngineResult } from '../services/predictionEngine.js';
import { round2 } from './helpers.js';

const BACKTEST_SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'TATAMOTORS', 'SBIN', 'BHARTIARTL', 'ITC', 'LICI',
];

// Mirrors stockAnalysisService.js's gatherTechnical() math exactly (same
// sma/ema/rsi/atr functions, same MACD hand-rolled EMA12/26, same S/R
// candidate logic) so this backtest exercises the real production formula,
// not a simplified stand-in.
function buildTechnicalFromWindow(windowCandles) {
  const candles = windowCandles;
  const closes = candles.map((c) => Number(c.close));
  const price = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s100 = sma(closes, 100);
  const s200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);

  let e12 = closes[0];
  let e26 = closes[0];
  const macdLine = [];
  for (const c of closes) {
    e12 = c * (2 / 13) + e12 * (1 - 2 / 13);
    e26 = c * (2 / 27) + e26 * (1 - 2 / 27);
    macdLine.push(e12 - e26);
  }
  const macdValue = closes.length >= 26 ? macdLine[macdLine.length - 1] : null;
  const macdSignal = closes.length >= 26 ? ema(macdLine, 9) : null;

  const recent = candles.slice(-20);
  const low20 = Math.min(...recent.map((c) => Number(c.low)));
  const high20 = Math.max(...recent.map((c) => Number(c.high)));
  const high52w = Math.max(...candles.map((c) => Number(c.high)));
  const low52w = Math.min(...candles.map((c) => Number(c.low)));

  const vol20 = candles.slice(-20).map((c) => Number(c.volume) || 0);
  const avgVol20 = vol20.length ? vol20.reduce((a, b) => a + b, 0) / vol20.length : 0;
  const vol50 = candles.slice(-50).map((c) => Number(c.volume) || 0);
  const avgVol50 = vol50.length >= 50 ? vol50.reduce((a, b) => a + b, 0) / vol50.length : null;
  const lastVol = Number(candles[candles.length - 1].volume) || 0;
  const volRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;
  const volumeSpike = avgVol20 > 0 && lastVol >= avgVol20 * 2;

  const supportCandidates = [low20, s50, low52w].filter((v) => v != null && v < price);
  const primarySupport = supportCandidates.length ? Math.max(...supportCandidates) : low52w;
  const resistanceCandidates = [high20, s200, high52w].filter((v) => v != null && v > price);
  const primaryResistance = resistanceCandidates.length ? Math.min(...resistanceCandidates) : high52w;

  const atrPct = price > 0 && atr14 != null ? (atr14 / price) * 100 : null;

  let trend = 'Neutral';
  if (s50 != null) {
    if (price > s50 && s20 > s50) trend = 'Bullish';
    else if (price < s50 && s20 < s50) trend = 'Bearish';
  }

  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const changePct = prevClose != null && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;

  return {
    price,
    changePct,
    technical: {
      stale: false,
      trend,
      rsi: rsi14 == null ? null : round2(rsi14),
      macd: { value: macdValue == null ? null : round2(macdValue), signal: macdSignal == null ? null : round2(macdSignal) },
      sma20: s20 == null ? null : round2(s20),
      sma50: s50 == null ? null : round2(s50),
      sma100: s100 == null ? null : round2(s100),
      sma200: s200 == null ? null : round2(s200),
      roc10: round2(roc(closes, 10)),
      roc20: round2(roc(closes, 20)),
      roc5: round2(roc(closes, 5)),
      volume: lastVol,
      avgVolume20: avgVol20,
      avgVolume50: avgVol50,
      volumeRatio: round2(volRatio),
      volumeSpike,
      atr: atr14 == null ? null : round2(atr14),
      atrPct: atrPct == null ? null : round2(atrPct),
      support: round2(primarySupport),
      resistance: round2(primaryResistance),
      candleCount: closes.length,
    },
  };
}

function buildMarketFromWindow(niftyWindowCloses, techRoc20) {
  if (niftyWindowCloses.length < 51) return { ok: false };
  const niftySma20 = sma(niftyWindowCloses, 20);
  const niftySma50 = sma(niftyWindowCloses, 50);
  const niftyPrice = niftyWindowCloses[niftyWindowCloses.length - 1];
  const niftyRoc20 = roc(niftyWindowCloses, 20);
  let regime = 'NEUTRAL';
  if (niftySma20 != null && niftySma50 != null) {
    if (niftyPrice > niftySma20 && niftyPrice > niftySma50) regime = 'BULLISH';
    else if (niftyPrice < niftySma20 && niftyPrice < niftySma50) regime = 'BEARISH';
  }
  const relativeStrength = techRoc20 != null && niftyRoc20 != null ? round2(techRoc20 - niftyRoc20) : null;
  return { ok: true, regime, relativeStrength };
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export async function runLiveEngineBacktest() {
  const provider = getMarketDataProvider();
  console.log('LIVE_ENGINE_BACKTEST_START');

  const niftyCandles = await provider.getCandles('NIFTY', '1d', 280, 'NSE').catch(() => []);
  const niftyCloses = niftyCandles.map((c) => Number(c.close)).filter(Number.isFinite);

  const naive = { absErrPct: [], count: 0 };
  const live = {
    absErrPct: [], sqErr: [], count: 0,
    dirCalls: 0, dirCorrect: 0, neutralCalls: 0,
    inRange: 0, widthsPct: [],
    bySignal: {},
  };
  const perStock = {};

  for (const symbol of BACKTEST_SYMBOLS) {
    const candles = await provider.getCandles(symbol, '1d', 280, 'NSE').catch(() => []);
    if (!candles || candles.length < 210) {
      console.log(`  skip ${symbol}: only ${candles?.length ?? 0} candles (need 210+ for SMA200 warm-up)`);
      continue;
    }
    perStock[symbol] = { count: 0, dirCorrect: 0, dirCalls: 0, absErrPct: [] };

    // Start at 205 so SMA200 (the deepest lookback used) always has real
    // history behind it — matches how gatherTechnical never gets a
    // fabricated SMA200 reading in production either.
    for (let t = 205; t < candles.length - 1; t += 1) {
      const windowCandles = candles.slice(0, t + 1);
      const windowCloses = windowCandles.map((c) => Number(c.close));
      const { price, changePct, technical } = buildTechnicalFromWindow(windowCandles);
      const actualNextClose = Number(candles[t + 1].close);
      const actualDir = actualNextClose >= price ? 'BULLISH' : 'BEARISH';

      // Align Nifty's window to the same trading-day offset from "today" as
      // the stock's window (same assumption the app's own relative-strength/
      // beta code already makes: both are NSE daily closes on the same
      // calendar). Falls back to unavailable if Nifty history is shorter.
      const niftyOffsetFromEnd = candles.length - 1 - t;
      const niftyEndIdx = niftyCloses.length - 1 - niftyOffsetFromEnd;
      const niftyWindow = niftyEndIdx >= 0 ? niftyCloses.slice(0, niftyEndIdx + 1) : [];
      const market = buildMarketFromWindow(niftyWindow, technical.roc20);

      const a = {
        price,
        dataTimestamp: new Date().toISOString(),
        dataStatus: 'VERIFIED',
        quote: { lastPrice: price, changePct, source: 'jugaad', stale: false },
        technical,
        market,
        valuation: { available: false },
        news: { available: false },
        entry: {},
        _candles: windowCandles,
        _closes: windowCloses,
        _niftyCloses: niftyWindow,
      };

      let res;
      try {
        res = buildEngineResult(a);
      } catch (err) {
        console.log(`  ERROR ${symbol} t=${t}: ${err.message}`);
        continue;
      }

      // Naive baseline: "tomorrow's close = today's close" (the standard
      // random-walk baseline for next-session prediction).
      naive.absErrPct.push((Math.abs(price - actualNextClose) / actualNextClose) * 100);
      naive.count += 1;

      const base = res.closingRange.base;
      if (base != null) {
        const errPct = (Math.abs(base - actualNextClose) / actualNextClose) * 100;
        live.absErrPct.push(errPct);
        live.sqErr.push((base - actualNextClose) ** 2);
        live.count += 1;
        perStock[symbol].absErrPct.push(errPct);
      }

      if (res.directionalOutlook !== 'NEUTRAL') {
        live.dirCalls += 1;
        perStock[symbol].dirCalls += 1;
        if (res.directionalOutlook === actualDir) {
          live.dirCorrect += 1;
          perStock[symbol].dirCorrect += 1;
        }
      } else {
        live.neutralCalls += 1;
      }
      perStock[symbol].count += 1;

      const { bear, bull } = res.closingRange;
      if (bear != null && bull != null) {
        if (actualNextClose >= bear && actualNextClose <= bull) live.inRange += 1;
        live.widthsPct.push(((bull - bear) / price) * 100);
      }

      const sig = res.signal;
      if (!live.bySignal[sig]) live.bySignal[sig] = { count: 0, dirCorrect: 0, dirCalls: 0 };
      live.bySignal[sig].count += 1;
      if (res.directionalOutlook !== 'NEUTRAL') {
        live.bySignal[sig].dirCalls += 1;
        if (res.directionalOutlook === actualDir) live.bySignal[sig].dirCorrect += 1;
      }
    }
  }

  const report = {
    totalSessionsTested: live.count,
    naiveBaseline_TodayClose: {
      maePct: round2(avg(naive.absErrPct)),
      medianAbsErrPct: round2(median(naive.absErrPct)),
    },
    liveEngine_buildEngineResult: {
      maePct: round2(avg(live.absErrPct)),
      medianAbsErrPct: round2(median(live.absErrPct)),
      rmse: round2(Math.sqrt(avg(live.sqErr))),
      directionalCallsMade: live.dirCalls,
      directionalCallsSkippedAsNeutral: live.neutralCalls,
      directionalAccuracyPct: live.dirCalls ? round2((live.dirCorrect / live.dirCalls) * 100) : null,
      rangeCoveragePct: live.count ? round2((live.inRange / live.count) * 100) : null,
      avgRangeWidthPct: round2(avg(live.widthsPct)),
    },
    bySignalType: Object.fromEntries(
      Object.entries(live.bySignal).map(([sig, s]) => [
        sig,
        {
          count: s.count,
          directionalAccuracyPct: s.dirCalls ? round2((s.dirCorrect / s.dirCalls) * 100) : null,
        },
      ]),
    ),
    perStock: Object.fromEntries(
      Object.entries(perStock).map(([sym, s]) => [
        sym,
        {
          sessions: s.count,
          maePct: round2(avg(s.absErrPct)),
          directionalAccuracyPct: s.dirCalls ? round2((s.dirCorrect / s.dirCalls) * 100) : null,
        },
      ]),
    ),
  };

  console.log(JSON.stringify(report, null, 2));
  console.log('LIVE_ENGINE_BACKTEST_END');
  return report;
}

runLiveEngineBacktest();
