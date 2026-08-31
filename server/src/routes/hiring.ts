import { Router, type Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router: RouterType = Router();

// 业务工作台：hiring_manager 或 admin 可访问（P-2 实现数据）
router.get(
  '/overview',
  authenticate,
  requireRole('admin', 'hiring_manager'),
  async (_req, res, next) => {
    try {
      res.json({ success: true, data: { message: 'P-2 will implement this' } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
