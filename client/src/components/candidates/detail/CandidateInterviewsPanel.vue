<template>
  <!-- 面试评估：面试安排 + 结构化评估 + 历史反馈 合一 -->
  <div class="interviews-panel">
    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="load-alert">
      <template #title>
        面试安排加载失败
        <el-button link type="primary" @click="$emit('retry')">重新加载</el-button>
      </template>
    </el-alert>

    <template v-if="interviews.length">
      <div v-for="iv in sortedInterviews" :key="iv.id" class="iv-card">
        <div class="iv-head">
          <span class="iv-round">{{ iv.round }}</span>
          <el-tag size="small" :type="getInterviewStatusType(iv.status)">
            {{ getInterviewStatusText(iv.status) }}
          </el-tag>
          <span class="iv-time">
            {{ formatDateTime(iv.scheduledAt) }} · {{ iv.duration }} 分钟
            <template v-if="iv.location"> · {{ iv.location }}</template>
            · 面试官：{{ iv.interviewers?.map((i) => i.name).join('、') || '—' }}
          </span>
          <div class="iv-actions">
            <el-button type="primary" link size="small" @click="$emit('view', iv)">面试与评估</el-button>
            <el-button
              v-if="canManage && iv.status === 'scheduled'"
              link
              size="small"
              @click="$emit('edit', iv)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canManage && iv.status === 'scheduled'"
              type="warning"
              link
              size="small"
              @click="$emit('cancel', iv)"
            >
              取消
            </el-button>
          </div>
        </div>
        <div class="iv-body">
          <div v-if="iv.notes" class="iv-notes">{{ iv.notes }}</div>

          <!-- 结构化评估：每场面试按面试官分块展示 -->
          <template v-if="evaluationsMap.get(iv.id)?.length">
            <div v-for="evalItem in evaluationsMap.get(iv.id)" :key="evalItem.id" class="eval-block">
              <div class="eval-who">
                {{ evalItem.interviewerName }}
                <el-tag
                  v-if="evalItem.submittedAt && evalItem.conclusion"
                  size="small"
                  :type="getConclusionType(evalItem.conclusion)"
                >
                  结论：{{ getConclusionText(evalItem.conclusion) }}
                </el-tag>
                <el-tag v-else size="small" type="warning">待提交</el-tag>
                <span v-if="evalItem.overallScore != null" class="eval-score">
                  综合 {{ evalItem.overallScore }} / 5
                </span>
              </div>
              <template v-if="evalItem.submittedAt">
                <div v-for="dim in evalItem.dimensions || []" :key="dim.name" class="dim-row">
                  <span class="dim-name">{{ dim.name }}</span>
                  <div class="dim-bar"><i :style="{ width: `${(dim.score / 5) * 100}%` }"></i></div>
                  <span class="dim-score">{{ dim.score }}</span>
                </div>
                <div v-for="dim in evalItem.dimensions || []" :key="`${dim.name}-comment`">
                  <div v-if="dim.comment" class="eval-comment"><b>{{ dim.name }}：</b>{{ dim.comment }}</div>
                </div>
              </template>
              <div v-else class="eval-missing">
                面试结束后 24 小时未提交将由系统自动催收
              </div>
            </div>
          </template>
          <el-empty
            v-else-if="iv.status === 'completed'"
            description="暂无结构化评估（可能为历史数据）"
            :image-size="40"
          />
        </div>
      </div>
    </template>
    <el-empty v-else-if="!loadError" description="暂无面试安排" :image-size="60" />

    <!-- 历史面试反馈（InterviewFeedback 富文本旧数据，兼容展示） -->
    <template v-if="feedbacks.length">
      <div class="sec-title">历史面试反馈</div>
      <div v-for="fb in feedbacks" :key="fb.id" class="feedback-item">
        <div class="feedback-head">
          <span class="fb-round">{{ fb.round }}</span>
          <el-tag size="small" :type="getConclusionType(fb.conclusion)">
            {{ getConclusionText(fb.conclusion) }}
          </el-tag>
        </div>
        <div class="feedback-meta">
          <span>面试官：{{ fb.interviewerName }}</span>
          <span>{{ formatDate(fb.interviewTime) }}</span>
        </div>
        <div class="feedback-content">{{ fb.feedbackContent }}</div>
        <div v-if="fb.rejectReason" class="feedback-reject">淘汰原因：{{ fb.rejectReason }}</div>
      </div>
    </template>

    <div class="panel-footer">
      <el-button link type="primary" @click="$emit('addFeedback')">+ 补录历史面试反馈</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { InterviewFeedback } from '@/api/candidate';
import type { InterviewEvaluationItem } from '@/api/evaluation';
import type { InterviewItem } from '@/api/interview';

