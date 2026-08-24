/**
 * marketPredictionService — a once-per-day overall market (Nifty) direction
 * call: RISE / FALL / FLAT, with a confidence and a reason built from the
 * Nifty index move + market breadth (advance/decline). Each day's call is
 * stored so we can later compare it with the ACTUAL Nifty move and show a
 * running accuracy ("correct 7 of 10 days").
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

function dayKey(d = new Date()) {
  // Local calendar day (not UTC) so "today" matches the trading day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DECIDED_THRESHOLD = 0.5; // % move needed before we call a day right/wrong
const CORRECT_THRESHOLD = 0.15; // directional move that counts as "correct"

async function getNifty() {
  const provider = getMarketDataProvider();
  const indices = (await provider.getIndexData().catch(() => [])) ?? [];
  return indices.find((i) => /NIFTY/i.test(i.symbol ?? '')) ?? indices[0] ?? null;
}

export async function buildMarketPrediction() {
  const provider = getMarketDataProvider();
  const [nifty, breadth] = await Promise.all([
    getNifty(),
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

// Live evaluation: compare current Nifty level to the level when we predicted.
async function evaluateRecord(rec) {
  const nifty = await getNifty().catch(() => null);
  const currentLevel = nifty?.level ?? rec.predictedNiftyLevel ?? null;
  let actual = null;
  if (rec.predictedNiftyLevel && currentLevel) {
    actual = ((currentLevel - rec.predictedNiftyLevel) / rec.predictedNiftyLevel) * 100;
  }

  let outcome = 'PENDING';
  if (actual != null) {
    if (rec.direction === 'RISE' && actual > CORRECT_THRESHOLD) outcome = 'CORRECT';
    else if (rec.direction === 'FALL' && actual < -CORRECT_THRESHOLD) outcome = 'CORRECT';
    else if (rec.direction === 'FLAT' && Math.abs(actual) <= CORRECT_THRESHOLD) outcome = 'CORRECT';
    else if (Math.abs(actual) > DECIDED_THRESHOLD) outcome = 'WRONG';
  }

  return {
    ...rec,
    actualNiftyLevel: currentLevel,
    actualChangePct: actual == null ? null : Math.round(actual * 100) / 100,
    outcome,
    live: true,
  };
}

export async function getTodayPrediction() {
  const key = dayKey();
  const all = load();
  let rec = all.find((r) => r.tradeDate === key);

  if (!rec) {
    const p = await buildMarketPrediction();
    rec = {
      tradeDate: key,
      direction: p.direction,
      confidence: p.confidence,
      reason: p.reason,
      predictedNiftyLevel: p.niftyLevel,
      predictedNiftyChangePct: p.niftyChangePct,
      outcome: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    all.push(rec);
    save(all);
  }

  const live = await evaluateRecord(rec);

  // Persist a decided outcome so the track record stays stable.
  if (live.outcome !== 'PENDING' && live.outcome !== rec.outcome) {
    const idx = all.findIndex((r) => r.tradeDate === key);
    if (idx >= 0) {
      all[idx] = { ...all[idx], outcome: live.outcome, actualNiftyLevel: live.actualNiftyLevel, actualChangePct: live.actualChangePct };
      save(all);
    }
  }

  return live;
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
