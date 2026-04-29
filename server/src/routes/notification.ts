import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 标记已读验证 Schema
const markReadSchema = z.object({
  notificationId: z.string().cuid('无效的通知ID'),
});

// 通知 ID 参数验证
const notificationIdParamSchema = z.object({
  id: z.string().cuid('无效的通知ID'),
});

/**
 * GET /api/notifications
 * 获取通知列表（支持分页和类型筛选）
 * 权限：登录用户
 */
router.get('/', authenticate, notificationController.getNotifications);

/**
 * GET /api/notifications/unread-count
 * 获取未读通知数
 * 权限：登录用户
 */
router.get('/unread-count', authenticate, notificationController.getUnreadCount);

/**
 * POST /api/notifications/mark-read
 * 标记单条通知为已读
 * 权限：登录用户
 */
router.post(
  '/mark-read',
  authenticate,
  validate(markReadSchema),
  notificationController.markAsRead
);

/**
 * POST /api/notifications/mark-all-read
 * 标记所有通知为已读
 * 权限：登录用户
 */
router.post('/mark-all-read', authenticate, notificationController.markAllAsRead);

/**
 * DELETE /api/notifications/:id
 * 删除通知
 * 权限：登录用户
 */
router.delete(
  '/:id',
  authenticate,
  validate(notificationIdParamSchema, 'params'),
  notificationController.deleteNotification
);

export default router;
