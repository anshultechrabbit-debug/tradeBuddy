import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate, pagination, paginatedResult } from '../utils/validation.js';
import {
  importFromBroker,
  listJournal,
  listOrders,
  updateNotes,
} from '../services/journalService.js';

const router = Router();

router.use(authenticate);

router.post(
  '/import',
  body('broker').optional().isIn(['mock', 'zerodha', 'upstox']),
  validate,
  async (req, res, next) => {
    try {
      res.json(await importFromBroker(req.user.id, req.body.broker || 'mock', { ip: req.ip }));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listJournal(req.user.id, { page, limit });
    res.json(paginatedResult(result));
  } catch (err) {
    next(err);
  }
});

router.get('/orders', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listOrders(req.user.id, { page, limit });
    res.json(paginatedResult(result));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/notes',
  param('id').isInt(),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      res.json(await updateNotes(req.user.id, Number(req.params.id), { notes: req.body.notes ?? null }));
    } catch (err) {
      next(err);
    }
  },
);

export default router;