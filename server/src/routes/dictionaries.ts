import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { dictionaryController } from '../controllers/dictionary.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 查询参数验证
const listQuerySchema = z.object({
  category: z.string().optional(),
  includeDisabled: z.enum(['true', 'false']).optional(),
});

// 创建字典项验证
const createSchema = z.object({
  category: z.string().min(1, '分类不能为空'),
  code: z.string().min(1, '编码不能为空').optional(),
  name: z.string().min(1, '名称不能为空'),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
});

// 更新字典项验证
const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
});

// ID 参数验证
const idParamSchema = z.object({
  id: z.string().cuid('无效的字典项ID'),
});

/**
 * GET /api/dictionaries
 * 查询字典列表（所有登录用户可读）
 */
router.get(
  '/',
  authenticate,
  validate(listQuerySchema, 'query'),
  dictionaryController.getDictionaries
);

/**
 * POST /api/dictionaries
 * 创建字典项（仅管理员）
 */
router.post(
  '/',
  authenticate,
  validate(createSchema),
  dictionaryController.createDictionary
);

/**
 * PATCH /api/dictionaries/:id
 * 更新字典项（仅管理员）
 */
router.patch(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  validate(updateSchema),
  dictionaryController.updateDictionary
);

/**
 * DELETE /api/dictionaries/:id
 * 删除字典项（仅管理员）
 */
router.delete(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  dictionaryController.deleteDictionary
);

export default router;
