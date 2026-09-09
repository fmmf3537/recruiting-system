<template>
  <div class="ui-state empty-state" :class="{ 'ui-empty': type === 'empty' }">
    <div class="empty-state__icon" :class="`empty-state__icon--${type}`" aria-hidden="true">
      <!-- 空态：收件箱 -->
      <svg v-if="type === 'empty'" viewBox="0 0 48 48" fill="none">
        <rect
          x="6"
          y="14"
          width="36"
          height="24"
          rx="4"
          stroke="currentColor"
          stroke-width="2"
        />
        <path
          d="M6 18l14.4 9.6a6 6 0 0 0 6.4 0L41.6 18"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
      <!-- 错误态：圆形感叹号 -->
      <svg v-else-if="type === 'error'" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2" />
        <path d="M24 16v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <circle cx="24" cy="32" r="1.5" fill="currentColor" />
      </svg>
      <!-- 无权限态：锁 -->
      <svg v-else viewBox="0 0 48 48" fill="none">
        <rect
          x="12"
          y="22"
          width="24"
          height="16"
          rx="3"
          stroke="currentColor"
          stroke-width="2"
        />
        <path
          d="M18 22v-5a6 6 0 0 1 12 0v5"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </div>
    <p class="ui-state__title">{{ displayTitle }}</p>
    <p v-if="description" class="ui-state__desc">{{ description }}</p>
    <el-button v-if="actionText" type="primary" @click="emit('action')">
      {{ actionText }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type StateType = 'empty' | 'error' | 'forbidden';

const props = defineProps<{
  type: StateType;
  title?: string;
  description?: string;
  actionText?: string;
}>();

const emit = defineEmits<{
  action: [];
}>();

const defaultTitles: Record<StateType, string> = {
  empty: '暂无数据',
  error: '加载失败',
  forbidden: '你没有查看权限',
};

const displayTitle = computed(() => props.title || defaultTitles[props.type]);
</script>

<style scoped lang="scss">
.empty-state__icon {
  width: 48px;
  height: 48px;
  color: $ui-gray-500;
}

.empty-state__icon svg {
  width: 100%;
  height: 100%;
}

.empty-state__icon--error {
  color: $ui-color-danger;
}
</style>
