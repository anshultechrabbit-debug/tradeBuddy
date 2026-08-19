import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';
import { getPrefs, updatePrefs } from '../services/settingsService.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json({ prefs: await getPrefs(req.user.id) });
  } catch (err) {
    next(err);
  }
});

const prefsValidators = [
  body('riskProfile').optional().isIn(['conservative', 'moderate', 'aggressive']),
  body('universeVisibility').optional().isIn(['default', 'high_priority', 'all']),
  body('notificationChannels').optional().isArray(),
  body('quietHoursEnabled').optional().isBoolean(),
  body('quietHoursStart').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('quietHoursEnd').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  validate,
];

async function handleUpdate(req, res, next) {
  try {
    res.json({ prefs: await updatePrefs(req.user.id, req.body) });
  } catch (err) {
    next(err);
  }
}

router.put('/', ...prefsValidators, handleUpdate);
router.patch('/', ...prefsValidators, handleUpdate);

export default router;