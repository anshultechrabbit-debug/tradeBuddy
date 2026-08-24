import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import { prisma } from '../config/prisma.js';
import { ask, suggest, portfolioReview } from '../services/ai/agent.js';
import { recommend } from '../services/ai/recommender.js';
import { topOpportunities } from '../services/radarService.js';
import { analyzeStock, formatAnalysis } from '../services/stockAnalysisService.js';
import { getTodayPrediction, getTrackRecord } from '../services/marketPredictionService.js';

const CONCURRENCY = 4;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const router = Router();
router.use(authenticate);

router.post(
  '/ask',
  body('question').trim().isLength({ min: 1, max: 1000 }),
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const answer = await ask(userId, req.body.question);
      res.json({ answer });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/suggest',
  body('limit').optional().isInt({ min: 1, max: 10 }),
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const limit = Number(req.body.limit ?? 3);
      const picks = await recommend(userId, limit);
      res.json({ picks });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/analyze',
  body('symbol').trim().isLength({ min: 1, max: 20 }),
  validate,
  async (req, res, next) => {
    try {
      const symbol = String(req.body.symbol).trim().toUpperCase();
      const result = await analyzeStock(symbol);
      if (!result.ok) {
        return res.status(404).json({ ok: false, symbol, error: result.error });
      }
      res.json({ ok: true, symbol, analysis: result, formatted: formatAnalysis(result) });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/analyze-many',
  body('symbols').isArray({ min: 1, max: 20 }),
  body('symbols.*').trim().isLength({ min: 1, max: 20 }),
  validate,
  async (req, res, next) => {
    try {
      const symbols = [...new Set(req.body.symbols.map((s) => String(s).trim().toUpperCase()))].slice(0, 10);
      const out = await mapLimit(symbols, CONCURRENCY, async (symbol) => {
        const result = await analyzeStock(symbol).catch((err) => ({
          ok: false,
          symbol,
          error: err?.message ?? 'Analysis failed',
        }));
        return result?.ok ? { symbol, analysis: result, formatted: formatAnalysis(result) } : { symbol, error: result?.error ?? 'Analysis failed' };
      });
      res.json({ results: out.filter((r) => r.analysis), errors: out.filter((r) => !r.analysis) });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/market-prediction',
  async (req, res, next) => {
    try {
      const today = await getTodayPrediction();
      const track = getTrackRecord(10);
      res.json({ today, track });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/predicted-risers',
  body('limit').optional().isInt({ min: 1, max: 20 }),
  validate,
  async (req, res, next) => {
    try {
      const { topOpportunities } = await import('../services/radarService.js');
      const wanted = Number(req.body.limit ?? 5);
      // Wider candidate pool than the AI Picks watchlist so we can surface 5.
      const opps = await topOpportunities(40);
      const symbols = [...new Set(opps.map((o) => o.symbol))].slice(0, 40);
      const analyzed = await mapLimit(symbols, CONCURRENCY, async (sym) => {
        const r = await analyzeStock(sym).catch(() => null);
        return r && r.ok ? r : null;
      });
      const risers = analyzed
        .filter(
          (r) =>
            r &&
            /BUY/.test(r.finalSignal) &&
            r.technical?.trend === 'Bullish' &&
            r.expectedClose != null,
        )
        .sort((a, b) => (b.expectedPct ?? 0) - (a.expectedPct ?? 0))
        .slice(0, wanted)
        .map((r) => ({
          symbol: r.symbol,
          companyName: r.companyName,
          price: r.price ?? null,
          expectedClose: r.expectedClose,
          expectedPct: r.expectedPct,
          finalSignal: r.finalSignal,
          stopLoss: r.entry?.stopLoss ?? null,
        }));
      res.json({ risers });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/suggest-market',
  body('n').optional().isInt({ min: 1, max: 10 }),
  validate,
  async (req, res, next) => {
    try {
      const n = Number(req.body.n ?? 5);

      // Market-driven candidates: top movers from the cached universe +
      // latest radar opportunities. Purely "over the market", no user data.
      const [movers, opps] = await Promise.all([
        prisma.marketQuote.findMany({
          where: { exchange: 'NSE', source: { in: ['jugaad', 'nselib', 'nse-archives'] } },
          orderBy: [{ changePct: 'desc' }, { timestamp: 'desc' }],
          distinct: ['symbol'],
          take: n * 8,
          select: { symbol: true, changePct: true, lastPrice: true },
        }),
        topOpportunities(n * 2),
      ]);

      const symbols = [
        ...movers
          .filter((m) => m.lastPrice != null && m.changePct != null)
          .map((m) => m.symbol),
        ...opps.map((o) => o.symbol),
      ].filter((s) => s && /^[A-Z0-9&.-]{1,20}$/.test(String(s)));

      const uniq = [...new Set(symbols)].slice(0, n * 2);

      const scored = await mapLimit(uniq, CONCURRENCY, async (symbol) => {
        const result = await analyzeStock(symbol).catch((err) => ({
          ok: false,
          symbol,
          error: err?.message ?? 'Analysis failed',
        }));
        return result?.ok
          ? { symbol, analysis: result, formatted: formatAnalysis(result) }
          : { symbol, error: result?.error ?? 'Analysis failed' };
      });

      const okResults = scored.filter((r) => r.analysis);
      okResults.sort((a, b) => b.analysis.overallScore - a.analysis.overallScore);

      res.json({
        requested: n,
        results: okResults.slice(0, n),
        errors: scored.filter((r) => !r.analysis),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/summary',
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const text = await suggest(userId);
      res.json({ answer: text });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/portfolio-review',
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const review = await portfolioReview(userId);
      res.json({ review });
    } catch (err) {
      next(err);
    }
  },
);

export default router;