<template>
  <!-- 沟通记录：倒序时间流 + 快速添加 -->
  <div class="comm-panel">
    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="load-alert">
      <template #title>
        沟通记录加载失败
        <el-button link type="primary" @click="$emit('retry')">重新加载</el-button>
      </template>
    </el-alert>

    <template v-if="communications.length">
      <div v-for="log in communications" :key="log.id" class="comm-item">
        <div class="comm-dot"></div>
        <div class="comm-body">
          <div class="comm-meta">
            <b>{{ log.type }}</b> · {{ log.createdBy?.name || '—' }} · {{ formatDateTime(log.createdAt) }}
          </div>
          <div class="comm-text">{{ log.content }}</div>
          <div v-if="log.result" class="comm-result">结果：{{ log.result }}</div>
          <div v-if="log.followUpAt" class="comm-followup">
            <el-icon><Clock /></el-icon> 跟进提醒：{{ formatDateTime(log.followUpAt) }}
          </div>
        </div>
      </div>
    </template>
    <el-empty v-else-if="!loadError" description="暂无沟通记录" :image-size="60" />

    <div class="comm-add">
      <el-button type="primary" plain @click="$emit('add')">
        <el-icon><Plus /></el-icon>添加沟通记录
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Clock, Plus } from '@element-plus/icons-vue';

import type { CommunicationItem } from '@/api/communication';

defineProps<{
  communications: CommunicationItem[];
  loadError: boolean;
}>();

defineEmits<{
  (e: 'add'): void;
  (e: 'retry'): void;
}>();

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped lang="scss">
.load-alert {
  margin-bottom: $ui-space-md;
}

.comm-item {
  display: flex;
  gap: $ui-space-md;
  margin-bottom: $ui-space-lg;
}

.comm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $ui-gray-300;
  margin-top: 7px;
  flex-shrink: 0;
}

.comm-body {
  flex: 1;
  min-width: 0;
}

.comm-meta {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  margin-bottom: 2px;

  b {
    color: $ui-gray-700;
  }
}

.comm-text {
  font-size: $ui-font-base;
}

.comm-result {
  font-size: $ui-font-sm;
  color: $ui-color-success;
  margin-top: 2px;
}

.comm-followup {
  font-size: $ui-font-sm;
  color: $ui-color-warning;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.comm-add {
  margin-top: $ui-space-sm;
}
</style>
