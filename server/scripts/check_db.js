import { prisma } from '../src/config/prisma.js';

async function main() {
  // Show holdings for both user 6 and user 7
  const holdings6 = await prisma.portfolioHolding.findMany({ where: { userId: 6 } });
  const holdings7 = await prisma.portfolioHolding.findMany({ where: { userId: 7 } });

  console.log('\n=== USER 6 HOLDINGS ===');
  console.log(holdings6.map(h => ({ symbol: h.symbol, instrumentId: h.instrumentId })));

  console.log('\n=== USER 7 HOLDINGS ===');
  console.log(holdings7.map(h => ({ symbol: h.symbol, instrumentId: h.instrumentId })));


  // ScanSignal check for holdings
  const symbols = holdings6.map(h => h.symbol);
  const signals = await prisma.scanSignal.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, signal: true, regime: true, timestamp: true },
    orderBy: { timestamp: 'desc' },
  });
  console.log(`\nScan signals for user holdings (${signals.length} total):`);
  const unique = new Map();
  for (const s of signals) {
    if (!unique.has(s.symbol)) {
      unique.set(s.symbol, s);
      console.log(`  - ${s.symbol}: ${s.signal} (${s.regime}) at ${s.timestamp.toISOString()}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
