<template>
  <!-- B. 下一步行动条：状态机驱动，全页唯一主 CTA -->
  <div class="next-action" :class="`is-${action.tone}`">
    <span class="na-icon">{{ action.icon }}</span>
    <div class="na-body">
      <div class="na-label">下一步行动</div>
      <div class="na-text">
        {{ action.text }}
        <span v-if="action.overdueDays > 0" class="na-overdue">已超期 {{ action.overdueDays }} 天</span>
      </div>
      <div v-if="action.sub" class="na-sub">{{ action.sub }}</div>
    </div>
    <el-button
      v-if="action.btnText"
      type="primary"
      size="large"
      @click="$emit('primary')"
    >
      {{ action.btnText }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import type { NextActionState } from './useCandidateNextAction';

defineProps<{
  action: NextActionState;
}>();

defineEmits<{
  (e: 'primary'): void;
}>();
</script>

<style scoped lang="scss">
.next-action {
  display: flex;
  align-items: center;
  gap: $ui-space-lg;
  margin-top: $ui-space-md;
  padding: $ui-space-md $ui-space-xl;
  border-radius: $ui-radius-md;
  border: $ui-border-width solid $ui-border-color-light;
  background: $ui-gray-50;

  &.is-todo {
    background: linear-gradient(90deg, #fdf6ec, $ui-gray-50);
    border-color: #f5dab1;
  }

  &.is-overdue {
    background: linear-gradient(90deg, #fef0f0, $ui-gray-50);
    border-color: #fbc4c4;
  }

  &.is-success {
    background: linear-gradient(90deg, #f0f9eb, $ui-gray-50);
    border-color: #c2e7b0;
  }
}

.na-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.na-body {
  flex: 1;
  min-width: 0;
}

.na-label {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
}

.na-text {
  font-size: $ui-font-lg;
  font-weight: 600;
}

.na-overdue {
  color: $ui-color-danger;
  font-weight: 600;
  margin-left: $ui-space-sm;
  font-size: $ui-font-base;
}

.na-sub {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  margin-top: 2px;
}
</style>
