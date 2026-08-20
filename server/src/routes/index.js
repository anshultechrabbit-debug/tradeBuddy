import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import authRoutes from './auth.js';
import brokerRoutes from './brokers.js';
import portfolioRoutes from './portfolio.js';
import radarRoutes from './radar.js';
import watchlistRoutes from './watchlist.js';
import strategyRoutes from './strategy.js';
import alertRoutes from './alerts.js';
import journalRoutes from './journal.js';
import settingsRoutes from './settings.js';
import marketRoutes from './market.js';
import privacyRoutes from './privacy.js';
import aiRoutes from './ai.js';
import streamRoutes from './stream.js';
import adminUsersRoutes from './admin/users.js';
import adminHealthRoutes from './admin/health.js';
import adminBrokersRoutes from './admin/brokers.js';
import adminComplianceRoutes from './admin/compliance.js';
import adminScanUniverseRoutes from './admin/scanUniverse.js';
import { getSystemHealth } from '../services/healthService.js';

const router = Router();

router.get('/health', async (_req, res, next) => {
  try {
    res.json(await getSystemHealth());
  } catch (err) {
    next(err);
  }
});

router.use('/auth', authRoutes);
router.use('/brokers', brokerRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/radar', radarRoutes);
router.use('/watchlist', watchlistRoutes);
router.use('/strategy', strategyRoutes);
router.use('/alerts', alertRoutes);
router.use('/journal', journalRoutes);
router.use('/settings', settingsRoutes);
router.use('/market', marketRoutes);
router.use('/privacy', privacyRoutes);
router.use('/ai', aiRoutes);
router.use('/stream', streamRoutes);

router.use('/admin', authenticate, requireRole('ADMIN'));
router.use('/admin/users', adminUsersRoutes);
router.use('/admin/system-health', adminHealthRoutes);
router.use('/admin/brokers', adminBrokersRoutes);
router.use('/admin/compliance', adminComplianceRoutes);
router.use('/admin/scan-universe', adminScanUniverseRoutes);

export default router;