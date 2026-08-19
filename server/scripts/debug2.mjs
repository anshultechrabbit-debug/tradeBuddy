import { DevelopmentMarketDataProvider } from '../src/providers/marketData/DevelopmentMarketDataProvider.js';

const p = new DevelopmentMarketDataProvider();
const quotes = await p.getQuotes({ symbols: ['RELIANCE', 'TCS'], exchange: 'NSE' });
console.log(JSON.stringify(quotes.map((q) => ({ symbol: q.symbol, lastPrice: q.lastPrice, volumeType: typeof q.volume, volume: String(q.volume) })), null, 2));
const quote = await p.getQuote('RELIANCE', 'NSE', { seedKey: 't' });
console.log('single:', JSON.stringify(quote));
await (await import('../src/config/prisma.js')).prisma.$disconnect();