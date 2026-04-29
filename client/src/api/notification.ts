import request from '@/utils/request';

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

export function getNotifications(params?: {
  page?: number;
  pageSize?: number;
  type?: string;
}): Promise<{
  success: boolean;
  data: NotificationItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  return request.get('/notifications', { params }) as Promise<{
    success: boolean;
    data: NotificationItem[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>;
}

export function getUnreadCount(): Promise<{ success: boolean; data: { count: number } }> {
  return request.get('/notifications/unread-count') as Promise<{ success: boolean; data: { count: number } }>;
}

export function markAsRead(notificationId: string): Promise<{ success: boolean }> {
  return request.post('/notifications/mark-read', { notificationId }) as Promise<{ success: boolean }>;
}

export function markAllAsRead(): Promise<{ success: boolean }> {
  return request.post('/notifications/mark-all-read') as Promise<{ success: boolean }>;
}

export function deleteNotification(id: string): Promise<{ success: boolean }> {
  return request.delete(`/notifications/${id}`) as Promise<{ success: boolean }>;
}
