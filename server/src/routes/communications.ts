import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { communicationController } from '../controllers/communication.controller';
import { communicationService } from '../services/communication.service';
import { authenticate } from '../middleware/auth';
import { validate, validateAll } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { COMMUNICATION_TYPES } from '../constants';

const router: RouterType = Router();

// 创建沟通记录验证
const createCommunicationSchema = z.object({
  candidateId: z.string().cuid('无效的候选人ID'),
  type: z.enum([...COMMUNICATION_TYPES] as [string, ...string[]], {
    errorMap: () => ({ message: '沟通方式无效' }),
  }),
  content: z.string().min(1, '沟通内容不能为空'),
  result: z.string().optional(),
  followUpAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: '无效的跟进时间' })
    .optional(),
});

// 更新沟通记录验证
const updateCommunicationSchema = z.object({
  type: z.enum([...COMMUNICATION_TYPES] as [string, ...string[]]).optional(),
  content: z.string().min(1).optional(),
  result: z.string().optional(),
  followUpAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: '无效的时间格式' })
    .optional()
    .nullable(),
});

// ID 参数验证
const idParamSchema = z.object({
  id: z.string().cuid('无效的ID'),
});

/**
 * GET /api/communications/follow-ups
 * 获取待跟进提醒（必须在 /:id 之前）
 */
router.get(
  '/follow-ups',
  authenticate,
  communicationController.getPendingFollowUps
);

/**
 * GET /api/communications
 * 沟通记录列表
 */
router.get(
  '/',
  authenticate,
  communicationController.getCommunications
);

/**
 * POST /api/communications
 * 创建沟通记录
 */
router.post(
  '/',
  authenticate,
  validate(createCommunicationSchema),
  communicationController.createCommunication
);

/**
 * GET /api/communications/:id
 * 沟通记录详情
 */
router.get(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const data = await communicationService.getCommunicationById(req.params.id);
    res.json({ success: true, data });
  })
);

/**
 * PATCH /api/communications/:id
 * 更新沟通记录
 */
router.patch(
  '/:id',
  authenticate,
  validateAll({ params: idParamSchema, body: updateCommunicationSchema }),
  communicationController.updateCommunication
);

/**
 * DELETE /api/communications/:id
 * 删除沟通记录
 */
router.delete(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  communicationController.deleteCommunication
);

export default router;
