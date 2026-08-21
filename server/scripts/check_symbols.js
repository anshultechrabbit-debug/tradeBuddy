import { prisma } from '../src/config/prisma.js';

async function main() {
  const symbols = ['POWERGRID', 'IOC', 'GAIL', 'HAL', 'BHEL', 'VEDL', 'HINDZINC', 'DLF', 'GODREJPROP'];
  const results = await prisma.scanUniverse.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true }
  });
  console.log('Symbols found in universe:', results.map(r => r.symbol));
}

main().catch(console.error).finally(() => prisma.$disconnect());
