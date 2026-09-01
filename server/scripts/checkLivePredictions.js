import fs from 'node:fs/promises';
import { getMarketDataProvider } from '../src/providers/marketData/index.js';

const date = process.argv[2] ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const all = JSON.parse(await fs.readFile(new URL('../src/data/predictions.json', import.meta.url), 'utf8'));
const latest = new Map();
for (const p of all.filter((x) => x.date === date && x.isFinalForDay !== false)) {
  const prior = latest.get(p.symbol);
  if (!prior || new Date(p.predictionTimestamp) > new Date(prior.predictionTimestamp)) latest.set(p.symbol, p);
}

const provider = getMarketDataProvider();
const predictions = [...latest.values()];
const rows = [];
for (let i = 0; i < predictions.length; i += 8) {
  const batch = predictions.slice(i, i + 8);
  const quotes = await Promise.all(batch.map((p) => provider.getQuote(p.symbol, 'NSE').catch(() => null)));
  for (let j = 0; j < batch.length; j += 1) {
    const p = batch[j];
    const q = quotes[j];
    const live = Number(q?.price ?? q?.lastPrice ?? q?.close);
    if (!Number.isFinite(live) || live <= 0) continue;
    const movePct = (live - p.predictionPrice) / p.predictionPrice * 100;
    const correct = p.directionalOutlook === 'BULLISH' ? movePct > 0
      : p.directionalOutlook === 'BEARISH' ? movePct < 0 : Math.abs(movePct) <= 0.35;
    rows.push({
      symbol: p.symbol, signal: p.signal, outlook: p.directionalOutlook,
      morning: p.predictionPrice, predictedClose: p.baseCase, latest: live,
      movePct: Number(movePct.toFixed(2)), closeErrorPct: Number((Math.abs(live - p.baseCase) / live * 100).toFixed(2)),
      directionCorrect: correct, source: q?.source ?? provider.name ?? 'provider', timestamp: q?.timestamp ?? null,
    });
  }
}

const accuracy = (xs) => xs.length ? Number((xs.filter((x) => x.directionCorrect).length / xs.length * 100).toFixed(2)) : null;
const mae = (xs) => xs.length ? Number((xs.reduce((s, x) => s + x.closeErrorPct, 0) / xs.length).toFixed(2)) : null;
const bySignal = Object.fromEntries([...new Set(rows.map((r) => r.signal))].map((signal) => {
  const subset = rows.filter((r) => r.signal === signal);
  return [signal, { count: subset.length, directionAccuracyPct: accuracy(subset), predictedCloseMaePct: mae(subset) }];
}));
console.log(JSON.stringify({
  date, status: 'PROVISIONAL_LATEST_QUOTE_NOT_VERIFIED_OFFICIAL_CLOSE',
  predictions: predictions.length, quotesReceived: rows.length,
  directionAccuracyPct: accuracy(rows), predictedCloseMaePct: mae(rows), bySignal,
  rows: rows.sort((a, b) => b.movePct - a.movePct),
}, null, 2));
