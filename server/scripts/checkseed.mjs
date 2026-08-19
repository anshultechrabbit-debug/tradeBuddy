import { PrismaClient } from '@prisma/client';
import { DEVELOPMENT_UNIVERSE, DEVELOPMENT_INDICES } from '../src/db/seed-data/universe.js';

const prisma = new PrismaClient();
const items = [...DEVELOPMENT_UNIVERSE, ...DEVELOPMENT_INDICES];
const conflicts = [];

const byKey = new Map();
for (const item of items) {
  const isIndex = item.sector === 'Index';
  const key = `NSE:${item.symbol}:${isIndex ? 'IDX' : 'EQ'}`;
  if (byKey.has(key)) {
    conflicts.push({ type: 'DUPLICATE_IN_LIST', key, a: byKey.get(key).symbol, b: item.symbol });
  }
  byKey.set(key, item);
}

for (const item of items) {
  const isIndex = item.sector === 'Index';
  const key = `NSE:${item.symbol}:${isIndex ? 'IDX' : 'EQ'}`;
  const existing = await prisma.instrument.findUnique({ where: { instrumentKey: key } });
  if (existing && existing.symbol !== item.symbol) {
    conflicts.push({ type: 'KEY_MISMATCH', key, listSymbol: item.symbol, dbSymbol: existing.symbol, dbType: existing.instrumentType });
  }
  if (existing && existing.instrumentType !== (isIndex ? 'INDEX' : 'EQUITY')) {
    conflicts.push({ type: 'TYPE_MISMATCH', key, listType: isIndex ? 'INDEX' : 'EQUITY', dbType: existing.instrumentType });
  }
}

console.log(JSON.stringify(conflicts, null, 2));
await prisma.$disconnect();
