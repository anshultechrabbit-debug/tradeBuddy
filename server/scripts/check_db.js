import { prisma } from '../src/config/prisma.js';

async function main() {
  // Show holdings for anshuljha11419@gmail.com (userId 7)
  const holdings = await prisma.portfolioHolding.findMany({
    where: { userId: 7 },
    orderBy: { currentValue: 'desc' },
  });
  let totalInvested = 0;
  console.log('\n=== PORTFOLIO: anshuljha11419@gmail.com ===\n');
  console.log('Symbol'.padEnd(14) + 'Qty'.padEnd(8) + 'Avg Price'.padEnd(14) + 'Invested');
  console.log('-'.repeat(50));
  for (const h of holdings) {
    const invested = Number(h.costValue);
    totalInvested += invested;
    console.log(
      h.symbol.padEnd(14) +
      String(h.quantity).padEnd(8) +
      ('₹' + Number(h.averagePrice).toFixed(2)).padEnd(14) +
      '₹' + invested.toFixed(2)
    );
  }
  console.log('-'.repeat(50));
  console.log('TOTAL INVESTED:'.padEnd(36) + '₹' + totalInvested.toFixed(2));
  console.log(`\n${holdings.length} holdings total`);

  // Broker connection check
  const conn = await prisma.brokerConnection.findMany({ where: { userId: 7 } });
  console.log('\nBroker connections for user 7:', conn.map(c => ({ broker: c.broker, status: c.status })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
