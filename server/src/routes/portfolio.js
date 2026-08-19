import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getPortfolioSummary,
  getPortfolioOrThrow,
  getHoldings,
  getSectorExposure,
  getPositions,
  getFunds,
  getSnapshots,
  syncPortfolio,
} from '../services/portfolioService.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();

router.use(authenticate);

router.get('/summary', async (req, res, next) => {
  try {
    res.json({ portfolio: await getPortfolioSummary(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ portfolio: await getPortfolioOrThrow(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/holdings', async (req, res, next) => {
  try {
    res.json({ holdings: await getHoldings(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/sectors', async (req, res, next) => {
  try {
    res.json({ sectors: await getSectorExposure(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/positions', async (req, res, next) => {
  try {
    res.json({ positions: await getPositions(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/snapshots', async (req, res, next) => {
  try {
    res.json({ snapshots: await getSnapshots(req.user.id, { limit: Number(req.query.limit) || 30 }) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/sync',
  async (req, res, next) => {
    try {
      const broker = req.body.broker || 'mock';
      if (!['mock', 'zerodha', 'upstox'].includes(broker)) {
        throw new BadRequestError('Unsupported broker');
      }
      res.json(await syncPortfolio(req.user.id, broker, { ip: req.ip }));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/funds/:broker', async (req, res, next) => {
  try {
    res.json({ funds: await getFunds(req.user.id, req.params.broker) });
  } catch (err) {
    next(err);
  }
});

export default router;