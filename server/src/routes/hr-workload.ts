import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { hrWorkloadController } from '../controllers/hr-workload.controller';
import { authenticate } from '../middleware/auth';
import { requireMatrixPermission } from '../middleware/role';
import { validate, validateAll } from '../middleware/validate';

const router: RouterType = Router();

const overviewQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month'], {
    errorMap: () => ({ message: 'period 必须是 day / week / month' }),
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须为 YYYY-MM-DD'),
  department: z.string().max(50).optional(),
  hrId: z.string().cuid('无效的HR ID').optional(),
});

const detailQuerySchema = overviewQuerySchema.extend({
  includeTimeline: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeCandidates: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const hrIdParamSchema = z.object({
  hrId: z.string().cuid('无效的HR ID'),
});

router.use(authenticate, requireMatrixPermission('hr_workload:read'));

/**
 * GET /api/hr-workload/overview
 * HR 工作负载总览（admin）
 */
router.get(
  '/overview',
  validate(overviewQuerySchema, 'query'),
  (req, res, next) => hrWorkloadController.getOverview(req, res, next),
);

/**
 * GET /api/hr-workload/export
 * 导出 xlsx，写 OperationLog（须在 /users/:hrId 之前）
 */
router.get(
  '/export',
  validate(overviewQuerySchema, 'query'),
  (req, res, next) => hrWorkloadController.exportOverview(req, res, next),
);

/**
 * GET /api/hr-workload/users/:hrId
 * 单 HR 详情 / 趋势 / 时间线
 */
router.get(
  '/users/:hrId',
  validateAll({
    params: hrIdParamSchema,
    query: detailQuerySchema,
  }),
  (req, res, next) => hrWorkloadController.getUserDetail(req, res, next),
);

export default router;
