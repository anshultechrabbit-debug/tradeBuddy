import { Router } from 'express';
import { param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';

const router = Router();

router.use(authenticate);

router.get('/quote/:symbol', param('symbol').isString().notEmpty(), validate, async (req, res, next) => {
  try {
    const quote = await getMarketDataProvider().getQuote(req.params.symbol.toUpperCase(), 'NSE');
    if (!quote) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No quote for symbol' } });
    res.json(quote);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/candles/:symbol',
  param('symbol').isString().notEmpty(),
  query('limit').optional().isInt({ min: 5, max: 250 }),
  query('timeframe').optional().isIn(['1m', '5m', '15m', '60m', '1d']),
  query('days').optional().isInt({ min: 1, max: 30 }),
  validate,
  async (req, res, next) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const limit = Number(req.query.limit) || 120;
      const timeframe = String(req.query.timeframe || '1d');
      const days = Number(req.query.days) || 1;
      const provider = getMarketDataProvider();
      let candles;
      if (timeframe === '1d') {
        candles = await provider.getCandles(symbol, '1d', limit, 'NSE');
      } else {
        candles = await provider.getIntradayCandles(symbol, timeframe, days, 'NSE');
      }
      res.json({
        symbol,
        timeframe,
        candles: candles.map((c) => ({
          ...c,
          date: c.date instanceof Date ? c.date.toISOString() : c.date,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/quotes',
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('symbols').optional().isString(),
  query('all').optional().isIn(['true', 'false']),
  validate,
  async (req, res, next) => {
    try {
      const { prisma } = await import('../config/prisma.js');
      const provider = getMarketDataProvider();

      // ?symbols=RELIANCE,TCS,… → live quotes for exactly those symbols.
      const requested = req.query.symbols
        ? req.query.symbols
            .toString()
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : null;
      if (requested && requested.length) {
        const symbols = requested.slice(0, 100);
        const quotes = await provider.getQuotes({ symbols, exchange: 'NSE' });
        const instruments = await prisma.instrument.findMany({ where: { symbol: { in: symbols }, exchange: 'NSE' } });
        const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
        const rows = symbols.map((symbol, i) => ({
          symbol,
          exchange: 'NSE',
          name: bySymbol.get(symbol)?.name ?? null,
          sector: bySymbol.get(symbol)?.sector ?? null,
          instrumentType: 'EQUITY',
          ...(quotes[i] ?? {}),
        }));
        return res.json({ quotes: rows });
      }

      // ?all=true → full universe quotes from the DB (no live fetch). Cheap browse.
      if (String(req.query.all) === 'true') {
        const universe = await prisma.scanUniverse.findMany({
          where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
          include: { instrument: true },
          orderBy: { priority: 'asc' },
        });
        const symbols = universe.map((u) => u.symbol);
        const latest = await prisma.marketQuote.findMany({
          where: { symbol: { in: symbols }, exchange: 'NSE', source: { in: ['jugaad', 'nselib', 'nse-archives'] } },
          orderBy: [{ symbol: 'asc' }, { timestamp: 'desc' }],
          distinct: ['symbol'],
        });
        const bySymbol = new Map(latest.map((q) => [q.symbol, q]));
        const rows = universe.map((u) => ({
          symbol: u.symbol,
          exchange: 'NSE',
          name: u.instrument?.name ?? null,
          sector: u.instrument?.sector ?? null,
          instrumentType: 'EQUITY',
          ...(bySymbol.get(u.symbol)
            ? {
                lastPrice: Number(bySymbol.get(u.symbol).lastPrice),
                open: bySymbol.get(u.symbol).open == null ? null : Number(bySymbol.get(u.symbol).open),
                high: bySymbol.get(u.symbol).high == null ? null : Number(bySymbol.get(u.symbol).high),
                low: bySymbol.get(u.symbol).low == null ? null : Number(bySymbol.get(u.symbol).low),
                prevClose: bySymbol.get(u.symbol).prevClose == null ? null : Number(bySymbol.get(u.symbol).prevClose),
                change: bySymbol.get(u.symbol).change == null ? null : Number(bySymbol.get(u.symbol).change),
                changePct: bySymbol.get(u.symbol).changePct == null ? null : Number(bySymbol.get(u.symbol).changePct),
                volume: bySymbol.get(u.symbol).volume == null ? null : Number(bySymbol.get(u.symbol).volume),
                source: bySymbol.get(u.symbol).source,
                dataSource: provider.dataSource,
              }
            : { dataSource: provider.dataSource }),
        }));
        return res.json({ quotes: rows, total: rows.length });
      }

      const limit = Number(req.query.limit) || 100;
      const universe = await prisma.scanUniverse.findMany({
        where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
        include: { instrument: true },
        orderBy: { priority: 'asc' },
        take: limit,
      });
      const symbols = universe.map((u) => u.symbol);
      const quotes = await provider.getQuotes({ symbols, exchange: 'NSE' });
      const bySymbol = new Map(universe.map((u) => [u.symbol, u]));
      const rows = quotes.map((q, i) => {
        const symbol = symbols[i];
        const entry = bySymbol.get(symbol);
        return {
          symbol,
          exchange: 'NSE',
          name: entry?.instrument?.name ?? null,
          sector: entry?.instrument?.sector ?? null,
          instrumentType: 'EQUITY',
          ...(q ?? {}),
        };
      });
      res.json({ quotes: rows });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/top', async (req, res, next) => {
  try {
    res.json(await getMarketDataProvider().getTopStocks());
  } catch (err) {
    next(err);
  }
});

router.get('/indices', async (req, res, next) => {
  try {
    res.json({ indices: await getMarketDataProvider().getIndexData() });
  } catch (err) {
    next(err);
  }
});

router.get('/breadth', async (req, res, next) => {
  try {
    res.json(await getMarketDataProvider().getMarketBreadth());
  } catch (err) {
    next(err);
  }
});

router.get(
  '/instruments',
  query('q').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      const { prisma } = await import('../config/prisma.js');
      const q = req.query.q?.toString().toUpperCase();
      const limit = Number(req.query.limit) || 20;
      const rows = await prisma.instrument.findMany({
        where: q
          ? { OR: [{ symbol: { contains: q } }, { name: { contains: q, mode: 'insensitive' } }] }
          : {},
        orderBy: { symbol: 'asc' },
        take: limit,
      });
      res.json({ instruments: rows });
    } catch (err) {
      next(err);
    }
  },
);

export default router;