import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { interviewEvaluationController } from '../controllers/interview-evaluation.controller';
import { authenticate } from '../middleware/auth';
import { validate, validateAll } from '../middleware/validate';
import { INTERVIEW_CONCLUSIONS } from '../constants';

const router: RouterType = Router();

// 提交评估验证 Schema
const submitEvaluationSchema = z.object({
  dimensions: z
    .array(
      z.object({
        name: z.string().min(1, '维度名称不能为空').max(50),
        score: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
      })
    )
    .min(1, '至少需要一个评估维度'),
  overallScore: z.number().int().min(1).max(5),
  conclusion: z.enum([...INTERVIEW_CONCLUSIONS] as [string, ...string[]], {
    errorMap: () => ({ message: '评估结论必须是：pass、reject 或 pending' }),
  }),
});

// 评估ID参数验证
const evaluationIdSchema = z.object({
  id: z.string().max(50).cuid('无效的评估ID'),
});

// 我的评估列表查询验证
const myEvaluationQuerySchema = z.object({
  page: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z
    .string()
    .max(10)
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  status: z.enum(['pending', 'submitted']).optional(),
});

// ============ 路由定义 ============

/**
 * GET /api/evaluations/my
 * 我的评估列表（面试官视角，仅返回本人的评估）
 */
router.get(
  '/my',
  authenticate,
  validate(myEvaluationQuerySchema, 'query'),
  interviewEvaluationController.getMyEvaluations
);

/**
 * PUT /api/evaluations/:id
 * 面试官本人提交/修改评估（越权返回 403）
 */
router.put(
  '/:id',
  authenticate,
  validateAll({
    params: evaluationIdSchema,
    body: submitEvaluationSchema,
  }),
  interviewEvaluationController.submitEvaluation
);

export default router;
