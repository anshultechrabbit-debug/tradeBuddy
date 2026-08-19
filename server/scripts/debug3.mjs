import { prisma } from '../src/config/prisma.js';
import { generateQuote } from '../src/providers/marketData/development/priceGen.js';

const rows = await prisma.marketCandle.findMany({
  where: { symbol: { in: ['RELIANCE'] }, exchange: 'NSE', timeframe: '1d' },
  orderBy: { ts: 'asc' },
});
console.log('rows count:', rows.length);
const last = rows[rows.length - 1];
console.log('last.close type:', typeof last.close, 'valueOf:', last.close.toString(), 'Number:', Number(last.close));

const quote = generateQuote('RELIANCE', rows, '2026-08-18');
console.log('quote:', JSON.stringify({ lastPrice: quote.lastPrice, change: quote.change, changePct: quote.changePct, open: quote.open }));
await prisma.$disconnect();