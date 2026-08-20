import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../utils/validation.js';
import { createDsr, listDsrs, getDsrExport } from '../services/consentService.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/requests', async (req, res, next) => {
  try {
    res.json({ requests: await listDsrs({ userId: req.user.id }) });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/requests/:id/export',
  param('id').isInt(),
  validate,
  async (req, res, next) => {
    try {
      const dsr = await listDsrs({ userId: req.user.id });
      const match = dsr.find((d) => d.id === Number(req.params.id));
      if (!match || (match.type !== 'ACCESS' && match.type !== 'PORTABILITY')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No export available for this request' } });
      }
      const payload = await getDsrExport(match.id);
      if (!payload) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Request not fulfilled yet' } });
      }
      res.setHeader('Content-Disposition', `attachment; filename="tradebuddy-export-${match.id}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/requests',
  body('type').isIn(['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION']),
  body('notes').optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json({ request: await createDsr(req.user.id, req.body, { ip: req.ip }) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;