<template>
  <div class="messages-page">
    <van-nav-bar title="消息" fixed placeholder />
    <div class="page-content">
      <!-- 类型筛选 -->
      <van-tabs v-model:active="activeTab" @change="handleTabChange">
        <van-tab title="全部" name="" />
        <van-tab title="阶段变动" name="stage_advance" />
        <van-tab title="面试提醒" name="interview_scheduled" />
        <van-tab title="Offer" name="offer_status" />
      </van-tabs>

      <!-- 通知列表 -->
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <van-list
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多了"
          @load="onLoad"
        >
          <van-cell
            v-for="item in list"
            :key="item.id"
            :title="item.title"
            :label="item.content"
            :value="formatTime(item.createdAt)"
            is-link
            @click="handleClick(item)"
          >
            <template #icon>
              <van-badge :dot="!item.isRead" style="margin-right: 8px;">
                <van-icon :name="getTypeIcon(item.type)" size="20" :color="item.isRead ? '#999' : '#1989fa'" />
              </van-badge>
            </template>
          </van-cell>
        </van-list>
        <van-empty v-if="!list.length && !loading" description="暂无消息" />
      </van-pull-refresh>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getNotifications, markAsRead } from '@/api/notification';
import type { NotificationItem } from '@/api/notification';

const router = useRouter();
const activeTab = ref('');
const list = ref<NotificationItem[]>([]);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
let page = 1;
const pageSize = 15;

async function fetchData(reset = false) {
  if (reset) {
    page = 1;
    finished.value = false;
  }

  try {
    const params: any = { page, pageSize };
    if (activeTab.value) params.type = activeTab.value;

    const res: any = await getNotifications(params);

    if (res.success) {
      if (reset) {
        list.value = res.data;
      } else {
        list.value.push(...res.data);
      }
      if (res.data.length < pageSize || page >= res.pagination.totalPages) {
        finished.value = true;
      }
      page++;
    }
  } catch {
    showToast('加载失败');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function onLoad() {
  fetchData();
}

function onRefresh() {
  refreshing.value = true;
  fetchData(true);
}

function handleTabChange() {
  fetchData(true);
}

async function handleClick(item: NotificationItem) {
  if (!item.isRead) {
    try {
      await markAsRead(item.id);
      item.isRead = true;
    } catch { /* */ }
  }

  if (item.businessId) {
    if (item.businessType === 'candidate') {
      router.push(`/candidates/${item.businessId}`);
    } else if (item.businessType === 'offer') {
      router.push(`/offers/${item.businessId}`);
    } else if (item.businessType === 'interview') {
      router.push(`/candidates/${item.businessId}`);
    }
  }
}

function getTypeIcon(type: string): string {
  const map: Record<string, string> = {
    stage_advance: 'todo-list-o',
    interview_scheduled: 'clock-o',
    offer_status: 'gold-coin-o',
    onboarding_reminder: 'logistics',
  };
  return map[type] || 'bell';
}

function formatTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}
</script>

<style scoped>
.messages-page {
  min-height: 100%;
  background-color: #f7f8fa;
}
.page-content {
  padding-bottom: 50px;
}
</style>
