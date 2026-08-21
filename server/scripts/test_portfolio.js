import { prisma } from '../src/config/prisma.js';
import { getHoldings, getPortfolioSummary } from '../src/services/portfolioService.js';

async function main() {
  const userId = 7;
  console.log('\n=== Testing getHoldings for userId 7 ===\n');
  try {
    const holdings = await getHoldings(userId);
    console.log(`Holdings returned: ${holdings.length}`);
    for (const h of holdings) {
      console.log(`  ${h.symbol}: qty=${h.quantity}, avg=₹${h.averagePrice}, livePrice=₹${h.currentPrice}, value=₹${h.currentValue}`);
    }
  } catch (err) {
    console.error('getHoldings ERROR:', err.message);
  }

  console.log('\n=== Testing getPortfolioSummary for userId 7 ===\n');
  try {
    const summary = await getPortfolioSummary(userId);
    console.log('Summary:', JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('getPortfolioSummary ERROR:', err.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
