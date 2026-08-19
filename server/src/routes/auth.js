import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, logout, getMe, changePassword } from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../utils/validation.js';

const router = Router();

router.post(
  '/register',
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('fullName').optional().isString().isLength({ max: 100 }),
  body('phone').optional().isString().isLength({ max: 20 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await register({ ...req.body, ip: req.ip });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/login',
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validate,
  async (req, res, next) => {
    try {
      const result = await login({ ...req.body, ip: req.ip });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    res.json(await logout(req.user.id, req.ip));
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ user: await getMe(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/change-password',
  authenticate,
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  validate,
  async (req, res, next) => {
    try {
      res.json(await changePassword(req.user.id, req.body));
    } catch (err) {
      next(err);
    }
  },
);

export default router;