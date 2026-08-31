import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { OFFER_RESULTS } from '../constants';
import { offerController } from '../controllers/offer.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// ============ 验证 Schema 定义 ============

// 创建 Offer 验证 Schema
const createOfferSchema = z.object({
  candidateId: z.string().max(50).cuid('无效的候选人ID'),
  salary: z.string().min(1, '薪资不能为空').max(50),
  offerDate: z.string().max(50).datetime('无效的日期格式'),
  expectedJoinDate: z.string().max(50).datetime('无效的日期格式').optional(),
  note: z.string().max(500).optional(),
});

// 更新 Offer 验证 Schema
const updateOfferSchema = z.object({
  salary: z.string().max(50).optional(),
  offerDate: z.string().max(50).datetime('无效的日期格式').optional(),
  expectedJoinDate: z.string().max(50).datetime('无效的日期格式').optional(),
  result: z.enum([...OFFER_RESULTS] as [string, ...string[]], {
    errorMap: () => ({ message: '结果必须是：pending, accepted 或 rejected' }),
  }).optional(),
  note: z.string().max(500).optional(),
});

// 更新 Offer 结果验证 Schema
const updateResultSchema = z.object({
  result: z.enum([...OFFER_RESULTS] as [string, ...string[]], {
    errorMap: () => ({ message: '结果必须是：pending, accepted 或 rejected' }),
  }),
});

// 标记入职验证 Schema
const markAsJoinedSchema = z.object({
  actualJoinDate: z.string().max(50).datetime('无效的日期格式'),
});

// 提交审批验证 Schema
const submitApprovalSchema = z.object({
  approverId: z.string().max(50).cuid('无效的审批人ID'),
});

// 审批通过验证 Schema
const approveOfferSchema = z.object({
  note: z.string().max(500).optional(),
});

// 审批驳回验证 Schema（驳回必须填写意见）
const rejectOfferSchema = z.object({
  note: z.string().min(1, '驳回意见不能为空').max(500),
});

// 候选人 ID 参数验证
const candidateIdParamSchema = z.object({
  candidateId: z.string().max(50).cuid('无效的候选人ID'),
});

// 列表查询验证 Schema
const listOffersQuerySchema = z.object({
  page: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 10)),
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
 * POST /api/offers/:candidateId/submit
 * 提交审批（draft/rejected → pending_approval）
 * 权限：登录用户
 */
router.post(
  '/:candidateId/submit',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(submitApprovalSchema),
  offerController.submitOfferApproval
);

/**
 * POST /api/offers/:candidateId/approve
 * 审批通过（仅 admin 或指定审批人，service 层校验）
 * 权限：登录用户
 */
router.post(
  '/:candidateId/approve',
  authenticate,
  requirePermission('offer:approve'),
  validate(candidateIdParamSchema, 'params'),
  validate(approveOfferSchema),
  offerController.approveOffer
);

/**
 * POST /api/offers/:candidateId/reject
 * 审批驳回（仅 admin 或指定审批人，需填写意见）
 * 权限：登录用户
 */
router.post(
  '/:candidateId/reject',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(rejectOfferSchema),
  offerController.rejectOffer
);

/**
 * POST /api/offers/:candidateId/send
 * 标记已发送（approved → sent）
 * 权限：登录用户
 */
router.post(
  '/:candidateId/send',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  offerController.markOfferSent
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
