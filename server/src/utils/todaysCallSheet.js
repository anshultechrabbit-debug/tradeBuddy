/**
 * One-shot "today's call sheet" — runs the REAL production path
 * (gatherTechnical/gatherMarket from stockAnalysisService.js, then
 * buildEngineResult from predictionEngine.js — the exact functions
 * analyzeStock() uses) against live quotes + real candle history for a
 * fixed watchlist, THEN records each result into the real predictionTracker
 * (recordFromAnalysis) so it's an actual frozen, gradeable snapshot in
 * src/data/predictions.json — not just console output that vanishes.
 * `hasPredictionFor` dedupes: re-running this later today won't overwrite
 * today's first recorded snapshot per symbol.
 * News/valuation are marked unavailable (the slower per-symbol pipeline
 * isn't run here) — same honest-UNKNOWN handling buildEngineResult already
 * applies everywhere else.
 */
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { gatherTechnical, gatherMarket } from '../services/stockAnalysisService.js';
import { buildEngineResult } from '../services/predictionEngine.js';
import { recordFromAnalysis, hasPredictionFor } from '../services/predictionTracker.js';
import { dayKey } from '../services/officialClose.js';
import { round2 } from './helpers.js';

const WATCHLIST = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'BHARTIARTL', 'ITC', 'HINDUNILVR', 'KOTAKBANK',
  'AXISBANK', 'LT', 'MARUTI', 'SUNPHARMA', 'TITAN',
  'ULTRACEMCO', 'BAJFINANCE', 'ASIANPAINT', 'WIPRO', 'HCLTECH',
];

async function run() {
  const provider = getMarketDataProvider();
  const rows = [];

  for (const symbol of WATCHLIST) {
    const tech = await gatherTechnical(provider, symbol).catch((err) => ({ ok: false, error: err.message }));
    if (!tech.ok) {
      rows.push({ symbol, error: tech.error ?? 'insufficient data' });
      continue;
    }
    const market = await gatherMarket(provider, tech).catch(() => ({ ok: false }));

    const a = {
      price: tech.price,
      dataTimestamp: new Date().toISOString(),
      dataStatus: 'VERIFIED',
      quote: { lastPrice: tech.price, changePct: tech.quote?.changePct, open: tech.quote?.open, source: tech.quote?.source ?? 'jugaad', stale: false },
      technical: {
        stale: tech.candlesStale,
        bridged: tech.candlesBridged,
        trend: tech.trend,
        rsi: tech.rsi,
        macd: { value: round2(tech.macdValue), signal: round2(tech.macdSignal) },
        sma20: tech.s20,
        sma50: tech.s50,
        sma100: tech.s100,
        sma200: tech.s200,
        roc10: round2(tech.roc10),
        roc20: round2(tech.roc20),
        roc5: round2(tech.roc5),
        volume: tech.lastVol,
        avgVolume20: tech.avgVol20,
        avgVolume50: tech.avgVol50,
        volumeRatio: tech.volRatio,
        volumeSpike: tech.volumeSpike,
        atr: tech.atr,
        atrPct: tech.atrPct,
        support: tech.primarySupport,
        resistance: tech.primaryResistance,
        candleCount: tech.closes.length,
      },
      market: { ok: Boolean(market.ok), regime: market.regime, relativeStrength: market.relativeStrength },
      valuation: { available: false },
      news: { available: false },
      entry: {},
      _candles: tech.candles,
      _closes: tech.closes,
      _niftyCloses: market.niftyCloses ?? [],
    };

    let res;
    try {
      res = buildEngineResult(a);
    } catch (err) {
      rows.push({ symbol, error: err.message });
      continue;
    }

    const today = dayKey();
    const alreadyRecordedToday = hasPredictionFor(symbol, today);
    if (!alreadyRecordedToday) {
      recordFromAnalysis({ symbol, price: a.price, engine: res, market: a.market }, today);
    }

    rows.push({
      symbol,
      openPrice: tech.quote?.open ?? null,
      currentPrice: tech.price,
      dayChangePct: tech.quote?.changePct ?? null,
      dataStatus: res.dataStatus,
      signal: res.signal,
      directionalOutlook: res.directionalOutlook,
      predictedClose: res.closingRange.base,
      predictedRange: `${res.closingRange.bear} - ${res.closingRange.bull}`,
      expectedMovePct: res.closingRange.expectedMovePct,
      recorded: !alreadyRecordedToday ? 'recorded just now' : 'already recorded earlier today (frozen snapshot unchanged)',
    });
  }

  console.log('CALL_SHEET_START');
  console.log(JSON.stringify(rows, null, 2));
  console.log('CALL_SHEET_END');
}

run();
