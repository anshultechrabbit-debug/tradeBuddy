import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const candles = await prisma.marketCandle.findMany({
  where: { symbol: 'RELIANCE', exchange: 'NSE', timeframe: '1d' },
  orderBy: { ts: 'asc' },
});
console.log('RELIANCE candles:', candles.length);
console.log('last 3:', candles.slice(-3).map((c) => ({ ts: c.ts.toISOString().slice(0, 10), close: Number(c.close), open: Number(c.open), high: Number(c.high), low: Number(c.low) })));

const holdings = await prisma.portfolioHolding.findMany({ include: { instrument: { select: { sector: true } } } });
console.log('total holdings rows:', holdings.length);
const withValue = holdings.filter((h) => Number(h.currentValue) > 0);
const total = withValue.reduce((a, h) => a + Number(h.currentValue), 0);
console.log('withValue:', withValue.length, 'total:', total);
const hhi = withValue.reduce((a, h) => { const w = Number(h.currentValue) / total; return a + w * w; }, 0);
console.log('hhiHoldings:', hhi.toFixed(4));
const sectors = new Map();
for (const h of withValue) { const s = h.instrument?.sector || 'Unknown'; sectors.set(s, (sectors.get(s) ?? 0) + Number(h.currentValue)); }
let hhiSector = 0;
for (const w of sectors.values()) hhiSector += (w / total) ** 2;
console.log('hhiSector:', hhiSector.toFixed(4), 'score:', Math.round(100 * (1 - Math.sqrt((hhi + hhiSector) / 2))));
console.log('sectors:', [...sectors.entries()].map(([s, v]) => `${s}=${(v / total * 100).toFixed(1)}%`).join(', '));
await prisma.$disconnect();