import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate, pagination, paginatedResult } from '../utils/validation.js';
import {
  createAlert,
  updateAlert,
  deleteAlert,
  listAlerts,
  listAlertEvents,
  evaluateAlerts,
  listNotifications,
  markNotificationsRead,
  getAlertTargetValue,
} from '../services/alertService.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json({ alerts: await listAlerts(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  body('name').isString().notEmpty(),
  body('alertType').isIn(['price_above', 'price_below', 'conviction_above', 'pnl_above', 'pnl_below']),
  body('threshold').isNumeric(),
  body('symbol').optional().isString(),
  body('channels').optional().isArray(),
  validate,
  async (req, res, next) => {
    try {
      const alert = await createAlert(req.user.id, req.body);
      res.status(201).json({ alert });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  param('id').isInt(),
  validate,
  async (req, res, next) => {
    try {
      res.json({ alert: await updateAlert(req.user.id, Number(req.params.id), req.body) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', param('id').isInt(), validate, async (req, res, next) => {
  try {
    res.json(await deleteAlert(req.user.id, Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.get('/evaluate', async (req, res, next) => {
  try {
    res.json({ triggered: await evaluateAlerts(req.user.id, { ip: req.ip }) });
  } catch (err) {
    next(err);
  }
});

router.get('/events', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listAlertEvents(req.user.id, { page, limit });
    res.json(paginatedResult({ rows: result.rows, total: result.total, page, limit }));
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', pagination, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listNotifications(req.user.id, { page, limit });
    res.json(paginatedResult({ rows: result.rows, total: result.total, page, limit }));
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/read', async (req, res, next) => {
  try {
    res.json(await markNotificationsRead(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/current', param('id').isInt(), validate, async (req, res, next) => {
  try {
    const alert = (await listAlerts(req.user.id)).find((a) => a.id === Number(req.params.id));
    if (!alert) throw new NotFoundError('Alert not found');
    res.json({ value: await getAlertTargetValue(req.user.id, alert) });
  } catch (err) {
    next(err);
  }
});

export default router;