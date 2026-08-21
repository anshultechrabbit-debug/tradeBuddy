import { prisma } from '../src/config/prisma.js';
import { getHoldings, getPortfolioSummary } from '../src/services/portfolioService.js';
import { portfolioReview } from '../src/services/ai/agent.js';

async function main() {
  const userId = 6;
  console.log('\n=== Testing getHoldings for userId 6 ===\n');
  try {
    const holdings = await getHoldings(userId);
    console.log(`Holdings returned: ${holdings.length}`);
  } catch (err) {
    console.error('getHoldings ERROR:', err.message);
  }

  console.log('\n=== Testing portfolioReview for userId 6 ===\n');
  try {
    const review = await portfolioReview(userId);
    console.log('AI Review:', JSON.stringify(review, null, 2));
  } catch (err) {
    console.error('portfolioReview ERROR:', err.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
