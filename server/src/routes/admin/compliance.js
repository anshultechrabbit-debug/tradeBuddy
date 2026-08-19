import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../../utils/validation.js';
import {
  listAllConsents,
  listDsrs,
  resolveDsr,
  createDsr,
} from '../../services/consentService.js';

const router = Router();

router.get('/consents', async (_req, res, next) => {
  try {
    res.json({ consents: await listAllConsents() });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', async (_req, res, next) => {
  try {
    res.json({ requests: await listDsrs({ admin: true }) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/requests',
  body('userId').isInt(),
  body('type').isIn(['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION']),
  body('notes').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json({ request: await createDsr(Number(req.body.userId), req.body, { ip: req.ip }) });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/requests/:id/resolve',
  param('id').isInt(),
  body('status').isIn(['COMPLETED', 'REJECTED']),
  validate,
  async (req, res, next) => {
    try {
      res.json({ request: await resolveDsr(req.user.id, Number(req.params.id), req.body) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;