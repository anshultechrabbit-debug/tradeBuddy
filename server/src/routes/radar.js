import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate, pagination, paginatedResult } from '../utils/validation.js';
import { runScan, listSignals, listOpportunities, getDeepDive, topOpportunities, getLatestScan, getLatestScanFromDb } from '../services/radarService.js';

const router = Router();

router.use(authenticate);

router.post(
  '/scan',
  body('limit').optional().isInt({ min: 0, max: 1000 }),
  validate,
  async (req, res, next) => {
    try {
      res.json(await runScan({ userId: req.user.id, limit: req.body.limit ?? 0, useCachedOnly: true }));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/signals',
  pagination,
  query('signal').optional().isIn(['BUY', 'WATCH', 'AVOID']),
  query('outlook').optional().isIn(['BULLISH', 'NEUTRAL', 'BEARISH']),
  query('minConviction').optional().isInt({ min: 0, max: 100 }),
  query('symbol').optional().isString().trim(),
  validate,
  async (req, res, next) => {
    try {
      const { page, limit } = req.pagination;
      const result = await listSignals({
        userId: req.user.id,
        page,
        limit,
        signal: req.query.signal,
        outlook: req.query.outlook,
        minConviction: req.query.minConviction == null ? undefined : Number(req.query.minConviction),
        symbol: req.query.symbol,
      });
      res.json(paginatedResult({ rows: result.rows, total: result.total, page, limit }));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/opportunities',
  pagination,
  query('signal').optional().isIn(['BUY', 'WATCH', 'AVOID']),
  query('outlook').optional().isIn(['BULLISH', 'NEUTRAL', 'BEARISH']),
  query('minConviction').optional().isInt({ min: 0, max: 100 }),
  query('symbol').optional().isString().trim(),
  validate,
  async (req, res, next) => {
    try {
      const { page, limit } = req.pagination;
      const result = await listOpportunities({
        userId: req.user.id,
        page,
        limit,
        signal: req.query.signal,
        outlook: req.query.outlook,
        minConviction: req.query.minConviction == null ? undefined : Number(req.query.minConviction),
        symbol: req.query.symbol,
      });
      res.json(paginatedResult({ rows: result.rows, total: result.total, page, limit }));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/latest', async (req, res, next) => {
  try {
    const latest = getLatestScan() ?? (await getLatestScanFromDb());
    if (!latest) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No scan has run yet' } });
    res.json(latest);
  } catch (err) {
    next(err);
  }
});

router.get('/top', query('limit').optional().isInt({ min: 1, max: 20 }), validate, async (req, res, next) => {
  try {
    const opps = await topOpportunities(Number(req.query.limit) || 5);
    res.json({ opportunities: opps });
  } catch (err) {
    next(err);
  }
});

router.get('/symbols/:symbol/detail', param('symbol').notEmpty(), validate, async (req, res, next) => {
  try {
    const detail = await getDeepDive(req.params.symbol.toUpperCase());
    if (!detail) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No data for symbol' } });
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

export default router;
