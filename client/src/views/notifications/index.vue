<template>
  <div class="notifications-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">消息通知</h2>
        <span class="page-subtitle">
          共 {{ pagination.total }} 条，
          <el-tag size="small" type="warning">{{ unreadCount }} 条未读</el-tag>
        </span>
      </div>
      <el-button @click="handleMarkAllRead" :disabled="unreadCount === 0">全部已读</el-button>
    </div>

    <!-- 类型筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-radio-group v-model="filterType" @change="handleFilterChange">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="stage_advance">阶段变动</el-radio-button>
        <el-radio-button label="interview_scheduled">面试提醒</el-radio-button>
        <el-radio-button label="offer_status">Offer</el-radio-button>
      </el-radio-group>
    </el-card>

    <!-- 通知列表 -->
    <el-card shadow="never" class="list-card" v-loading="loading">
      <div v-if="list.length" class="notification-list">
        <div
          v-for="item in list"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.isRead }"
          @click="handleItemClick(item)"
        >
          <div class="item-dot" :class="{ active: !item.isRead }" />
          <div class="item-content">
            <div class="item-header">
              <span class="item-title">{{ item.title }}</span>
              <el-tag size="small" :type="getTypeTag(item.type)">
                {{ getTypeLabel(item.type) }}
              </el-tag>
            </div>
            <div class="item-body">{{ item.content }}</div>
            <div class="item-time">{{ formatDate(item.createdAt) }}</div>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无通知" />

      <div class="pagination-wrapper" v-if="pagination.totalPages > 1">
        <el-pagination
          v-model:current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="fetchList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useNotificationStore } from '@/stores/notification';
import type { NotificationItem } from '@/api/notification';

const router = useRouter();
const notificationStore = useNotificationStore();

const loading = ref(false);
const list = ref<NotificationItem[]>([]);
const filterType = ref('');
const pagination = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

const unreadCount = ref(0);

async function fetchList() {
  loading.value = true;
  try {
    const params: any = { page: pagination.page, pageSize: pagination.pageSize };
    if (filterType.value) params.type = filterType.value;

    const res = await notificationStore.fetchNotifications(params.page, params.pageSize);
    if (res) {
      list.value = notificationStore.notifications;
      Object.assign(pagination, res);
    }
    unreadCount.value = notificationStore.unreadCount;
  } finally {
    loading.value = false;
  }
}

function handleFilterChange() {
  pagination.page = 1;
  fetchList();
}

function handleItemClick(item: NotificationItem) {
  if (!item.isRead) {
    notificationStore.readOne(item.id);
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

async function handleMarkAllRead() {
  await notificationStore.readAll();
  ElMessage.success('全部已读');
  fetchList();
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    stage_advance: '阶段变动',
    interview_scheduled: '面试提醒',
    offer_status: 'Offer',
    onboarding_reminder: '入职提醒',
  };
  return map[type] || type;
}

function getTypeTag(type: string): string {
  const map: Record<string, string> = {
    stage_advance: '',
    interview_scheduled: 'primary',
    offer_status: 'success',
    onboarding_reminder: 'warning',
  };
  return map[type] || 'info';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

onActivated(() => {
  fetchList();
});
</script>

<style scoped lang="scss">
.notifications-page { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
  .title-section { .page-title { margin: 0; font-size: 24px; font-weight: 500; }
    .page-subtitle { margin-top: 8px; font-size: 14px; color: #909399; }
  }
}
.filter-card { margin-bottom: 20px; }
.list-card {
  .notification-list {
    .notification-item {
      display: flex;
      align-items: flex-start;
      padding: 16px 0;
      border-bottom: 1px solid #f5f5f5;
      cursor: pointer;

      &.unread { background-color: #f0f9ff; margin: 0 -20px; padding: 16px 20px; }

      &:hover { background-color: #f5f7fa; margin: 0 -20px; padding: 16px 20px; }

      .item-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #dcdfe6;
        margin: 8px 12px 0 0; flex-shrink: 0;
        &.active { background: #409EFF; }
      }

      .item-content {
        flex: 1;
        .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;
          .item-title { font-size: 15px; font-weight: 500; color: #303133; }
        }
        .item-body { font-size: 13px; color: #606266; margin-bottom: 6px; }
        .item-time { font-size: 12px; color: #909399; }
      }
    }
  }
  .pagination-wrapper { display: flex; justify-content: center; margin-top: 20px; }
}
</style>
