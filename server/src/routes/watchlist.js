import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import {
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getSymbolDetail,
} from '../services/watchlistService.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(await listWatchlist(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  body('symbol').isString().notEmpty().withMessage('symbol required'),
  body('exchange').optional().isIn(['NSE', 'BSE']).withMessage('exchange must be NSE or BSE'),
  validate,
  async (req, res, next) => {
    try {
      const item = await addToWatchlist(req.user.id, {
        symbol: req.body.symbol.toUpperCase(),
        exchange: req.body.exchange ?? 'NSE',
      });
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:symbol',
  param('symbol').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await removeFromWatchlist(req.user.id, req.params.symbol.toUpperCase(), 'NSE'));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/symbols/:symbol',
  param('symbol').isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await getSymbolDetail(req.params.symbol.toUpperCase(), 'NSE'));
    } catch (err) {
      next(err);
    }
  },
);

export default router;