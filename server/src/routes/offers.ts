import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { OFFER_RESULTS } from '../constants';
import { offerController } from '../controllers/offer.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// ============ 验证 Schema 定义 ============

// 创建 Offer 验证 Schema
const createOfferSchema = z.object({
  candidateId: z.string().cuid('无效的候选人ID'),
  salary: z.string().min(1, '薪资不能为空'),
  offerDate: z.string().datetime('无效的日期格式'),
  expectedJoinDate: z.string().datetime('无效的日期格式').optional(),
  note: z.string().optional(),
});

// 更新 Offer 验证 Schema
const updateOfferSchema = z.object({
  salary: z.string().optional(),
  offerDate: z.string().datetime('无效的日期格式').optional(),
  expectedJoinDate: z.string().datetime('无效的日期格式').optional(),
  result: z.enum([...OFFER_RESULTS] as [string, ...string[]], {
    errorMap: () => ({ message: '结果必须是：pending, accepted 或 rejected' }),
  }).optional(),
  note: z.string().optional(),
});

// 更新 Offer 结果验证 Schema
const updateResultSchema = z.object({
  result: z.enum([...OFFER_RESULTS] as [string, ...string[]], {
    errorMap: () => ({ message: '结果必须是：pending, accepted 或 rejected' }),
  }),
});

// 标记入职验证 Schema
const markAsJoinedSchema = z.object({
  actualJoinDate: z.string().datetime('无效的日期格式'),
});

// 候选人 ID 参数验证
const candidateIdParamSchema = z.object({
  candidateId: z.string().cuid('无效的候选人ID'),
});

// 列表查询验证 Schema
const listOffersQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  result: z.enum([...OFFER_RESULTS] as [string, ...string[]]).optional(),
});

// ============ 路由定义 ============

/**
 * GET /api/offers
 * 获取 Offer 列表（支持分页和结果筛选）
 * 权限：登录用户
 */
router.get(
  '/',
  authenticate,
  validate(listOffersQuerySchema, 'query'),
  offerController.getOffers
);

/**
 * GET /api/offers/:candidateId
 * 获取某候选人 Offer
 * 权限：登录用户
 */
router.get(
  '/:candidateId',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  offerController.getOfferByCandidateId
);

/**
 * POST /api/offers
 * 创建 Offer
 * 权限：登录用户
 */
router.post(
  '/',
  authenticate,
  validate(createOfferSchema),
  offerController.createOffer
);

/**
 * PATCH /api/offers/:candidateId
 * 更新 Offer（result=accepted 时自动推进到入职阶段）
 * 权限：登录用户
 */
router.patch(
  '/:candidateId',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(updateOfferSchema),
  offerController.updateOffer
);

/**
 * PATCH /api/offers/:candidateId/result
 * 更新 Offer 结果
 * 权限：登录用户
 */
router.patch(
  '/:candidateId/result',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(updateResultSchema),
  offerController.updateOfferResult
);

/**
 * PATCH /api/offers/:candidateId/join
 * 标记入职
 * 权限：登录用户
 */
router.patch(
  '/:candidateId/join',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(markAsJoinedSchema),
  offerController.markAsJoined
);

/**
 * DELETE /api/offers/:candidateId
 * 删除 Offer
 * 权限：登录用户
 */
router.delete(
  '/:candidateId',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  offerController.deleteOffer
);

export default router;
