import { Router } from 'express';
import { adminListConnections, markConnectionStatus } from '../../services/brokerService.js';
import { body, param } from 'express-validator';
import { validate } from '../../utils/validation.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json({ connections: await adminListConnections() });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
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