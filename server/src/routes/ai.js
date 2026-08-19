import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import { ask, suggest } from '../services/ai/agent.js';
import { recommend } from '../services/ai/recommender.js';

const router = Router();
router.use(authenticate);

router.post(
  '/ask',
  body('question').trim().isLength({ min: 1, max: 1000 }),
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const answer = await ask(userId, req.body.question);
      res.json({ answer });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/suggest',
  body('limit').optional().isInt({ min: 1, max: 10 }),
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const limit = Number(req.body.limit ?? 3);
      const picks = await recommend(userId, limit);
      res.json({ picks });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/summary',
  async (req, res, next) => {
    try {
      const userId = req.user?.id ?? null;
      const text = await suggest(userId);
      res.json({ answer: text });
    } catch (err) {
      next(err);
    }
  },
);

export default router;