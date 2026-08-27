import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { pipelineTemplateController } from '../controllers/pipeline-template.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 新建/更新模板验证 Schema（stages 为有序字符串数组）
const templateBodySchema = z.object({
  name: z.string().min(1, '模板名称不能为空').max(200),
  type: z.string().min(1, '职位类型不能为空').max(50),
  stages: z.array(z.string().min(1, '阶段名称不能为空').max(50)).min(1, '阶段列表不能为空'),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const templateUpdateSchema = templateBodySchema.partial();

const idParamSchema = z.object({
  id: z.string().max(50).cuid('无效的模板ID'),
});

/**
 * GET /api/pipeline-templates
 * 模板列表（admin）
 */
router.get('/', authenticate, authorize('admin'), pipelineTemplateController.getTemplates);

/**
 * GET /api/pipeline-templates/stages?candidateId=xxx
 * 候选人适用阶段（登录用户；不传 candidateId 返回默认模板阶段）
 * 注意：必须注册在 /:id 之前避免被 idParam 拦截（本路由无 /:id GET，顺序仍保持在前）
 */
router.get(
  '/stages',
  authenticate,
  validate(z.object({ candidateId: z.string().max(50).optional() }), 'query'),
  pipelineTemplateController.getStages
);

/**
 * POST /api/pipeline-templates
 * 新建模板（admin）
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(templateBodySchema),
  pipelineTemplateController.createTemplate
);

/**
 * PATCH /api/pipeline-templates/:id
 * 更新模板（admin，含启停用）
 */
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(idParamSchema, 'params'),
  validate(templateUpdateSchema),
  pipelineTemplateController.updateTemplate
);

export default router;
