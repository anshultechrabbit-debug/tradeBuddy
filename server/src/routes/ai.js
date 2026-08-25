import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import { prisma } from '../config/prisma.js';
import { ask, suggest, portfolioReview } from '../services/ai/agent.js';
import { recommend } from '../services/ai/recommender.js';
import { topOpportunities } from '../services/radarService.js';
import { analyzeStock, formatAnalysis } from '../services/stockAnalysisService.js';
import { formatValidationFailure } from '../services/outputValidator.js';
import { recordFromAnalysis, evaluatePredictions, getPredictions, weeklyStats, allStats, freezeDailyPredictions } from '../services/predictionTracker.js';

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
      // Mandatory final consistency gate — never publish an analysis that
      // fails it (dual scores/signals, fabricated UNKNOWN data, bad trade
      // structure, etc.).
      if (!result.finalValidation?.passed) {
        return res.status(422).json(formatValidationFailure(result, result.finalValidation));
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
        if (!result?.ok) return { symbol, error: result?.error ?? 'Analysis failed' };
        if (!result.finalValidation?.passed) {
          return { symbol, error: `VALIDATION FAILED: ${result.finalValidation.failedChecks.map((f) => f.id).join(', ')}` };
        }
        return { symbol, analysis: result, formatted: formatAnalysis(result) };
      });
      res.json({ results: out.filter((r) => r.analysis), errors: out.filter((r) => !r.analysis) });
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
        if (!result?.ok) return { symbol, error: result?.error ?? 'Analysis failed' };
        if (!result.finalValidation?.passed) {
          return { symbol, error: `VALIDATION FAILED: ${result.finalValidation.failedChecks.map((f) => f.id).join(', ')}` };
        }
        return { symbol, analysis: result, formatted: formatAnalysis(result) };
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

// Record a prediction from the spec-compliant engine for a symbol, so it can be
// scored against the official closing price later.
router.post(
  '/record-prediction',
  body('symbol').trim().isLength({ min: 1, max: 20 }),
  validate,
  async (req, res, next) => {
    try {
      const symbol = String(req.body.symbol).toUpperCase();
      const result = await analyzeStock(symbol, { includeNews: true });
      if (!result?.ok || !result.engine) {
        return res.status(422).json({ error: 'Analysis unavailable for symbol', detail: result?.error });
      }
      if (!result.finalValidation?.passed) {
        return res.status(422).json(formatValidationFailure(result, result.finalValidation));
      }
      const rec = recordFromAnalysis(result);
      if (!rec) {
        return res.json({ recorded: null, note: `${symbol} already has a recorded prediction for today.` });
      }
      res.json({ recorded: rec });
    } catch (err) {
      next(err);
    }
  },
);

// Evaluate OPEN predictions against actual closes. `closes` maps SYMBOL -> { close, hitStop }.
// If omitted, the market provider's last price is used as a proxy for the close.
router.post(
  '/evaluate-predictions',
  body('closes').optional().isObject(),
  validate,
  async (req, res, next) => {
    try {
      const closes = req.body.closes ?? {};
      const { updated } = evaluatePredictions(closes);
      res.json({ updated, performance: weeklyStats(), stats: allStats() });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/predictions',
  async (req, res, next) => {
    try {
      const { symbol, date } = req.query;
      let list = getPredictions();
      if (symbol) {
        const sym = String(symbol).toUpperCase();
        list = list.filter((p) => p.symbol === sym);
      }
      if (date) {
        list = list.filter((p) => p.date === String(date));
      }
      res.json({ predictions: list });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/predictions/stats',
  async (req, res, next) => {
    try {
      res.json({ stats: allStats(), weekly: weeklyStats() });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/predictions/freeze-daily',
  async (req, res, next) => {
    try {
      const date = req.body.date ? String(req.body.date) : undefined;
      const frozen = freezeDailyPredictions(date);
      res.json({ frozen });
    } catch (err) {
      next(err);
    }
  },
);

export default router;