import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  type NotificationItem,
} from '@/api/notification';

export const useNotificationStore = defineStore('notification', () => {
  const unreadCount = ref(0);
  const notifications = ref<NotificationItem[]>([]);
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchUnreadCount() {
    try {
      const res = await getUnreadCount();
      if (res.success) unreadCount.value = res.data.count;
    } catch {
      // 静默失败
    }
  }

  async function fetchNotifications(page = 1, pageSize = 10, type?: string) {
    try {
      const res = await getNotifications({ page, pageSize, type });
      if (res.success) {
        notifications.value = res.data;
        return res.pagination;
      }
    } catch {
      // 静默失败
    }
    return null;
  }

  async function readOne(notificationId: string) {
    try {
      await markAsRead(notificationId);
      if (unreadCount.value > 0) unreadCount.value--;
      // 更新列表中的已读状态
      const item = notifications.value.find((n) => n.id === notificationId);
      if (item) item.isRead = true;
    } catch {
      // 静默失败
    }
  }

  async function readAll() {
    try {
      await markAllAsRead();
      unreadCount.value = 0;
      notifications.value.forEach((n) => (n.isRead = true));
    } catch {
      // 静默失败
    }
  }

  function startPolling(intervalMs = 30000) {
    stopPolling();
    fetchUnreadCount();
    pollingTimer = setInterval(fetchUnreadCount, intervalMs);

    // 页面不可见时暂停轮询
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    } else {
      fetchUnreadCount();
      pollingTimer = setInterval(fetchUnreadCount, 30000);
    }
  }

  return {
    unreadCount,
    notifications,
    fetchUnreadCount,
    fetchNotifications,
    readOne,
    readAll,
    startPolling,
    stopPolling,
  };
});
