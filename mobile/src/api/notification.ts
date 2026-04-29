import request from '@/lib/request';

export interface NotificationItem {
  id: string;
  recipientId: string;
  title: string;
  content: string;
  type: string;
  businessId: string | null;
  businessType: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export function getNotifications(params?: { page?: number; pageSize?: number; type?: string }) {
  return request.get('/notifications', { params });
}

export function getUnreadCount() {
  return request.get('/notifications/unread-count');
}

export function markAsRead(notificationId: string) {
  return request.post('/notifications/mark-read', { notificationId });
}

export function markAllAsRead() {
  return request.post('/notifications/mark-all-read');
}
