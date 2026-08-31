import { Router, type Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router: RouterType = Router();

// 面试官工作台：interviewer 或 admin 可访问（P-3 实现数据）
router.get(
  '/my',
  authenticate,
  requireRole('admin', 'interviewer'),
  async (_req, res, next) => {
    try {
      res.json({ success: true, data: [] });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
