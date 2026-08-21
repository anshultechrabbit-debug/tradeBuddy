import { prisma } from '../src/config/prisma.js';
import { getMarketDataProvider } from '../src/providers/marketData/index.js';
import crypto from 'node:crypto';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node scripts/simulate_trade.js <BUY|SELL> <SYMBOL> <QUANTITY> [EMAIL]');
    console.log('Example: node scripts/simulate_trade.js BUY RELIANCE 10');
    process.exit(1);
  }

  const side = args[0].toUpperCase();
  const symbol = args[1].toUpperCase();
  const quantity = parseInt(args[2], 10);
  const email = args[3];

  if (side !== 'BUY' && side !== 'SELL') {
    console.error('Invalid side. Use BUY or SELL.');
    process.exit(1);
  }
  if (isNaN(quantity) || quantity <= 0) {
    console.error('Quantity must be a positive integer.');
    process.exit(1);
  }

  // Find user
  let user;
  if (email) {
    user = await prisma.user.findUnique({ where: { email } });
  } else {
    // Default: pick the most recently created real user, excluding seeded dev/e2e accounts.
    user = await prisma.user.findFirst({
      where: {
        email: {
          notIn: ['admin@tradebuddy.dev', 'demo@tradebuddy.dev'],
          not: { contains: 'e2e_' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Fallback to demo user if no real user exists
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: 'demo@tradebuddy.dev' } });
    }
  }

  if (!user) {
    console.error('No user found in the database. Please register/create a user first.');
    process.exit(1);
  }

  console.log(`Executing ${side} of ${quantity} shares of ${symbol} for user ${user.email} (ID: ${user.id})...`);

  // Fetch live price
  const provider = getMarketDataProvider();
  console.log('Fetching live quote from NSE...');
  const quote = await provider.getQuote(symbol, 'NSE');
  if (!quote || !quote.lastPrice) {
    console.error(`Could not fetch live price for ${symbol}. Please verify the symbol is listed on the NSE.`);
    process.exit(1);
  }

  const livePrice = Number(quote.lastPrice);
  console.log(`Live price for ${symbol}: ₹${livePrice}`);

  // Fetch instrument
  let instrument = await prisma.instrument.findFirst({ where: { symbol, exchange: 'NSE' } });
  if (!instrument) {
    console.log(`Instrument not found in database. Syncing ${symbol} from live provider...`);
    // Create instrument dynamically
    const key = `NSE:${symbol}:EQ`;
    instrument = await prisma.instrument.create({
      data: {
        instrumentKey: key,
        symbol,
        exchange: 'NSE',
        instrumentType: 'EQUITY',
        name: quote.companyName ?? symbol,
        enabled: true,
      }
    });
  }

  // Ensure broker connection exists for "mock"
  let brokerConn = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId: user.id, broker: 'mock' } }
  });
  if (!brokerConn) {
    brokerConn = await prisma.brokerConnection.create({
      data: {
        userId: user.id,
        broker: 'mock',
        status: 'CONNECTED',
        displayName: 'Mock Broker (development)',
      }
    });
  }

  const brokerOrderId = `mock-ord-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Execute in transaction
  await prisma.$transaction(async (tx) => {
    // 1. Create order
    const order = await tx.order.create({
      data: {
        userId: user.id,
        broker: 'mock',
        brokerOrderId,
        symbol,
        exchange: 'NSE',
        side,
        quantity,
        price: livePrice,
        averagePrice: livePrice,
        status: 'FILLED',
        filledQuantity: quantity,
        timestamp: new Date(),
      }
    });

    // 2. Create order event
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        status: 'FILLED',
        message: `Simulated ${side} order filled via CLI at ₹${livePrice}`,
      }
    });

    // 3. Create trade journal entry
    await tx.tradeJournal.create({
      data: {
        userId: user.id,
        orderId: order.id,
        symbol,
        exchange: 'NSE',
        side,
        quantity,
        price: livePrice,
        timestamp: new Date(),
        status: 'FILLED',
        notes: `Executed via simulate_trade CLI script at live price ₹${livePrice}`,
      }
    });

    // 4. Update portfolio holding
    const existingHolding = await tx.portfolioHolding.findUnique({
      where: { userId_broker_symbol: { userId: user.id, broker: 'mock', symbol } }
    });

    if (side === 'BUY') {
      if (existingHolding) {
        const oldQty = existingHolding.quantity;
        const oldAvg = Number(existingHolding.averagePrice);
        const newQty = oldQty + quantity;
        const newAvg = (oldQty * oldAvg + quantity * livePrice) / newQty;
        const costValue = newQty * newAvg;
        const currentValue = newQty * livePrice;
        const pnl = currentValue - costValue;
        const pnlPct = (pnl / costValue) * 100;

        await tx.portfolioHolding.update({
          where: { id: existingHolding.id },
          data: {
            quantity: newQty,
            averagePrice: newAvg,
            costValue,
            currentValue,
            pnl,
            pnlPct,
            syncedAt: new Date(),
          }
        });
        console.log(`Updated existing holding for ${symbol}: Qty: ${newQty}, Avg Price: ₹${newAvg.toFixed(2)}`);
      } else {
        const costValue = quantity * livePrice;
        await tx.portfolioHolding.create({
          data: {
            userId: user.id,
            broker: 'mock',
            symbol,
            exchange: 'NSE',
            instrumentId: instrument.id,
            quantity,
            averagePrice: livePrice,
            currentPrice: livePrice,
            costValue,
            currentValue: costValue,
            pnl: 0,
            pnlPct: 0,
            source: 'broker',
          }
        });
        console.log(`Created new holding for ${symbol}: Qty: ${quantity}, Price: ₹${livePrice}`);
      }
    } else {
      // SELL
      if (!existingHolding) {
        throw new Error(`Cannot sell ${symbol} because you do not hold any shares of it.`);
      }
      const oldQty = existingHolding.quantity;
      if (oldQty < quantity) {
        throw new Error(`Cannot sell ${quantity} shares of ${symbol} because you only hold ${oldQty} shares.`);
      }
      const newQty = oldQty - quantity;
      if (newQty === 0) {
        await tx.portfolioHolding.delete({ where: { id: existingHolding.id } });
        console.log(`Sold all shares of ${symbol}. Holding removed.`);
      } else {
        const avgPrice = Number(existingHolding.averagePrice);
        const costValue = newQty * avgPrice;
        const currentValue = newQty * livePrice;
        const pnl = currentValue - costValue;
        const pnlPct = (pnl / costValue) * 100;

        await tx.portfolioHolding.update({
          where: { id: existingHolding.id },
          data: {
            quantity: newQty,
            costValue,
            currentValue,
            pnl,
            pnlPct,
            syncedAt: new Date(),
          }
        });
        console.log(`Sold ${quantity} shares of ${symbol}. Remaining: ${newQty} shares.`);
      }
    }

    // 5. Update portfolio position
    const existingPosition = await tx.portfolioPosition.findUnique({
      where: { userId_broker_symbol: { userId: user.id, broker: 'mock', symbol } }
    });

    if (side === 'BUY') {
      if (existingPosition) {
        const newQty = existingPosition.quantity + quantity;
        await tx.portfolioPosition.update({
          where: { id: existingPosition.id },
          data: {
            quantity: newQty,
            lastPrice: livePrice,
            syncedAt: new Date(),
          }
        });
      } else {
        await tx.portfolioPosition.create({
          data: {
            userId: user.id,
            broker: 'mock',
            symbol,
            exchange: 'NSE',
            instrumentId: instrument.id,
            quantity,
            averagePrice: livePrice,
            lastPrice: livePrice,
          }
        });
      }
    } else {
      if (existingPosition) {
        const newQty = existingPosition.quantity - quantity;
        if (newQty <= 0) {
          await tx.portfolioPosition.delete({ where: { id: existingPosition.id } });
        } else {
          await tx.portfolioPosition.update({
            where: { id: existingPosition.id },
            data: {
              quantity: newQty,
              lastPrice: livePrice,
              syncedAt: new Date(),
            }
          });
        }
      }
    }
  });

  console.log('Trade simulation successful!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error simulating trade:', err.message);
  process.exit(1);
});
