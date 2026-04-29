<template>
  <van-tabbar v-model="active" route safe-area-inset-bottom>
    <van-tabbar-item icon="home-o" to="/">首页</van-tabbar-item>
    <van-tabbar-item icon="friends-o" to="/candidates">候选人</van-tabbar-item>
    <van-tabbar-item icon="chat-o" to="/messages" :badge="unreadBadge">消息</van-tabbar-item>
    <van-tabbar-item icon="chart-trending-o" to="/stats">看板</van-tabbar-item>
    <van-tabbar-item icon="user-o" to="/profile">我的</van-tabbar-item>
  </van-tabbar>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { getUnreadCount } from '@/api/notification';

const route = useRoute();
const active = ref(0);
const unreadCount = ref(0);

const tabRoutes = ['/', '/candidates', '/messages', '/stats', '/profile'];

watch(
  () => route.path,
  (path) => {
    const index = tabRoutes.indexOf(path);
    active.value = index >= 0 ? index : 0;
  },
  { immediate: true }
);

const unreadBadge = computed(() => {
  if (unreadCount.value === 0) return '';
  return unreadCount.value > 99 ? '99+' : String(unreadCount.value);
});

async function fetchUnreadCount() {
  try {
    const res: any = await getUnreadCount();
    if (res.success) unreadCount.value = res.data.count;
  } catch { /* 静默失败 */ }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  fetchUnreadCount();
  pollTimer = setInterval(fetchUnreadCount, 30000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
