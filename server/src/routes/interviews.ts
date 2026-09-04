import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { interviewController } from '../controllers/interview.controller';
import { interviewEvaluationController } from '../controllers/interview-evaluation.controller';
import { interviewOutlineController } from '../controllers/interview-outline.controller';
import { authenticate } from '../middleware/auth';
import { requireMatrixPermission, requireRole } from '../middleware/role';
import { validate, validateAll } from '../middleware/validate';
import { INTERVIEW_TYPES, INTERVIEW_STATUS, INTERVIEW_ROUNDS } from '../constants';

const router: RouterType = Router();

// 创建面试验证 Schema
const createInterviewSchema = z.object({
  candidateId: z.string().max(50).cuid('无效的候选人ID'),
  jobId: z.string().max(50).cuid().optional(),
  round: z.enum([...INTERVIEW_ROUNDS] as [string, ...string[]], {
    errorMap: () => ({ message: '面试轮次必须是：初试、复试或终面' }),
  }),
  type: z.enum([...INTERVIEW_TYPES] as [string, ...string[]], {
    errorMap: () => ({ message: '面试类型必须是：电话、视频或现场' }),
  }),
  interviewers: z
    .array(
      z.object({
        id: z.string().min(1, '面试官ID不能为空').max(50),
        name: z.string().min(1, '面试官姓名不能为空').max(50),
      })
    )
    .min(1, '至少需要一位面试官'),
  scheduledAt: z.string().max(50).refine((val) => !isNaN(Date.parse(val)), {
    message: '无效的面试时间格式',
  }),
  duration: z.number().int().min(15).max(480).optional().default(60),
  location: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  // F3-S：考察方向，字典 interview_focus_type；zod 仅做格式约束（zod 无法异步查字典）
  focusType: z.string().max(50).optional(),
});

// 更新面试验证 Schema
const updateInterviewSchema = z.object({
  round: z.enum([...INTERVIEW_ROUNDS] as [string, ...string[]]).optional(),
  type: z.enum([...INTERVIEW_TYPES] as [string, ...string[]]).optional(),
  interviewers: z
    .array(
      z.object({
        id: z.string().min(1).max(50),
        name: z.string().min(1).max(50),
      })
    )
    .min(1)
    .optional(),
  scheduledAt: z
    .string()
    .max(50)
    .refine((val) => !isNaN(Date.parse(val)), { message: '无效的时间格式' })
    .optional(),
  duration: z.number().int().min(15).max(480).optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  // F3-S：考察方向，字典有效性由 service 层校验（zod 仅做格式约束）
  focusType: z.string().max(50).optional(),
});

// 面试ID参数验证
const interviewIdSchema = z.object({
  id: z.string().max(50).cuid('无效的面试ID'),
});

// F3-S：生成/再生成大纲 body
const generateOutlineBodySchema = z.object({
  focusType: z.string().min(1, 'focusType 不能为空').max(50),
  adjustNote: z.string().max(1000, 'adjustNote 最多 1000 字').optional(),
});

// F3-S：手动定稿 params + body
const finalizeOutlineParamsSchema = z.object({
  id: z.string().max(50).cuid('无效的面试ID'),
  version: z.coerce.number().int().min(1, 'version 必须为正整数'),
});
const finalizeOutlineBodySchema = z.object({
  // outline 服务端会按 §4.1 规则做结构校验；zod 只挡非对象
  outline: z.record(z.unknown()),
});

// 列表查询验证
const listInterviewQuerySchema = z.object({
  page: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .max(10)
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  candidateId: z.string().max(50).optional(),
  jobId: z.string().max(50).optional(),
  status: z.enum([...INTERVIEW_STATUS] as [string, ...string[]]).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
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
 * POST /api/interviews/:id/question-outline
 * F3-S：生成/再生成面试问题大纲（同步返回新版本）
 * 权限：登录用户 + ai:interview-outline（service 层做精细校验：admin 直通 / hr 候选人可见 / hm&interviewer 必须是该场面试官）
 */
router.post(
  '/:id/question-outline',
  authenticate,
  requireMatrixPermission('ai:interview-outline'),
  validateAll({
    params: interviewIdSchema,
    body: generateOutlineBodySchema,
  }),
  interviewOutlineController.generate
);

/**
 * GET /api/interviews/:id/question-outlines
 * F3-S：版本列表（version 降序）
 */
router.get(
  '/:id/question-outlines',
  authenticate,
  requireMatrixPermission('ai:interview-outline'),
  validate(interviewIdSchema, 'params'),
  interviewOutlineController.list
);

/**
 * PATCH /api/interviews/:id/question-outline/:version
 * F3-S：手动微调定稿（不调 LLM）
 */
router.patch(
  '/:id/question-outline/:version',
  authenticate,
  requireMatrixPermission('ai:interview-outline'),
  validateAll({
    params: finalizeOutlineParamsSchema,
    body: finalizeOutlineBodySchema,
  }),
  interviewOutlineController.finalize
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
 * GET /api/interviews/:id/evaluations
 * 面试详情聚合各面试官评估（登录即可查看）
 */
router.get(
  '/:id/evaluations',
  authenticate,
  validate(interviewIdSchema, 'params'),
  interviewEvaluationController.getInterviewEvaluations
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
 * 取消面试（仅 admin / hr；用人经理即使作为面试官也不能取消）
 */
router.post(
  '/:id/cancel',
  authenticate,
  requireRole('admin', 'hr'),
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
