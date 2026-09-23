<template>
  <!-- Offer · 入职：Offer 卡片 + 审批状态 + 入职任务清单 -->
  <div class="offer-panel">
    <template v-if="offer">
      <div class="offer-card">
        <div class="offer-head">
          <span class="offer-title">Offer · {{ candidateName }}</span>
          <div class="offer-tags">
            <el-tag :type="getOfferStatusType(offer.status)">{{ getOfferStatusText(offer.status) }}</el-tag>
            <el-tag :type="getOfferResultType(offer.result)">{{ getOfferResultText(offer.result) }}</el-tag>
          </div>
        </div>
        <div class="offer-body">
          <div class="offer-grid">
            <div class="cell">
              <div class="k">薪资</div>
              <div class="v">{{ offer.salary || '未填写' }}</div>
            </div>
            <div class="cell">
              <div class="k">Offer 日期</div>
              <div class="v">{{ formatDate(offer.offerDate) }}</div>
            </div>
            <div class="cell">
              <div class="k">预计入职</div>
              <div class="v">{{ offer.expectedJoinDate ? formatDate(offer.expectedJoinDate) : '未填写' }}</div>
            </div>
            <div class="cell">
              <div class="k">入职状态</div>
              <div class="v">
                <el-tag size="small" :type="offer.joined ? 'success' : 'info'">
                  {{ offer.joined ? '已入职' : '未入职' }}
                </el-tag>
              </div>
            </div>
          </div>
          <div v-if="offer.approveNote" class="offer-note">审批意见：{{ offer.approveNote }}</div>
          <div class="offer-actions">
            <el-button type="primary" @click="$emit('viewOffer')">查看 Offer 详情</el-button>
          </div>
        </div>
      </div>

      <!-- 入职任务清单 -->
      <div class="sec-title">入职任务清单</div>
      <el-alert v-if="tasksLoadError" type="error" :closable="false" show-icon>
        <template #title>
          入职任务加载失败
          <el-button link type="primary" @click="$emit('retryTasks')">重新加载</el-button>
        </template>
      </el-alert>
      <template v-else>
        <div v-if="!onboardingTasks.length" class="task-empty">
          <span>暂无入职任务</span>
          <el-button type="primary" link size="small" @click="$emit('generateTasks')">生成标准任务</el-button>
        </div>
        <div v-else class="task-list">
          <div v-for="task in onboardingTasks" :key="task.id" class="task-item">
            <el-checkbox
              :model-value="task.status === 'completed'"
              @change="(val: boolean) => $emit('toggleTask', task.id, val)"
            >
              <span :class="{ 'task-completed': task.status === 'completed' }">{{ task.title }}</span>
            </el-checkbox>
            <el-tag size="small" type="info">{{ task.category }}</el-tag>
          </div>
        </div>
      </template>
    </template>

    <el-empty v-else description="当前阶段尚未进入 Offer 流程">
      <el-button v-if="canCreateOffer" type="primary" @click="$emit('createOffer')">创建 Offer</el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import type { OfferInfo } from '@/api/candidate';
import type { OnboardingTask } from '@/api/onboarding-task';

defineProps<{
  offer: OfferInfo | null;
  candidateName: string;
  canCreateOffer: boolean;
  onboardingTasks: OnboardingTask[];
  tasksLoadError: boolean;
}>();

defineEmits<{
  (e: 'createOffer' | 'viewOffer' | 'generateTasks' | 'retryTasks'): void;
  (e: 'toggleTask', taskId: string, completed: boolean): void;
}>();

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getOfferStatusType(status: string): string {
  return {
    draft: 'info',
    pending_approval: 'warning',
    approved: 'success',
    rejected: 'danger',
    sent: 'primary',
  }[status] || 'info';
}

function getOfferStatusText(status: string): string {
  return {
    draft: '草稿待提交',
    pending_approval: '待审批',
    approved: '已审批',
    rejected: '已驳回',
    sent: '已发送',
  }[status] || status;
}

function getOfferResultType(result: string): string {
  return { pending: 'warning', accepted: 'success', rejected: 'danger' }[result] || 'info';
}

function getOfferResultText(result: string): string {
  return { pending: '待确认', accepted: '已接受', rejected: '已拒绝' }[result] || result;
}
</script>

<style scoped lang="scss">
.offer-card {
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-md;
  overflow: hidden;
}

.offer-head {
  background: $ui-gray-100;
  padding: $ui-space-sm $ui-space-lg;
  display: flex;
  align-items: center;
  gap: $ui-space-md;
  flex-wrap: wrap;
}

.offer-title {
  font-weight: 600;
  font-size: $ui-font-md;
}

.offer-tags {
  margin-left: auto;
  display: flex;
  gap: $ui-space-sm;
}

.offer-body {
  padding: $ui-space-md $ui-space-lg;
}

.offer-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $ui-space-md;

  .k {
    font-size: $ui-font-sm;
    color: $ui-gray-500;
  }

  .v {
    font-size: $ui-font-base;
    margin-top: 1px;
  }

  @media (max-width: 800px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.offer-note {
  margin-top: $ui-space-md;
  font-size: $ui-font-sm;
  color: $ui-gray-700;
  background: $ui-gray-100;
  border-radius: $ui-radius-sm;
  padding: $ui-space-xs $ui-space-md;
}

.offer-actions {
  margin-top: $ui-space-md;
}

.sec-title {
  font-size: $ui-font-base;
  font-weight: 600;
  color: $ui-gray-700;
  margin: $ui-space-xl 0 $ui-space-md;
  padding-left: $ui-space-sm;
  border-left: 3px solid $ui-color-primary;
}

.task-empty {
  display: flex;
  align-items: center;
  gap: $ui-space-md;
  color: $ui-gray-500;
  font-size: $ui-font-sm;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: $ui-space-sm;
}

.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $ui-space-sm $ui-space-md;
  background: $ui-gray-100;
  border-radius: $ui-radius-sm;

  .task-completed {
    text-decoration: line-through;
    color: $ui-gray-500;
  }
}
</style>
