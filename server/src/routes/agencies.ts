import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { agencyController } from '../controllers/agency.controller';
import { authenticate } from '../middleware/auth';
import { requireMatrixPermission } from '../middleware/role';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// ===== zod 校验 schema =====

const createAgencySchema = z.object({
  name: z.string().min(1, '机构名称不能为空').max(50, '机构名称不超过 50 字'),
  contact: z.string().max(50).optional(),
  phone: z.string().regex(/^[\d\-+()\s]{6,30}$/, '联系电话格式不正确').optional(),
  remark: z.string().max(1000).optional(),
});

const updateAgencySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  contact: z.string().max(50).nullable().optional(),
  phone: z.string().regex(/^[\d\-+()\s]{6,30}$/).nullable().optional(),
  remark: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
});

const agencyIdParamSchema = z.object({
  id: z.string().max(50).cuid('无效的机构 ID'),
});

const linkIdParamSchema = z.object({
  linkId: z.string().max(50).cuid('无效的链接 ID'),
});

const createLinkSchema = z.object({
  jobId: z.string().max(50).cuid('无效的职位 ID').optional(),
  // 显式传 null = 长期；缺省 = +90 天；显式 ISO 字符串 = 自定义
  expiresAt: z.string().datetime({ message: 'expiresAt 需为 ISO 时间字符串' }).nullable().optional(),
});

const permission = requireMatrixPermission('agency:manage');

// ===== 路由注册 =====
// 全部需要 authenticate + agency:manage 权限

router.post(
  '/',
  authenticate,
  permission,
  validate(createAgencySchema),
  agencyController.createAgency
);

router.patch(
  '/:id',
  authenticate,
  permission,
  validate(agencyIdParamSchema, 'params'),
  validate(updateAgencySchema),
  agencyController.updateAgency
);

router.get(
  '/',
  authenticate,
  permission,
  agencyController.listAgencies
);

// 注意：链接生成 / 统计都需要 /:id 占位，挂在通用 :id 下
router.post(
  '/:id/links',
  authenticate,
  permission,
  validate(agencyIdParamSchema, 'params'),
  validate(createLinkSchema),
  agencyController.createLink
);

router.get(
  '/:id/stats',
  authenticate,
  permission,
  validate(agencyIdParamSchema, 'params'),
  agencyController.getStats
);

// 链接停用：路径段 `/links/:linkId` 必须注册在 `/:id` 之前，否则会被 :id 拦截
// （说明：当前路由里没有 `/links/:linkId` 之外的 /:id GET/PATCH/DELETE 顺序冲突，但保留此注释以提示未来扩展）
router.delete(
  '/links/:linkId',
  authenticate,
  permission,
  validate(linkIdParamSchema, 'params'),
  agencyController.disableLink
);

export default router;