import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { automationRuleController } from '../controllers/automation-rule.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 创建规则验证 Schema
const createRuleSchema = z.object({
  triggerStage: z.enum(['初筛', 'Offer', '入职'], {
    errorMap: () => ({ message: '触发阶段必须是：初筛、Offer 或 入职' }),
  }),
  triggerStatus: z.literal('passed', {
    errorMap: () => ({ message: '触发状态只能是 passed' }),
  }),
  templateId: z.string().cuid('无效的模板ID'),
  enabled: z.boolean().optional().default(true),
  description: z.string().max(200, '描述不超过200字').optional(),
});

// 更新规则验证 Schema
const updateRuleSchema = z.object({
  triggerStage: z.enum(['初筛', 'Offer', '入职']).optional(),
  triggerStatus: z.literal('passed').optional(),
  templateId: z.string().cuid('无效的模板ID').optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(200, '描述不超过200字').optional(),
});

// 规则 ID 参数验证
const ruleIdParamSchema = z.object({
  id: z.string().cuid('无效的规则ID'),
});

/**
 * GET /api/automation-rules
 * 获取自动化规则列表
 * 权限：管理员
 */
router.get('/', authenticate, automationRuleController.getRules);

/**
 * GET /api/automation-rules/:id
 * 获取单条规则
 * 权限：管理员
 */
router.get(
  '/:id',
  authenticate,
  validate(ruleIdParamSchema, 'params'),
  automationRuleController.getRuleById
);

/**
 * POST /api/automation-rules
 * 创建自动化规则
 * 权限：管理员
 */
router.post(
  '/',
  authenticate,
  validate(createRuleSchema),
  automationRuleController.createRule
);

/**
 * PATCH /api/automation-rules/:id
 * 更新自动化规则
 * 权限：管理员
 */
router.patch(
  '/:id',
  authenticate,
  validate(ruleIdParamSchema, 'params'),
  validate(updateRuleSchema),
  automationRuleController.updateRule
);

/**
 * DELETE /api/automation-rules/:id
 * 删除自动化规则
 * 权限：管理员
 */
router.delete(
  '/:id',
  authenticate,
  validate(ruleIdParamSchema, 'params'),
  automationRuleController.deleteRule
);

export default router;
