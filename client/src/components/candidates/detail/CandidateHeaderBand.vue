<template>
  <!-- A. 候选人头部带：一句话定位 + 关键事实 chips + 当前阶段前置 + 主操作 -->
  <div class="header-band">
    <el-button circle class="back-btn" title="返回列表" @click="$emit('back')">
      <el-icon><ArrowLeft /></el-icon>
    </el-button>

    <el-avatar :size="56" class="head-avatar">{{ candidate.name.slice(0, 1) }}</el-avatar>

    <div class="head-main">
      <div class="head-name-row">
        <span class="head-name">{{ candidate.name }}</span>
        <span v-if="headline" class="head-title">{{ headline }}</span>
        <el-tag effect="light" round class="stage-tag">
          {{ candidate.currentStage }} · {{ stageStatusText }}
        </el-tag>
      </div>
      <div class="head-chips">
        <span v-if="candidate.workYears" class="chip">{{ candidate.workYears }} 年经验</span>
        <span v-if="candidate.education || candidate.school" class="chip">
          {{ [candidate.education, candidate.school].filter(Boolean).join(' · ') }}
        </span>
        <span v-if="candidate.expectedSalary" class="chip chip-hl">期望 {{ candidate.expectedSalary }}</span>
        <span class="chip">来源：{{ candidate.source }}</span>
        <span class="chip">应聘：{{ candidate.jobs.map((j) => j.title).join('、') || '人才库' }}</span>
        <span class="chip">负责人：{{ candidate.currentAssignee?.name || '未指派' }}</span>
      </div>
    </div>

    <div class="head-actions">
      <el-button @click="$emit('email')"><el-icon><Message /></el-icon>发邮件</el-button>
      <el-button @click="$emit('edit')"><el-icon><Edit /></el-icon>编辑资料</el-button>
      <el-button v-if="canAdvance" type="primary" @click="$emit('advance')">
        <el-icon><Promotion /></el-icon>推进流程
      </el-button>
      <el-button v-if="canDelete" class="danger-btn" title="删除候选人" @click="$emit('delete')">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, Delete, Edit, Message, Promotion } from '@element-plus/icons-vue';

import type { CandidateDetail } from '@/api/candidate';

const props = defineProps<{
  candidate: CandidateDetail;
  canAdvance: boolean;
  canDelete: boolean;
}>();

defineEmits<{
  (e: 'back' | 'edit' | 'advance' | 'email' | 'delete'): void;
}>();

const STATUS_TEXT: Record<string, string> = {
  in_progress: '进行中',
  passed: '已通过',
  rejected: '已淘汰',
};

// 一句话定位：现职 @ 现公司
const headline = computed(() => {
  const parts = [props.candidate.currentPosition, props.candidate.currentCompany].filter(Boolean);
  return parts.length ? parts.join(' @ ') : '';
});

const stageStatusText = computed(() => STATUS_TEXT[props.candidate.stageStatus] || props.candidate.stageStatus);
</script>

<style scoped lang="scss">
.header-band {
  display: flex;
  align-items: center;
  gap: $ui-space-lg;
  padding: $ui-space-lg $ui-space-xl;
  background: $ui-gray-50;
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-md;
}

.back-btn {
  flex-shrink: 0;
}

.head-avatar {
  flex-shrink: 0;
  background: linear-gradient(135deg, $ui-color-primary, $ui-color-primary-hover);
  font-size: 22px;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.head-name-row {
  display: flex;
  align-items: center;
  gap: $ui-space-md;
  flex-wrap: wrap;
}

.head-name {
  font-size: 20px;
  font-weight: 600;
}

.head-title {
  color: $ui-gray-700;
}

.stage-tag {
  font-weight: 600;
}

.head-chips {
  display: flex;
  gap: $ui-space-sm;
  margin-top: $ui-space-xs;
  flex-wrap: wrap;
}

.chip {
  background: $ui-gray-200;
  color: $ui-gray-700;
  border-radius: $ui-radius-sm;
  padding: 0 10px;
  font-size: $ui-font-sm;
  line-height: 20px;
}

.chip-hl {
  background: #fdf6ec;
  color: $ui-color-warning;
}

.head-actions {
  display: flex;
  gap: $ui-space-sm;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.danger-btn:hover {
  border-color: $ui-color-danger;
  color: $ui-color-danger;
}

@media (max-width: 900px) {
  .header-band {
    flex-wrap: wrap;
  }

  .head-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
