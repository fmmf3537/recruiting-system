import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { interviewController } from '../controllers/interview.controller';
import { authenticate } from '../middleware/auth';
import { validate, validateAll } from '../middleware/validate';
import { INTERVIEW_TYPES, INTERVIEW_STATUS, INTERVIEW_ROUNDS } from '../constants';

const router: RouterType = Router();

// 创建面试验证 Schema
const createInterviewSchema = z.object({
  candidateId: z.string().cuid('无效的候选人ID'),
  jobId: z.string().cuid().optional(),
  round: z.enum([...INTERVIEW_ROUNDS] as [string, ...string[]], {
    errorMap: () => ({ message: '面试轮次必须是：初试、复试或终面' }),
  }),
  type: z.enum([...INTERVIEW_TYPES] as [string, ...string[]], {
    errorMap: () => ({ message: '面试类型必须是：电话、视频或现场' }),
  }),
  interviewers: z
    .array(
      z.object({
        id: z.string().min(1, '面试官ID不能为空'),
        name: z.string().min(1, '面试官姓名不能为空'),
      })
    )
    .min(1, '至少需要一位面试官'),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: '无效的面试时间格式',
  }),
  duration: z.number().int().min(15).max(480).optional().default(60),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// 更新面试验证 Schema
const updateInterviewSchema = z.object({
  round: z.enum([...INTERVIEW_ROUNDS] as [string, ...string[]]).optional(),
  type: z.enum([...INTERVIEW_TYPES] as [string, ...string[]]).optional(),
  interviewers: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
      })
    )
    .min(1)
    .optional(),
  scheduledAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: '无效的时间格式' })
    .optional(),
  duration: z.number().int().min(15).max(480).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// 面试ID参数验证
const interviewIdSchema = z.object({
  id: z.string().cuid('无效的面试ID'),
});

// 列表查询验证
const listInterviewQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  candidateId: z.string().optional(),
  jobId: z.string().optional(),
  status: z.enum([...INTERVIEW_STATUS] as [string, ...string[]]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ============ 路由定义 ============

/**
 * POST /api/interviews
 * 创建面试安排
 */
router.post(
  '/',
  authenticate,
  validate(createInterviewSchema),
  interviewController.createInterview
);

/**
 * GET /api/interviews
 * 面试列表
 */
router.get(
  '/',
  authenticate,
  validate(listInterviewQuerySchema, 'query'),
  interviewController.getInterviews
);

/**
 * GET /api/interviews/conflicts
 * 查询面试官冲突（必须在 :id 之前）
 */
router.get(
  '/conflicts',
  authenticate,
  interviewController.getInterviewerConflicts
);

/**
 * GET /api/interviews/:id
 * 面试详情
 */
router.get(
  '/:id',
  authenticate,
  validate(interviewIdSchema, 'params'),
  interviewController.getInterviewById
);

/**
 * PATCH /api/interviews/:id
 * 更新面试安排
 */
router.patch(
  '/:id',
  authenticate,
  validateAll({
    params: interviewIdSchema,
    body: updateInterviewSchema,
  }),
  interviewController.updateInterview
);

/**
 * POST /api/interviews/:id/cancel
 * 取消面试
 */
router.post(
  '/:id/cancel',
  authenticate,
  validate(interviewIdSchema, 'params'),
  interviewController.cancelInterview
);

/**
 * POST /api/interviews/:id/complete
 * 标记面试完成
 */
router.post(
  '/:id/complete',
  authenticate,
  validate(interviewIdSchema, 'params'),
  interviewController.completeInterview
);

export default router;
