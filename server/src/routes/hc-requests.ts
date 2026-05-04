import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { hcRequestController } from '../controllers/hc-request.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { HC_URGENCY, HC_REASONS } from '../constants';

const router: RouterType = Router();

// 创建编制验证 Schema
const createHCSchema = z.object({
  title: z.string().min(2, '岗位名称至少2个字').max(50),
  department: z.string().min(1, '需求部门不能为空'),
  level: z.string().min(1, '职级不能为空'),
  headcount: z.preprocess(
    (v) => (typeof v === 'string' ? parseInt(v, 10) : v),
    z.number().int().min(1, '需求人数至少为1').max(999)
  ),
  urgency: z.enum(HC_URGENCY as unknown as [string, ...string[]]),
  expectedDate: z.string().optional(),
  salaryMin: z.string().optional(),
  salaryMax: z.string().optional(),
  reason: z.enum(HC_REASONS as unknown as [string, ...string[]]),
  reasonNote: z.string().optional(),
});

// 更新编制验证 Schema
const updateHCSchema = z.object({
  title: z.string().min(2).max(50).optional(),
  department: z.string().optional(),
  level: z.string().optional(),
  headcount: z.preprocess(
    (v) => (typeof v === 'string' ? parseInt(v, 10) : v),
    z.number().int().min(1).max(999)
  ).optional(),
  urgency: z.enum(HC_URGENCY as unknown as [string, ...string[]]).optional(),
  expectedDate: z.string().optional().nullable(),
  salaryMin: z.string().optional().nullable(),
  salaryMax: z.string().optional().nullable(),
  reason: z.enum(HC_REASONS as unknown as [string, ...string[]]).optional(),
  reasonNote: z.string().optional().nullable(),
});

// 审批验证 Schema
const approveSchema = z.object({
  note: z.string().optional(),
});

const rejectSchema = z.object({
  note: z.string().min(1, '驳回意见不能为空'),
});

// ID 参数验证
const idParamSchema = z.object({ id: z.string().cuid('无效的ID') });

/**
 * GET /api/hc-requests — 列表
 */
router.get('/', authenticate, hcRequestController.getHCRequests);

/**
 * GET /api/hc-requests/:id — 详情
 */
router.get('/:id', authenticate, validate(idParamSchema, 'params'), hcRequestController.getHCRequestById);

/**
 * POST /api/hc-requests — 创建
 */
router.post('/', authenticate, validate(createHCSchema), hcRequestController.createHCRequest);

/**
 * PATCH /api/hc-requests/:id — 更新
 */
router.patch('/:id', authenticate, validate(idParamSchema, 'params'), validate(updateHCSchema), hcRequestController.updateHCRequest);

/**
 * POST /api/hc-requests/:id/submit — 提交审批
 */
router.post('/:id/submit', authenticate, validate(idParamSchema, 'params'), hcRequestController.submitHCRequest);

/**
 * POST /api/hc-requests/:id/approve — 审批通过
 */
router.post('/:id/approve', authenticate, authorize('admin'), validate(idParamSchema, 'params'), validate(approveSchema), hcRequestController.approveHCRequest);

/**
 * POST /api/hc-requests/:id/reject — 驳回
 */
router.post('/:id/reject', authenticate, authorize('admin'), validate(idParamSchema, 'params'), validate(rejectSchema), hcRequestController.rejectHCRequest);

/**
 * POST /api/hc-requests/:id/create-job — 一键创建职位
 */
router.post('/:id/create-job', authenticate, authorize('admin'), validate(idParamSchema, 'params'), hcRequestController.createJobFromHCRequest);

/**
 * DELETE /api/hc-requests/:id — 删除
 */
router.delete('/:id', authenticate, validate(idParamSchema, 'params'), hcRequestController.deleteHCRequest);

export default router;
