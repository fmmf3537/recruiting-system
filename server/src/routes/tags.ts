import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { tagController } from '../controllers/tag.controller';

const router: RouterType = Router();

// 标签创建/更新验证 schema
const tagSchema = z.object({
  name: z.string().min(1, '标签名不能为空').max(50, '标签名最多50个字符'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式必须为 #RRGGBB').optional(),
  category: z.enum(['preset', 'custom']).optional(),
});

/**
 * GET /api/tags
 * 获取所有标签
 */
router.get('/', authenticate, tagController.getTags);

/**
 * POST /api/tags
 * 创建标签
 */
router.post('/', authenticate, validate(tagSchema), tagController.createTag);

/**
 * POST /api/tags/init-presets
 * 初始化预设标签
 */
router.post('/init-presets', authenticate, authorize('admin'), tagController.initPresetTags);

/**
 * PATCH /api/tags/:id
 * 更新标签
 */
router.patch('/:id', authenticate, validate(tagSchema.partial()), tagController.updateTag);

/**
 * DELETE /api/tags/:id
 * 删除标签
 */
router.delete('/:id', authenticate, tagController.deleteTag);

export default router;