const props = defineProps<{
  interviews: InterviewItem[];
  /** 历史富文本反馈（InterviewFeedback 旧数据） */
  feedbacks: InterviewFeedback[];
  /** 面试 ID → 该场所有面试官结构化评估 */
  evaluationsMap: Map<string, InterviewEvaluationItem[]>;
  canManage: boolean;
  loadError: boolean;
}>();

defineEmits<{
  (e: 'schedule'): void;
  (e: 'view', iv: InterviewItem): void;
  (e: 'edit', iv: InterviewItem): void;
  (e: 'cancel', iv: InterviewItem): void;
  (e: 'addFeedback'): void;
  (e: 'retry'): void;
}>();

// 最近的面试排最前
const sortedInterviews = computed(() =>
  [...props.interviews].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const formatDateTime = formatDate;

function getInterviewStatusType(status: string): string {
  return { scheduled: 'primary', completed: 'success', cancelled: 'info', no_show: 'danger' }[status] || 'info';
}

function getInterviewStatusText(status: string): string {
  return { scheduled: '待进行', completed: '已完成', cancelled: '已取消', no_show: '未到' }[status] || status;
}

function getConclusionType(conclusion: string): string {
  return { pass: 'success', reject: 'danger', pending: 'warning' }[conclusion] || 'info';
}

function getConclusionText(conclusion: string): string {
  return { pass: '通过', reject: '淘汰', pending: '待定' }[conclusion] || conclusion;
}
</script>

<style scoped lang="scss">
.load-alert {
  margin-bottom: $ui-space-md;
}

.iv-card {
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-md;
  margin-bottom: $ui-space-md;
  overflow: hidden;
}

.iv-head {
  background: $ui-gray-100;
  padding: $ui-space-sm $ui-space-lg;
  display: flex;
  align-items: center;
  gap: $ui-space-md;
  flex-wrap: wrap;
}

.iv-round {
  font-weight: 600;
  font-size: $ui-font-md;
}

.iv-time {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
}

.iv-actions {
  margin-left: auto;
  display: flex;
  gap: 0;
}

.iv-body {
  padding: $ui-space-md $ui-space-lg;
}

.iv-notes {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  margin-bottom: $ui-space-sm;
}

.eval-block {
  border-top: 1px dashed $ui-border-color;
  padding-top: $ui-space-md;
  margin-top: $ui-space-sm;

  &:first-of-type {
    border-top: none;
    margin-top: 0;
    padding-top: 0;
  }
}

.eval-who {
  font-size: $ui-font-base;
  font-weight: 600;
  margin-bottom: $ui-space-sm;
  display: flex;
  align-items: center;
  gap: $ui-space-sm;
}

.eval-score {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  margin-left: auto;
  font-weight: 400;
}

.dim-row {
  display: flex;
  align-items: center;
  gap: $ui-space-md;
  margin-bottom: $ui-space-xs;
  font-size: $ui-font-sm;
}

.dim-name {
  width: 90px;
  color: $ui-gray-700;
  flex-shrink: 0;
}

.dim-bar {
  flex: 1;
  height: 8px;
  background: $ui-gray-200;
  border-radius: $ui-radius-pill;
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    border-radius: $ui-radius-pill;
    background: linear-gradient(90deg, $ui-color-primary-hover, $ui-color-primary);
  }
}

.dim-score {
  width: 24px;
  text-align: right;
  color: $ui-gray-700;
  flex-shrink: 0;
}

.eval-comment {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  background: $ui-gray-100;
  border-radius: $ui-radius-sm;
  padding: $ui-space-xs $ui-space-md;
  margin-top: $ui-space-xs;
}

.eval-missing {
  font-size: $ui-font-sm;
  color: $ui-color-warning;
  background: #fdf6ec;
  border-radius: $ui-radius-sm;
  padding: $ui-space-xs $ui-space-md;
}

.sec-title {
  font-size: $ui-font-base;
  font-weight: 600;
  color: $ui-gray-700;
  margin: $ui-space-xl 0 $ui-space-md;
  padding-left: $ui-space-sm;
  border-left: 3px solid $ui-color-primary;
}

.feedback-item {
  padding: $ui-space-md;
  background: $ui-gray-100;
  border-radius: $ui-radius-md;
  margin-bottom: $ui-space-md;
}

.feedback-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $ui-space-xs;

  .fb-round {
    font-weight: 600;
    font-size: $ui-font-lg;
  }
}

.feedback-meta {
  display: flex;
  gap: $ui-space-lg;
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  margin-bottom: $ui-space-xs;
}

.feedback-content {
  color: $ui-gray-700;
  line-height: 1.7;
}

.feedback-reject {
  margin-top: $ui-space-xs;
  color: $ui-color-danger;
  font-size: $ui-font-sm;
}

.panel-footer {
  margin-top: $ui-space-sm;
  text-align: right;
}
</style>
