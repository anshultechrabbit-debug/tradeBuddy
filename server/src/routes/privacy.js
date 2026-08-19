import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../utils/validation.js';
import { createDsr, listDsrs } from '../services/consentService.js';
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