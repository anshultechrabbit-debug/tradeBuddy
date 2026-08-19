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

router.get('/quotes', query('limit').optional().isInt({ min: 1, max: 500 }), validate, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { prisma } = await import('../config/prisma.js');
    const universe = await prisma.scanUniverse.findMany({
      where: { enabled: true, excluded: false, instrumentType: 'EQUITY' },
      include: { instrument: true },
      orderBy: { priority: 'asc' },
      take: limit,
    });
    const symbols = universe.map((u) => u.symbol);
    const quotes = await getMarketDataProvider().getQuotes({ symbols, exchange: 'NSE' });
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