import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import {
  listConnections,
  connect,
  disconnect,
  sync,
  getConnection,
  adminListConnections,
  markConnectionStatus,
} from '../services/brokerService.js';
import { grantConsent, revokeConsent, listConsents } from '../services/consentService.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json({ connections: await listConnections(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:broker/connect',
  param('broker').isIn(['mock', 'zerodha', 'upstox']).withMessage('Unsupported broker'),
  validate,
  async (req, res, next) => {
    try {
      res.json(await connect(req.user.id, req.params.broker, { ip: req.ip }));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:broker/disconnect',
  param('broker').isIn(['mock', 'zerodha', 'upstox']),
  validate,
  async (req, res, next) => {
    try {
      res.json(await disconnect(req.user.id, req.params.broker, { ip: req.ip }));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:broker/sync',
  param('broker').isIn(['mock', 'zerodha', 'upstox']),
  validate,
  async (req, res, next) => {
    try {
      res.json(await sync(req.user.id, req.params.broker, { ip: req.ip }));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:broker', param('broker').isIn(['mock', 'zerodha', 'upstox']), validate, async (req, res, next) => {
  try {
    res.json({ connection: await getConnection(req.user.id, req.params.broker) });
  } catch (err) {
    next(err);
  }
});

// Consent
router.get('/:broker/consents', async (req, res, next) => {
  try {
    const all = await listConsents(req.user.id);
    res.json({ consents: all.filter((c) => c.broker === req.params.broker) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:broker/consents/grant',
  param('broker').isIn(['mock', 'zerodha', 'upstox']),
  body('scopes').isArray({ min: 1 }).withMessage('scopes array required'),
  body('purpose').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.json({ consents: await grantConsent(req.user.id, { broker: req.params.broker, ...req.body }, { ip: req.ip }) });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:broker/consents/revoke',
  param('broker').isIn(['mock', 'zerodha', 'upstox']),
  body('scopes').isArray({ min: 1 }).withMessage('scopes array required'),
  validate,
  async (req, res, next) => {
    try {
      res.json(await revokeConsent(req.user.id, { broker: req.params.broker, ...req.body }, { ip: req.ip }));
    } catch (err) {
      next(err);
    }
  },
);

// Admin: broker monitoring
router.get('/admin/monitor', requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.json({ connections: await adminListConnections() });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/admin/connections/:id/status',
  requireRole('ADMIN'),
  param('id').isInt(),
  body('status').isIn(['CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR', 'REVOKED']),
  validate,
  async (req, res, next) => {
    try {
      res.json({ connection: await markConnectionStatus(Number(req.params.id), req.body.status) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;