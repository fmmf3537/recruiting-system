<template>
  <!-- 人才档案：基本信息 + 工作经历全文 + 教育 + 说明（不开简历也能看完履历） -->
  <div class="profile-panel">
    <!-- 个保法合规：未记录授权同意的候选人给出醒目标识 -->
    <el-alert
      v-if="!candidate.consentAt"
      type="warning"
      :closable="false"
      show-icon
      class="consent-alert"
      title="尚未记录候选人授权同意，请在编辑页补充授权信息"
    />

    <div class="sec-title">基本信息</div>
    <div class="info-grid">
      <div class="cell">
        <div class="k">性别 / 年龄</div>
        <div class="v">
          {{ candidate.gender || '未填写' }}
          <template v-if="candidate.age"> / {{ candidate.age }} 岁</template>
        </div>
      </div>
      <div class="cell">
        <div class="k">工作年限</div>
        <div class="v">{{ candidate.workYears != null ? `${candidate.workYears} 年` : '未填写' }}</div>
      </div>
      <div class="cell">
        <div class="k">学历 / 院校</div>
        <div class="v">{{ [candidate.education, candidate.school].filter(Boolean).join(' · ') || '未填写' }}</div>
      </div>
      <div class="cell">
        <div class="k">当前公司</div>
        <div class="v">{{ candidate.currentCompany || '未填写' }}</div>
      </div>
      <div class="cell">
        <div class="k">当前职位</div>
        <div class="v">{{ candidate.currentPosition || '未填写' }}</div>
      </div>
      <div class="cell">
        <div class="k">期望薪资</div>
        <div class="v">{{ candidate.expectedSalary || '未填写' }}</div>
      </div>
      <div class="cell">
        <div class="k">推荐人</div>
        <div class="v">{{ candidate.referrer || '未填写' }}</div>
      </div>
      <div class="cell">
        <div class="k">来源渠道</div>
        <div class="v">{{ candidate.source }}</div>
      </div>
      <div class="cell">
        <div class="k">授权状态</div>
        <div class="v" :class="candidate.consentAt ? 'is-authorized' : 'is-unauthorized'">
          {{ candidate.consentAt ? `已授权（${formatDate(candidate.consentAt)}）` : '未授权' }}
        </div>
      </div>
    </div>

    <template v-if="workHistories.length">
      <div class="sec-title">工作经历</div>
      <div v-for="(wh, idx) in workHistories" :key="wh.id || idx" class="wh-item">
        <div class="wh-rail">
          <div class="wh-dot"></div>
          <div v-if="idx < workHistories.length - 1" class="wh-line"></div>
        </div>
        <div class="wh-body">
          <div class="wh-head">
            <span class="wh-company">{{ wh.company }}</span>
            <span class="wh-period">{{ formatPeriod(wh) }}</span>
          </div>
          <div class="wh-position">{{ wh.position }}</div>
          <div v-if="wh.description" class="wh-content">{{ wh.description }}</div>
        </div>
      </div>
    </template>

    <div class="sec-title">教育经历</div>
    <div v-if="candidate.school || candidate.education" class="wh-item">
      <div class="wh-rail"><div class="wh-dot"></div></div>
      <div class="wh-body">
        <div class="wh-head">
          <span class="wh-company">{{ candidate.school || '未填写院校' }}</span>
        </div>
        <div class="wh-position">{{ candidate.education || '未填写学历' }}</div>
      </div>
    </div>
    <el-empty v-else description="未填写教育经历" :image-size="50" />

    <template v-if="candidate.intro">
      <div class="sec-title">候选人说明</div>
      <div class="intro-box">{{ candidate.intro }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { CandidateDetail, WorkHistory } from '@/api/candidate';

const props = defineProps<{
  candidate: CandidateDetail;
}>();

// 详情接口已返回工作经历全文，直接渲染，不再依赖打开简历
const workHistories = computed<WorkHistory[]>(() => props.candidate.workHistories || []);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatPeriod(wh: WorkHistory): string {
  // 数据库存的是完整 ISO 时间串，展示到月份即可
  const start = wh.startDate ? wh.startDate.slice(0, 7) : '—';
  const end = wh.endDate ? wh.endDate.slice(0, 7) : '至今';
  return `${start} – ${end}`;
}
</script>

<style scoped lang="scss">
.consent-alert {
  margin-bottom: $ui-space-md;
}

.sec-title {
  font-size: $ui-font-base;
  font-weight: 600;
  color: $ui-gray-700;
  margin: $ui-space-xl 0 $ui-space-md;
  padding-left: $ui-space-sm;
  border-left: 3px solid $ui-color-primary;

  &:first-of-type {
    margin-top: 0;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $ui-space-md $ui-space-xl;

  .k {
    font-size: $ui-font-sm;
    color: $ui-gray-500;
  }

  .v {
    font-size: $ui-font-base;
    margin-top: 1px;
  }

  .is-authorized {
    color: $ui-color-success;
  }

  .is-unauthorized {
    color: $ui-color-danger;
  }

  @media (max-width: 800px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.wh-item {
  display: flex;
  gap: $ui-space-md;
  margin-bottom: $ui-space-lg;
}

.wh-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 10px;
  padding-top: 5px;
}

.wh-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $ui-color-primary;
  flex-shrink: 0;
}

.wh-line {
  width: 2px;
  flex: 1;
  background: $ui-gray-200;
  margin-top: $ui-space-xs;
}

.wh-body {
  flex: 1;
  min-width: 0;
}

.wh-head {
  display: flex;
  align-items: baseline;
  gap: $ui-space-md;
  flex-wrap: wrap;
}

.wh-company {
  font-size: $ui-font-md;
  font-weight: 600;
}

.wh-period {
  font-size: $ui-font-sm;
  color: $ui-gray-500;
  margin-left: auto;
}

.wh-position {
  font-size: $ui-font-base;
  color: $ui-color-primary;
  margin: 2px 0 $ui-space-xs;
}

.wh-content {
  font-size: $ui-font-base;
  color: $ui-gray-700;
  background: $ui-gray-100;
  border-radius: $ui-radius-sm;
  padding: $ui-space-sm $ui-space-md;
  line-height: 1.7;
  word-break: break-word;
}

.intro-box {
  font-size: $ui-font-base;
  color: $ui-gray-700;
  background: $ui-gray-50;
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-sm;
  padding: $ui-space-sm $ui-space-md;
  line-height: 1.7;
}
</style>
