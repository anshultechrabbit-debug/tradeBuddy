import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate, pagination, paginatedResult } from '../utils/validation.js';
import { runScan, listSignals, listOpportunities, getDeepDive, topOpportunities } from '../services/radarService.js';

const router = Router();

router.use(authenticate);

router.post(
  '/scan',
  body('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      res.json(await runScan({ userId: req.user.id, limit: req.body.limit ?? 15 }));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/signals', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listSignals({ userId: req.user.id, page, limit });
    res.json(paginatedResult({ rows: result.rows, total: result.total, page, limit }));
  } catch (err) {
    next(err);
  }
});

router.get('/opportunities', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listOpportunities({ page, limit });
    res.json(paginatedResult({ rows: result.rows, total: result.total, page, limit }));
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