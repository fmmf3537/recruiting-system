import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * 站内通知服务
 * 提供通知的增删查及已读管理
 */

export interface CreateNotificationInput {
  recipientId: string;
  title: string;
  content: string;
  type: string;
  businessId?: string;
  businessType?: string;
}

/**
 * 创建单条通知
 */
export async function createNotification(data: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      recipientId: data.recipientId,
      title: data.title,
      content: data.content,
      type: data.type,
      businessId: data.businessId || null,
      businessType: data.businessType || null,
    },
  });
}

/**
 * 批量创建通知（同一内容发给多个用户）
 */
export async function createNotificationForUsers(
  data: Omit<CreateNotificationInput, 'recipientId'>,
  userIds: string[]
) {
  const notifications = await Promise.allSettled(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          recipientId: userId,
          title: data.title,
          content: data.content,
          type: data.type,
          businessId: data.businessId || null,
          businessType: data.businessType || null,
        },
      })
    )
  );

  const success = notifications.filter((r) => r.status === 'fulfilled').length;
  const failed = notifications.filter((r) => r.status === 'rejected').length;
  return { success, failed };
}

/**
 * 获取通知列表（分页）
 */
export async function getNotifications(
  userId: string,
  page = 1,
  pageSize = 20,
  typeFilter?: string
) {
  const skip = (page - 1) * pageSize;
  const where: any = { recipientId: userId };
  if (typeFilter) {
    where.type = typeFilter;
  }

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取未读通知数
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId: userId, isRead: false },
  });
}

/**
 * 标记单条通知为已读
 */
export async function markAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientId: userId },
  });
  if (!notification) {
    throw new AppError('通知不存在', 404);
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * 标记所有通知为已读
 */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { recipientId: userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * 删除通知
 */
export async function deleteNotification(notificationId: string, userId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientId: userId },
  });
  if (!notification) {
    throw new AppError('通知不存在', 404);
  }

  await prisma.notification.delete({ where: { id: notificationId } });
}
