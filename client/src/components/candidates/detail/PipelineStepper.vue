<template>
  <!-- C. Pipeline 横向步骤条：一屏总览全流程，替代超长垂直时间线做总览 -->
  <div class="stepper-card">
    <div class="stepper">
      <button
        v-for="(s, i) in steps"
        :key="s.stage"
        type="button"
        class="step"
        :class="{ done: i < currentIndex, active: i === currentIndex }"
        @click="$emit('select', i)"
      >
        <div class="step-dot">
          <el-icon v-if="i < currentIndex"><Check /></el-icon>
          <template v-else>{{ i + 1 }}</template>
        </div>
        <div class="step-name">{{ s.stage }}</div>
        <div class="step-date">{{ s.date }}</div>
      </button>
    </div>
    <div class="stepper-tip">点击阶段可跳转至对应内容 · 详细阶段记录见右栏「招聘进展」</div>
  </div>
</template>

<script setup lang="ts">
import { Check } from '@element-plus/icons-vue';

export interface StepItem {
  stage: string;
  date: string;
}

defineProps<{
  steps: StepItem[];
  currentIndex: number;
}>();

defineEmits<{
  (e: 'select', index: number): void;
}>();
</script>

<style scoped lang="scss">
.stepper-card {
  margin-top: $ui-space-md;
  padding: $ui-space-lg $ui-space-xl $ui-space-sm;
  background: $ui-gray-50;
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-md;
}

.stepper {
  display: flex;
  align-items: flex-start;
}

.step {
  flex: 1;
  text-align: center;
  position: relative;
  cursor: pointer;
  font-family: inherit;
  background: none;
  border: none;
  padding: 0;

  &::before {
    content: '';
    position: absolute;
    top: 13px;
    left: -50%;
    width: 100%;
    height: 2px;
    background: $ui-gray-300;
    z-index: 0;
  }

  &:first-child::before {
    display: none;
  }

  &.done::before {
    background: $ui-color-success;
  }

  &.active::before {
    background: linear-gradient(90deg, $ui-color-success 0%, $ui-color-primary 100%);
  }
}

.step-dot {
  width: 26px;
  height: 26px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
  background: $ui-gray-50;
  border: 2px solid $ui-gray-300;
  color: $ui-gray-500;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $ui-font-sm;
}

.step.done .step-dot {
  background: $ui-color-success;
  border-color: $ui-color-success;
  color: #fff;
}

.step.active .step-dot {
  background: $ui-color-primary;
  border-color: $ui-color-primary;
  color: #fff;
  box-shadow: 0 0 0 4px rgba(47, 111, 237, 0.15);
}

.step-name {
  margin-top: $ui-space-xs;
  font-size: $ui-font-base;
  color: $ui-gray-700;
}

.step.done .step-name {
  color: $text-primary;
}

.step.active .step-name {
  color: $ui-color-primary;
  font-weight: 600;
}

.step-date {
  font-size: $ui-font-xs;
  color: $ui-gray-500;
  min-height: 14px;
}

.stepper-tip {
  text-align: center;
  color: $ui-gray-500;
  font-size: $ui-font-sm;
  padding: $ui-space-sm 0 $ui-space-xs;
}
</style>
