import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate, pagination, paginatedResult } from '../../utils/validation.js';
import {
  listUsers,
  getUserAdmin,
  createUserAdmin,
  updateUserAdmin,
  deleteUserAdmin,
} from '../../services/adminService.js';

const router = Router();

router.get('/', pagination, query('search').optional().isString(), validate, async (req, res, next) => {
  try {
    const { page, limit } = req.pagination;
    const result = await listUsers({ page, limit, search: req.query.search });
    res.json(paginatedResult(result));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('fullName').optional().isString(),
  body('role').optional().isIn(['USER', 'ADMIN']),
  body('status').optional().isIn(['ACTIVE', 'SUSPENDED']),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json({ user: await createUserAdmin(req.body) });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', param('id').isInt(), validate, async (req, res, next) => {
  try {
    res.json({ user: await getUserAdmin(Number(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  param('id').isInt(),
  body('fullName').optional().isString(),
  body('phone').optional({ nullable: true }).isString(),
  body('role').optional().isIn(['USER', 'ADMIN']),
  body('status').optional().isIn(['ACTIVE', 'SUSPENDED']),
  body('subscriptionStatus').optional().isString(),
  body('password').optional().isLength({ min: 8 }),
  validate,
  async (req, res, next) => {
    try {
      res.json({ user: await updateUserAdmin(req.user.id, Number(req.params.id), req.body) });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', param('id').isInt(), validate, async (req, res, next) => {
  try {
    res.json(await deleteUserAdmin(req.user.id, Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

export default router;