import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import { generateRecommendation, recommendTop } from '../services/strategyService.js';

const router = Router();

router.use(authenticate);

router.post(
  '/recommend',
  body('symbol').isString().notEmpty().withMessage('symbol required'),
  validate,
  async (req, res, next) => {
    try {
      res.json(await generateRecommendation(req.user.id, { symbol: req.body.symbol.toUpperCase() }));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/top',
  query('limit').optional().isInt({ min: 1, max: 20 }),
  validate,
  async (req, res, next) => {
    try {
      res.json({ recommendations: await recommendTop(req.user.id, { limit: Number(req.query.limit) || 5 }) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;