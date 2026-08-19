import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate, pagination, paginatedResult } from '../../utils/validation.js';
import {
  listScanUniverse,
  createScanUniverseEntry,
  updateScanUniverseEntry,
  deleteScanUniverseEntry,
  searchInstruments,
  syncScanUniverseExternal,
} from '../../services/adminService.js';

const router = Router();

router.post('/sync', async (req, res, next) => {
  try {
    res.json(await syncScanUniverseExternal());
  } catch (err) {
    next(err);
  }
});

router.get('/', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listScanUniverse({ page, limit });
    res.json(paginatedResult(result));
  } catch (err) {
    next(err);
  }
});

router.get(
  '/search-instruments',
  query('q').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      res.json({ instruments: await searchInstruments({ q: req.query.q, limit: Number(req.query.limit) || 20 }) });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  body('symbol').isString().notEmpty(),
  body('exchange').optional().isIn(['NSE', 'BSE']),
  body('instrumentType').optional().isString(),
  body('enabled').optional().isBoolean(),
  body('priority').optional().isInt(),
  body('excluded').optional().isBoolean(),
  body('exclusionReason').optional({ nullable: true }).isString(),
  validate,
  async (req, res, next) => {
    try {
      const entry = await createScanUniverseEntry({
        symbol: req.body.symbol.toUpperCase(),
        exchange: req.body.exchange ?? 'NSE',
        instrumentType: req.body.instrumentType ?? 'EQUITY',
        enabled: req.body.enabled ?? true,
        priority: req.body.priority ?? 100,
        excluded: req.body.excluded ?? false,
        exclusionReason: req.body.exclusionReason ?? null,
      });
      res.status(201).json({ entry });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  param('id').isInt(),
  body('enabled').optional().isBoolean(),
  body('priority').optional().isInt(),
  body('excluded').optional().isBoolean(),
  body('exclusionReason').optional({ nullable: true }).isString(),
  validate,
  async (req, res, next) => {
    try {
      res.json({ entry: await updateScanUniverseEntry(Number(req.params.id), req.body) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', param('id').isInt(), validate, async (req, res, next) => {
  try {
    res.json(await deleteScanUniverseEntry(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

export default router;