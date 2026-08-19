import { prisma } from '../config/prisma.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export async function ensureWatchlist(userId) {
  return prisma.watchlist.upsert({
    where: { userId },
    create: { userId, name: 'My Watchlist' },
    update: {},
  });
}

async function resolveInstrument(symbol, exchange) {
  return prisma.instrument.findFirst({
    where: { symbol, exchange, enabled: true },
    orderBy: { instrumentType: 'asc' },
  });
}

export async function listWatchlist(userId) {
  const watchlist = await ensureWatchlist(userId);
  const items = await prisma.watchlistItem.findMany({
    where: { watchlistId: watchlist.id },
    include: { instrument: { select: { name: true, sector: true, instrumentType: true } } },
    orderBy: { addedAt: 'desc' },
  });

  const symbols = items.map((i) => i.symbol);
  const provider = getMarketDataProvider();
  const quotes = await provider.getQuotes({ symbols, exchange: 'NSE' });
  const quoteMap = new Map(quotes.filter(Boolean).map((q) => [q.symbol, q]));

  return {
    id: watchlist.id,
    name: watchlist.name,
    items: items.map((item) => {
      const quote = quoteMap.get(item.symbol);
      return {
        id: item.id,
        symbol: item.symbol,
        exchange: item.exchange,
        name: item.instrument?.name ?? null,
        sector: item.instrument?.sector ?? null,
        instrumentType: item.instrument?.instrumentType ?? null,
        price: quote?.lastPrice ?? null,
        changePct: quote?.changePct ?? null,
        dataSource: quote?.dataSource ?? 'development',
        addedAt: item.addedAt,
      };
    }),
  };
}

export async function addToWatchlist(userId, { symbol, exchange = 'NSE' }) {
  const instrument = await resolveInstrument(symbol, exchange);
  if (!instrument) {
    throw new NotFoundError(`Instrument ${symbol} (${exchange}) is not available`);
  }
  const watchlist = await ensureWatchlist(userId);
  try {
    const item = await prisma.watchlistItem.create({
      data: {
        watchlistId: watchlist.id,
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
      },
    });
    return item;
  } catch (err) {
    if (err.code === 'P2002') {
      throw new ConflictError(`${symbol} is already in your watchlist`);
    }
    throw err;
  }
}

export async function removeFromWatchlist(userId, symbol, exchange = 'NSE') {
  const watchlist = await ensureWatchlist(userId);
  const result = await prisma.watchlistItem.deleteMany({
    where: { watchlistId: watchlist.id, symbol, exchange },
  });
  if (!result.count) {
    throw new NotFoundError(`${symbol} is not in your watchlist`);
  }
  return { removed: symbol };
}

export async function getSymbolDetail(symbol, exchange = 'NSE') {
  const provider = getMarketDataProvider();
  const [instrument, quote, volatility] = await Promise.all([
    resolveInstrument(symbol, exchange),
    provider.getQuote(symbol, exchange),
    provider.getVolatility(symbol, exchange),
  ]);
  if (!instrument) throw new NotFoundError(`Instrument ${symbol} not found`);
  return {
    symbol,
    exchange,
    name: instrument.name,
    sector: instrument.sector,
    instrumentType: instrument.instrumentType,
    isin: instrument.isin,
    quote,
    volatility,
    dataSource: provider.dataSource,
  };
}