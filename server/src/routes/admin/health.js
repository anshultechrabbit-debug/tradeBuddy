import { Router } from 'express';
import { getSystemHealth } from '../../services/healthService.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json(await getSystemHealth());
  } catch (err) {
    next(err);
  }
});

export default router;