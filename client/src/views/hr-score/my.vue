<template>
  <div class="hr-score-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">我的积分</h2>
        <span class="page-subtitle">业务分 + 过程分双轨考核，明细只读、历史不回溯</span>
      </div>
      <el-radio-group v-model="period" @change="handlePeriodChange">
        <el-radio-button v-for="opt in PERIOD_OPTIONS" :key="opt.value" :label="opt.value">
          {{ opt.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">业务分</div>
          <div class="stat-value">{{ formatScore(aggregate.businessPts) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">过程分</div>
          <div class="stat-value">{{ formatScore(aggregate.processPts) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">综合分</div>
          <div class="stat-value">{{ formatScore(aggregate.totalScore) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">团队内排名</div>
          <div class="stat-value">{{ rankText }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="rules.length" shadow="never" class="rules-card">
      <template #header>当前积分规则（只读）</template>
      <el-collapse>
        <el-collapse-item
          v-for="rule in rules"
          :key="rule.code"
          :name="rule.code"
          :title="rule.name"
          :class="{ 'is-disabled-rule': !rule.enabled }"
        >
          <span :class="{ 'text-muted': !rule.enabled }">
            分值：{{ rule.points ?? '—' }}
            <el-tag v-if="!rule.enabled" type="info" size="small" style="margin-left: 8px">已停用</el-tag>
          </span>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <el-card v-loading="loading" shadow="never">
      <template #header>积分明细</template>
      <el-empty v-if="!loading && events.length === 0" description="本期暂无积分事件" />
      <el-table v-else :data="events" stripe style="width: 100%">
        <el-table-column label="日期" min-width="120">
          <template #default="{ row }">{{ formatBizDate(row.bizDate) }}</template>
        </el-table-column>
        <el-table-column label="规则" min-width="140">
          <template #default="{ row }">{{ ruleName(row.ruleCode) }}</template>
        </el-table-column>
        <el-table-column label="类别" width="90">
          <template #default="{ row }">
            {{ row.category === 'process' ? '过程' : '业务' }}
          </template>
        </el-table-column>
        <el-table-column label="对象" min-width="180">
          <template #default="{ row }">{{ formatTarget(row) }}</template>
        </el-table-column>
        <el-table-column label="分值" width="90" align="right">
          <template #default="{ row }">
            <span :class="pointsClass(row.points)">{{ row.points > 0 ? '+' : '' }}{{ row.points }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="fetchScores"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  PERIOD_OPTIONS,
  formatBizDate,
  formatScore,
  formatTarget,
  getMyScores,
  getTeamRanking,
  type HrScoreEvent,
  type MyRuleView,
  type PeriodAggregate,
  type ScorePeriod,
} from '@/api/hr-score';

const period = ref<ScorePeriod>('week');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const loading = ref(false);
const events = ref<HrScoreEvent[]>([]);
const rules = ref<MyRuleView[]>([]);
const aggregate = reactive<PeriodAggregate>({
  businessPts: 0,
  processPts: 0,
  totalScore: 0,
  rank: null,
});
const teamSize = ref(0);

const rankText = computed(() => {
  if (aggregate.rank === null) return '—';
  return teamSize.value > 0
    ? `第 ${aggregate.rank} / ${teamSize.value}`
    : `第 ${aggregate.rank}`;
});

function pointsClass(points: number): string {
  if (points > 0) return 'pts-pos';
  if (points < 0) return 'pts-neg';
  return '';
}

function ruleName(code: string): string {
  return rules.value.find((r) => r.code === code)?.name ?? code;
}

async function fetchScores() {
  loading.value = true;
  try {
    const res = await getMyScores({
      period: period.value,
      page: page.value,
      pageSize,
    });
    events.value = res.data.events ?? [];
    rules.value = res.data.rules ?? [];
    Object.assign(aggregate, res.data.aggregate ?? {
      businessPts: 0, processPts: 0, totalScore: 0, rank: null,
    });
    if (res.data.rank !== undefined) aggregate.rank = res.data.rank;
    total.value = res.pagination?.total ?? 0;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '加载积分失败';
    ElMessage.error(msg);
  } finally {
    loading.value = false;
  }
}

async function fetchTeamSize() {
  try {
    const res = await getTeamRanking({ period: period.value });
    teamSize.value = res.data?.length ?? 0;
  } catch {
    teamSize.value = 0;
  }
}

function handlePeriodChange() {
  page.value = 1;
  fetchScores();
  fetchTeamSize();
}

onMounted(() => {
  fetchScores();
  fetchTeamSize();
});
</script>

<style scoped lang="scss">
.hr-score-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  color: #303133;
}

.page-subtitle {
  margin-left: 12px;
  color: #909399;
  font-size: 13px;
}

.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  .stat-label {
    font-size: 13px;
    color: #909399;
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: #303133;
  }
}

.rules-card {
  margin-bottom: 16px;
}

.text-muted,
.is-disabled-rule :deep(.el-collapse-item__header) {
  color: #c0c4cc;
}

.pts-pos {
  color: #67c23a;
  font-weight: 600;
}

.pts-neg {
  color: #f56c6c;
  font-weight: 600;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
