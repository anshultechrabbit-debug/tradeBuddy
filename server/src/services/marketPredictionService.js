/**
 * marketPredictionService — a once-per-day overall market (Nifty) direction
 * call: RISE / FALL / FLAT, with a confidence and a reason built from the
 * Nifty index move + market breadth (advance/decline). Each day's call is
 * stored so we can later compare it with the ACTUAL Nifty move and show a
 * running accuracy ("correct 7 of 10 days").
 *
 * The outcome is decided EXACTLY ONCE per trading day, after market close,
 * against the official closing Nifty level — never against a live intraday
 * tick. A live level is still exposed for on-page context, but it never
 * decides or freezes the outcome (see CRIT-7 in the pipeline audit: the old
 * version evaluated on every 30s poll against whatever Nifty happened to be
 * doing at that instant, so a correct end-of-day call could get permanently
 * logged WRONG because of a 9:20am wobble).
 *
 * Persistence is a small JSON file (not a DB table) so the feature works
 * without a schema migration. Swap `load/save` for Prisma later if desired.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { computeRegime } from './radar/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, '..', '..', 'data', 'market-predictions.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return [];
  }
}

function save(arr) {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(arr, null, 2));
}

// IST calendar day, independent of the server OS timezone.
function dayKey(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function istMinutesOfDay(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function istWeekday(d = new Date()) {
  // 0 = Sunday .. 6 = Saturday, computed in IST regardless of server timezone.
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

// NSE equity cash session closes 15:30 IST. Give EOD data a few minutes to
// land before we start polling for the official close.
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
const CORRECT_THRESHOLD = 0.15; // directional move that counts as "correct"

function isPastClose(d = new Date()) {
  const day = istWeekday(d);
  if (day === 0 || day === 6) return true; // weekend — no session, treat prior call as decidable
  return istMinutesOfDay(d) > MARKET_CLOSE_MINUTES;
}

async function getNifty(provider) {
  const indices = (await provider.getIndexData().catch(() => [])) ?? [];
  return indices.find((i) => /NIFTY/i.test(i.symbol ?? '')) ?? indices[0] ?? null;
}

/**
 * Official EOD closing level for NIFTY, sourced from the same daily candle
 * series used everywhere else in the app (nselib/jugaad historical, cached
 * in Postgres) — never the live tick. Returns null if today's candle hasn't
 * been published yet (bhavcopy/EOD data typically lags the 15:30 close by
 * some minutes), so the caller can simply try again on the next call.
 */
async function getOfficialNiftyClose(provider, tradeDateKey) {
  const candles = await provider.getCandles('NIFTY', '1d', 3, 'NSE').catch(() => []);
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  const lastDate = last.date ?? last.ts;
  if (!lastDate) return null;
  const lastKey = dayKey(new Date(lastDate));
  if (lastKey !== tradeDateKey) return null; // not today's official close yet
  const close = Number(last.close);
  return Number.isFinite(close) ? close : null;
}

export async function buildMarketPrediction() {
  const provider = getMarketDataProvider();
  const [nifty, breadth] = await Promise.all([
    getNifty(provider),
    provider.getMarketBreadth().catch(() => ({})),
  ]);

  const level = nifty?.level ?? null;
  const changePct = Number(nifty?.changePct ?? 0);
  const breadthPct = Number(breadth?.breadthPctAboveSma50 ?? 50);
  const avgChange = Number(breadth?.averageChangePct ?? 0);

  const regime = computeRegime({ breadthPctAboveSma50: breadthPct, indexAboveSma50: breadthPct >= 50 });

  // Composite score: today's Nifty move + average stock move + breadth tilt.
  let score = 0;
  score += changePct * 1.5;
  score += avgChange * 1.0;
  score += (breadthPct - 50) * 0.3;
  if (regime === 'BULLISH') score += 10;
  if (regime === 'BEARISH') score -= 10;

  let direction;
  if (score >= 8) direction = 'RISE';
  else if (score <= -8) direction = 'FALL';
  else direction = 'FLAT';

  const confidence = Math.round(Math.max(20, Math.min(95, 50 + Math.abs(score) * 1.6)));

  const reason =
    `Nifty ${level != null ? `₹${level} (${changePct >= 0 ? '+' : ''}${changePct}%)` : 'n/a'}, ` +
    `${breadthPct}% of stocks above their 50-day average (${regime} regime), ` +
    `average stock move ${avgChange >= 0 ? '+' : ''}${avgChange}% today.`;

  return { direction, confidence, reason, niftyLevel: level, niftyChangePct: changePct, breadthPct, regime, avgChange };
}

function decideOutcome(direction, actualPct) {
  if (direction === 'RISE') return actualPct > CORRECT_THRESHOLD ? 'CORRECT' : 'WRONG';
  if (direction === 'FALL') return actualPct < -CORRECT_THRESHOLD ? 'CORRECT' : 'WRONG';
  return Math.abs(actualPct) <= CORRECT_THRESHOLD ? 'CORRECT' : 'WRONG';
}

export async function getTodayPrediction() {
  const provider = getMarketDataProvider();
  const key = dayKey();
  const all = load();
  let idx = all.findIndex((r) => r.tradeDate === key);

  if (idx < 0) {
    const p = await buildMarketPrediction();
    const rec = {
      tradeDate: key,
      direction: p.direction,
      confidence: p.confidence,
      reason: p.reason,
      predictedNiftyLevel: p.niftyLevel,
      predictedNiftyChangePct: p.niftyChangePct,
      outcome: 'PENDING',
      actualNiftyLevel: null,
      actualChangePct: null,
      createdAt: new Date().toISOString(),
    };
    all.push(rec);
    idx = all.length - 1;
    save(all);
  }

  let rec = all[idx];

  // Decide the outcome AT MOST once, and only once the session has closed —
  // against the official EOD close, never a live tick. Already-decided days
  // are never re-evaluated.
  if (rec.outcome === 'PENDING' && isPastClose() && rec.predictedNiftyLevel) {
    const closeLevel = await getOfficialNiftyClose(provider, key).catch(() => null);
    if (closeLevel != null) {
      const actualPct = ((closeLevel - rec.predictedNiftyLevel) / rec.predictedNiftyLevel) * 100;
      const outcome = decideOutcome(rec.direction, actualPct);
      all[idx] = {
        ...rec,
        outcome,
        actualNiftyLevel: closeLevel,
        actualChangePct: Math.round(actualPct * 100) / 100,
        evaluatedAt: new Date().toISOString(),
      };
      save(all);
      rec = all[idx];
    }
  }

  // Live level is informational only — shown on the page so the call still
  // feels "live", but it never participates in deciding CORRECT/WRONG.
  const live = await getNifty(provider).catch(() => null);
  const liveNiftyLevel = live?.level ?? null;
  const liveChangePct =
    rec.predictedNiftyLevel && liveNiftyLevel != null
      ? Math.round(((liveNiftyLevel - rec.predictedNiftyLevel) / rec.predictedNiftyLevel) * 10000) / 100
      : null;

  return { ...rec, liveNiftyLevel, liveChangePct };
}

export function getTrackRecord(limit = 10) {
  const all = load()
    .slice()
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
    .slice(0, limit);
  const decided = all.filter((r) => r.outcome === 'CORRECT' || r.outcome === 'WRONG');
  const correct = decided.filter((r) => r.outcome === 'CORRECT').length;
  const accuracy = decided.length ? Math.round((correct / decided.length) * 100) : null;
  return {
    records: all,
    accuracy,
    decidedCount: decided.length,
    correctCount: correct,
  };
}
