import { getMarketDataProvider } from './src/providers/marketData/index.js';

async function test() {
  try {
    const provider = getMarketDataProvider();
    console.log('Provider name:', provider.name);
    
    console.log('Fetching indices...');
    const indices = await provider.getIndexData();
    console.log('Indices:', JSON.stringify(indices, null, 2));

    console.log('Fetching top stocks...');
    const top = await provider.getTopStocks();
    console.log('Top Stocks:', JSON.stringify(top, null, 2));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
test();
