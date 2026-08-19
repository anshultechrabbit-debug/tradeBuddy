import { createMarketDataProvider } from './src/providers/marketData/index.js';
import { prisma } from './src/config/prisma.js';

const p = createMarketDataProvider('development', 'external');
try {
  const quote = await p.getQuote('RELIANCE', 'NSE');
  console.log('QUOTE', JSON.stringify(quote));
  const rows = await prisma.marketQuote.findMany({ where: { symbol: 'RELIANCE' }, select: { symbol: true, source: true, lastPrice: true, timestamp: true } });
  console.log('ROWS', JSON.stringify(rows));
} catch (e) {
  console.error('ERR', e);
} finally {
  await prisma.$disconnect();
}