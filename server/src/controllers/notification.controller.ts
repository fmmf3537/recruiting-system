import type { Request, Response, NextFunction } from 'express';
import * as notificationService from '../services/notification.service';

/**
 * 站内通知控制器
 */
class NotificationController {
  /**
   * GET /api/notifications
   * 获取通知列表
   */
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
      const type = req.query.type as string | undefined;

      const result = await notificationService.getNotifications(userId, page, pageSize, type);
      res.json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/notifications/unread-count
   * 获取未读通知数
   */
  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const count = await notificationService.getUnreadCount(userId);
      res.json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/notifications/mark-read
   * 标记单条通知为已读
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      await notificationService.markAsRead(req.body.notificationId, userId);
      res.json({ success: true, message: '已标记为已读' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/notifications/mark-all-read
   * 标记所有通知为已读
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      await notificationService.markAllAsRead(userId);
      res.json({ success: true, message: '全部已读' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/notifications/:id
   * 删除通知
   */
  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      await notificationService.deleteNotification(req.params.id, userId);
      res.json({ success: true, message: '通知已删除' });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
