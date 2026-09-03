import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { aiSettingsController } from '../controllers/ai-settings.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

const providerEnum = z.enum(['deepseek', 'zhipu', 'kimi', 'minimax'], {
  errorMap: () => ({ message: '不支持的 AI 提供方' }),
});

const providerParamSchema = z.object({
  provider: providerEnum,
});

const updateBodySchema = z.object({
  baseUrl: z.string().url('请输入合法 URL').max(500).optional(),
  model: z.string().min(1, '模型名不能为空').max(100).optional(),
  // 留空/不传 = 不修改已存密钥
  apiKey: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const testBodySchema = z.object({
  provider: providerEnum.optional(),
  apiKey: z.string().max(500).optional(),
});

/**
 * GET /api/settings/ai-providers
 * AI 提供方列表（admin，仅掩码）
 */
router.get(
  '/ai-providers',
  authenticate,
  authorize('admin'),
  aiSettingsController.listProviders
);

/**
 * POST /api/settings/ai-providers/test
 * 连接测试（admin，不落库）；须注册在 /:provider 之前
 */
router.post(
  '/ai-providers/test',
  authenticate,
  authorize('admin'),
  validate(testBodySchema),
  aiSettingsController.testConnection
);

/**
 * PUT /api/settings/ai-providers/:provider
 * 更新提供方配置（admin）
 */
router.put(
  '/ai-providers/:provider',
  authenticate,
  authorize('admin'),
  validate(providerParamSchema, 'params'),
  validate(updateBodySchema),
  aiSettingsController.updateProvider
);

export default router;
