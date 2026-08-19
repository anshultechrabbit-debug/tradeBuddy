import { getExternalAdapters } from './src/providers/marketData/external/index.js';
import { prisma } from './src/config/prisma.js';

const { primary, fallback, backfill } = getExternalAdapters();
try {
  console.log('PRIMARY', primary.name, 'FALLBACK', fallback.name, 'BACKFILL', backfill.name);
  try {
    const c = await primary.getHistoricalCandles('EICHERMOT', 'NSE', 5, false);
    console.log('PRIMARY_CANDLES', c.length, JSON.stringify(c[0]));
  } catch (e) { console.log('PRIMARY_ERR', e.message); }
  try {
    const c = await backfill.getHistoricalCandles('EICHERMOT', 'NSE', 5, false);
    console.log('BACKFILL_CANDLES', c.length, JSON.stringify(c[0]));
  } catch (e) { console.log('BACKFILL_ERR', e.message); }
  const rows = await prisma.marketCandle.findMany({ where: { symbol: 'EICHERMOT' }, orderBy: { ts: 'desc' }, take: 3, select: { symbol: true, source: true, close: true, ts: true } });
  console.log('DB_ROWS', JSON.stringify(rows));
} catch (e) {
  console.error('ERR', e);
} finally {
  await prisma.$disconnect();
}