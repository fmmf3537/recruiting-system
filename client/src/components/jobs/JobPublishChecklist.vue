<template>
  <!-- UI-S5：发布前检查栏（纯展示，不发请求、不改数据） -->
  <el-card class="job-publish-checklist" shadow="never">
    <div class="checklist-header">
      <span class="checklist-title">发布前检查</span>
      <span class="checklist-progress">{{ doneCount }}/{{ items.length }}</span>
    </div>
    <ul class="checklist-list">
      <li
        v-for="item in items"
        :key="item.prop"
        class="checklist-item"
        :class="{ 'is-done': item.done }"
        @click="emit('locate', item.prop)"
      >
        <el-icon v-if="item.done" class="checklist-icon is-done">
          <CircleCheckFilled />
        </el-icon>
        <span v-else class="checklist-dot" aria-hidden="true" />
        <span class="checklist-label">{{ item.label }}</span>
      </li>
    </ul>
    <el-alert
      v-if="allDone && items.length > 0"
      title="可以发布了"
      type="success"
      :closable="false"
      show-icon
      class="checklist-ready"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheckFilled } from '@element-plus/icons-vue';

export type ChecklistItem = {
  prop: string;
  label: string;
  done: boolean;
};

const props = defineProps<{
  items: ChecklistItem[];
}>();

const emit = defineEmits<{
  locate: [prop: string];
}>();

const doneCount = computed(() => props.items.filter((item) => item.done).length);
const allDone = computed(() => props.items.length > 0 && doneCount.value === props.items.length);
</script>

<style scoped lang="scss">
.job-publish-checklist {
  margin-bottom: $ui-space-lg;
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-md;
  background: $bg-white;
}

.checklist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $ui-space-md;
}

.checklist-title {
  font-size: $ui-font-md;
  font-weight: 500;
  color: $ui-gray-900;
}

.checklist-progress {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
}

.checklist-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: $ui-space-sm;
  padding: $ui-space-xs 0;
  cursor: pointer;
  color: $ui-gray-700;
  font-size: $ui-font-base;

  &:hover {
    color: $ui-color-primary;
  }

  &.is-done {
    color: $ui-gray-500;
  }
}

.checklist-icon.is-done {
  color: $ui-color-success;
  font-size: 16px;
}

.checklist-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1.5px solid $ui-gray-300;
  border-radius: 50%;
  flex-shrink: 0;
}

.checklist-label {
  line-height: 1.4;
}

.checklist-ready {
  margin-top: $ui-space-md;
}
</style>
