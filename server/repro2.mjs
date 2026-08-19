import { createMarketDataProvider } from './src/providers/marketData/index.js';
import { prisma } from './src/config/prisma.js';

const p = createMarketDataProvider('development', 'external');
try {
  const candles = await p.getCandles('EICHERMOT', '1d', 5, 'NSE');
  console.log('CANDLES_COUNT', candles.length);
  console.log('FIRST', JSON.stringify(candles[0]));
  const rows = await prisma.marketCandle.findMany({ where: { symbol: 'EICHERMOT', source: 'nse-archives' }, orderBy: { ts: 'desc' }, take: 3, select: { symbol: true, source: true, close: true, ts: true } });
  console.log('ROWS', JSON.stringify(rows));
} catch (e) {
  console.error('ERR', e);
} finally {
  await prisma.$disconnect();
}