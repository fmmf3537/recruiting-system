<template>
  <div class="hr-workload-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">HR 工作监控</h2>
        <span class="page-subtitle">过程量与漏斗转化并排，仅管理员可见</span>
      </div>
      <el-button type="primary" :loading="exporting" :disabled="exporting" @click="handleExport">
        导出 Excel
      </el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-radio-group v-model="period" @change="fetchOverview">
          <el-radio-button label="day">日</el-radio-button>
          <el-radio-button label="week">周</el-radio-button>
          <el-radio-button label="month">月</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-model="date"
          type="date"
          placeholder="锚点日期"
          value-format="YYYY-MM-DD"
          @change="fetchOverview"
        />
        <el-select
          v-model="department"
          clearable
          filterable
          placeholder="部门"
          style="width: 160px"
          @change="fetchOverview"
        >
          <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
        </el-select>
        <el-select
          v-model="hrId"
          clearable
          filterable
          placeholder="HR"
          style="width: 180px"
          @change="fetchOverview"
        >
          <el-option
            v-for="h in hrOptions"
            :key="h.hrId"
            :label="h.hrName"
            :value="h.hrId"
          />
        </el-select>
        <el-button type="primary" :loading="loading" @click="fetchOverview">刷新</el-button>
        <span v-if="rangeText" class="range-hint">统计区间 {{ rangeText }}</span>
      </div>
    </el-card>

    <el-row :gutter="16" class="stats-row">
      <el-col v-for="card in summaryCards" :key="card.label" :xs="12" :sm="8" :md="6" :lg="3">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-loading="loading" shadow="never" class="table-card">
      <div class="section-head">
        <span class="section-title">HR 排行榜</span>
        <el-radio-group v-model="sortKey" size="small">
          <el-radio-button label="joined">入职数</el-radio-button>
          <el-radio-button label="newCandidates">新增</el-radio-button>
          <el-radio-button label="communications">沟通</el-radio-button>
          <el-radio-button label="interviewsScheduled">安排面试</el-radio-button>
          <el-radio-button label="offersAccepted">Offer 接受</el-radio-button>
          <el-radio-button label="joinRate">入职率</el-radio-button>
        </el-radio-group>
      </div>
      <el-empty v-if="!loading && sortedRows.length === 0" description="暂无 HR 工作负载数据" />
      <el-table v-else :data="sortedRows" stripe>
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="hrName" label="HR" min-width="120">
          <template #default="{ row }">
            <span>{{ row.hrName }}</span>
            <el-tag v-if="row.approximate" size="small" type="info" class="ml-tag">近似</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="部门" width="120">
          <template #default="{ row }">{{ row.department || '—' }}</template>
        </el-table-column>
        <el-table-column label="新增" width="80" align="center">
          <template #default="{ row }">{{ row.process.newCandidates }}</template>
        </el-table-column>
        <el-table-column label="沟通" width="80" align="center">
          <template #default="{ row }">{{ row.process.communications }}</template>
        </el-table-column>
        <el-table-column label="安排面试" width="90" align="center">
          <template #default="{ row }">{{ row.process.interviewsScheduled }}</template>
        </el-table-column>
        <el-table-column label="Offer 发送" width="100" align="center">
          <template #default="{ row }">{{ row.result.offersSent }}</template>
        </el-table-column>
        <el-table-column label="Offer 接受" width="100" align="center">
          <template #default="{ row }">{{ row.result.offersAccepted }}</template>
        </el-table-column>
        <el-table-column label="入职" width="80" align="center">
          <template #default="{ row }">{{ row.result.joined }}</template>
        </el-table-column>
        <el-table-column label="初筛通过率" width="110" align="center">
          <template #default="{ row }">{{ formatRate(row.rates.screeningPassRate) }}</template>
        </el-table-column>
        <el-table-column label="Offer 接受率" width="120" align="center">
          <template #default="{ row }">{{ formatRate(row.rates.offerAcceptRate) }}</template>
        </el-table-column>
        <el-table-column label="入职率" width="90" align="center">
          <template #default="{ row }">{{ formatRate(row.rates.joinRate) }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="220">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status).type" size="small">
              {{ statusTag(row.status).label }}
            </el-tag>
            <el-tag
              v-if="row.status === 'need_attention'"
              type="danger"
              size="small"
              class="ml-tag"
            >
              忙碌但低效
            </el-tag>
            <el-tag
              v-for="wp in row.weakPoints"
              :key="wp.stage"
              type="warning"
              size="small"
              class="ml-tag"
            >
              {{ stageLabel(wp.stage) }}偏低
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openDrawer(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <div class="section-title">过程量对比</div>
          <el-empty v-if="!rows.length" description="暂无过程量" :image-size="64" />
          <v-chart v-else class="chart" :option="processBarOption" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <div class="section-title">入职率排行</div>
          <el-empty v-if="!joinRateChartRows.length" description="暂无可比入职率" :image-size="64" />
          <v-chart v-else class="chart" :option="joinRateOption" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <div class="section-title">团队漏斗</div>
          <el-empty v-if="!hasFunnelData" description="暂无漏斗数据" :image-size="64" />
          <v-chart v-else class="chart" :option="funnelOption" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <div class="section-title">薄弱环节分布</div>
          <el-empty v-if="!weakDist.length" description="本期无薄弱环节" :image-size="64" />
          <v-chart v-else class="chart" :option="weakOption" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="640px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="drawer-metrics">
            <span>新增 {{ detail.row.process.newCandidates }}</span>
            <span>沟通 {{ detail.row.process.communications }}</span>
            <span>入职 {{ detail.row.result.joined }}</span>
            <span>入职率 {{ formatRate(detail.row.rates.joinRate) }}</span>
          </div>
          <div v-if="detail.row.weakPoints.length" class="weak-advice">
            <div v-for="wp in detail.row.weakPoints" :key="wp.stage" class="advice-line">
              {{ weakAdvice(wp) }}
            </div>
          </div>
          <div class="section-title">个人漏斗</div>
          <v-chart class="chart-sm" :option="personalFunnelOption" autoresize />
          <div class="section-title">近 4 个周期趋势</div>
          <el-empty v-if="!detail.trend.length" description="暂无趋势" :image-size="48" />
          <v-chart v-else class="chart-sm" :option="trendOption" autoresize />
          <div class="section-title">关键动作时间线</div>
          <el-empty
            v-if="!detail.timeline?.length"
            description="本期无动作记录"
            :image-size="48"
          />
          <el-timeline v-else>
            <el-timeline-item
              v-for="(item, idx) in detail.timeline"
              :key="idx"
              :timestamp="formatDateTime(item.at)"
            >
              {{ item.title }}
            </el-timeline-item>
          </el-timeline>
          <div class="section-title">候选人明细</div>
          <el-empty
            v-if="!detail.candidates?.length"
            description="本期无新增候选人"
            :image-size="48"
          />
          <el-table v-else :data="detail.candidates" size="small">
            <el-table-column prop="name" label="姓名" min-width="100">
              <template #default="{ row }">
                <router-link :to="`/candidates/${row.id}`">{{ row.name }}</router-link>
                <el-tag v-if="row.anonymized" size="small" type="info" class="ml-tag">已匿名</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="source" label="来源" width="120">
              <template #default="{ row }">{{ row.source || '—' }}</template>
            </el-table-column>
            <el-table-column label="入库时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, FunnelChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import VChart from 'vue-echarts';
import {
  exportHrWorkload,
  getHrWorkloadOverview,
  getHrWorkloadUserDetail,
  type HrWorkloadDetail,
  type HrWorkloadOverview,
  type HrWorkloadRow,
  type HrWorkloadStatus,
  type HrWorkloadWeakPoint,
  type WorkloadPeriod,
} from '@/api/hr-workload';

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  FunnelChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
]);

type SortKey =
  | 'joined'
  | 'newCandidates'
  | 'communications'
  | 'interviewsScheduled'
  | 'offersAccepted'
  | 'joinRate';

const STAGE_LABEL: Record<string, string> = {
  screening: '筛选通过率',
  interviewComplete: '面试完成率',
  offerAccept: 'Offer 接受率',
  joined: '入职率',
};

const STAGE_ADVICE: Record<string, string> = {
  screening: '建议检查初筛标准与反馈时效。',
  interviewComplete: '建议检查面试到场率与安排节奏。',
  offerAccept: '建议检查薪资沟通与期望管理。',
  joined: '建议检查 Offer 后跟进与入职准备。',
};

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 转化率 null 显示 —，禁止当成 0% */
function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '—';
  const pct = Math.round(rate * 1000) / 10;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] || stage;
}

function statusTag(status: HrWorkloadStatus): { label: string; type: 'success' | 'warning' | 'info' } {
  if (status === 'need_attention') return { label: '需关注转化', type: 'warning' };
  if (status === 'insufficient_sample') return { label: '样本不足', type: 'info' };
  return { label: '正常', type: 'success' };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function weakAdvice(wp: HrWorkloadWeakPoint): string {
  return `${stageLabel(wp.stage)} ${formatRate(wp.rate)}，团队均值 ${formatRate(wp.teamRate)}。${
    STAGE_ADVICE[wp.stage] || ''
  }`;
}

function sortValue(row: HrWorkloadRow, key: SortKey): number {
  if (key === 'joined') return row.result.joined;
  if (key === 'newCandidates') return row.process.newCandidates;
  if (key === 'communications') return row.process.communications;
  if (key === 'interviewsScheduled') return row.process.interviewsScheduled;
  if (key === 'offersAccepted') return row.result.offersAccepted;
  return row.rates.joinRate == null ? Number.NEGATIVE_INFINITY : row.rates.joinRate;
}

const period = ref<WorkloadPeriod>('week');
const date = ref(todayStr());
const department = ref('');
const hrId = ref('');
const loading = ref(false);
const exporting = ref(false);
const overview = ref<HrWorkloadOverview | null>(null);
const hrOptions = ref<Array<{ hrId: string; hrName: string }>>([]);
const deptOptions = ref<string[]>([]);
const sortKey = ref<SortKey>('joined');

const drawerVisible = ref(false);
const drawerTitle = ref('HR 详情');
const detailLoading = ref(false);
const detail = ref<HrWorkloadDetail | null>(null);

const rows = computed(() => overview.value?.rows ?? []);
const summary = computed(() => overview.value?.summary);

const rangeText = computed(() => {
  const r = overview.value?.range;
  if (!r) return '';
  return r.start === r.end ? r.start : `${r.start} ~ ${r.end}`;
});

const summaryCards = computed(() => {
  const s = summary.value;
  return [
    { label: '活跃 HR', value: s ? String(s.activeHrCount) : '—' },
    { label: '新增候选人', value: s ? String(s.newCandidates) : '—' },
    { label: '沟通跟进', value: s ? String(s.communications) : '—' },
    { label: '安排面试', value: s ? String(s.interviewsScheduled) : '—' },
    { label: 'Offer 发送/接受', value: s ? `${s.offersSent} / ${s.offersAccepted}` : '—' },
    { label: '入职', value: s ? String(s.joined) : '—' },
    { label: '平均周期(天)', value: s && s.avgCycleDays != null ? String(s.avgCycleDays) : '—' },
    { label: '薄弱环节数', value: s ? String(s.weakPointCount) : '—' },
  ];
});

const sortedRows = computed(() => {
  const list = [...rows.value];
  list.sort((a, b) => sortValue(b, sortKey.value) - sortValue(a, sortKey.value));
  return list;
});

const joinRateChartRows = computed(() =>
  rows.value.filter((r) => r.rates.joinRate != null)
);

const hasFunnelData = computed(() => {
  const s = summary.value;
  if (!s) return false;
  return (
    s.newCandidates +
      s.interviewsScheduled +
      s.interviewsCompleted +
      s.offersSent +
      s.offersAccepted +
      s.joined >
    0
  );
});

const weakDist = computed(() => {
  const counts: Record<string, number> = {};
  rows.value.forEach((r) => {
    r.weakPoints.forEach((wp) => {
      counts[wp.stage] = (counts[wp.stage] || 0) + 1;
    });
  });
  return Object.entries(counts).map(([stage, value]) => ({
    name: `${stageLabel(stage)}偏低`,
    value,
  }));
});

const processBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['新增', '沟通', '安排面试'] },
  grid: { left: 40, right: 16, top: 40, bottom: 40 },
  xAxis: { type: 'category', data: rows.value.map((r) => r.hrName), axisLabel: { rotate: 30 } },
  yAxis: { type: 'value', minInterval: 1 },
  series: [
    { name: '新增', type: 'bar', data: rows.value.map((r) => r.process.newCandidates) },
    { name: '沟通', type: 'bar', data: rows.value.map((r) => r.process.communications) },
    {
      name: '安排面试',
      type: 'bar',
      data: rows.value.map((r) => r.process.interviewsScheduled),
    },
  ],
}));

const joinRateOption = computed(() => {
  const list = [...joinRateChartRows.value].sort(
    (a, b) => (b.rates.joinRate || 0) - (a.rates.joinRate || 0)
  );
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        return p ? `${p.name}<br/>入职率 ${formatRate(p.value)}` : '';
      },
    },
    grid: { left: 80, right: 24, top: 16, bottom: 24 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatRate(v) } },
    yAxis: { type: 'category', data: list.map((r) => r.hrName).reverse() },
    series: [
      {
        type: 'bar',
        data: list.map((r) => r.rates.joinRate as number).reverse(),
      },
    ],
  };
});

const funnelOption = computed(() => {
  const s = summary.value;
  return {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'funnel',
        left: '10%',
        width: '80%',
        minSize: '10%',
        gap: 4,
        label: { show: true, formatter: '{b}: {c}' },
        data: [
          { name: '新增候选人', value: s?.newCandidates || 0 },
          { name: '安排面试', value: s?.interviewsScheduled || 0 },
          { name: '面试完成', value: s?.interviewsCompleted || 0 },
          { name: 'Offer 发送', value: s?.offersSent || 0 },
          { name: 'Offer 接受', value: s?.offersAccepted || 0 },
          { name: '入职', value: s?.joined || 0 },
        ],
      },
    ],
  };
});

const weakOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: ['36%', '64%'],
      data: weakDist.value,
    },
  ],
}));

const personalFunnelOption = computed(() => {
  const row = detail.value?.row;
  return {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'funnel',
        left: '10%',
        width: '80%',
        minSize: '10%',
        gap: 4,
        label: { show: true, formatter: '{b}: {c}' },
        data: [
          { name: '新增', value: row?.process.newCandidates || 0 },
          { name: '初筛通过', value: row?.result.screeningPassed || 0 },
          { name: '面试完成', value: row?.result.interviewsCompleted || 0 },
          { name: 'Offer 发送', value: row?.result.offersSent || 0 },
          { name: 'Offer 接受', value: row?.result.offersAccepted || 0 },
          { name: '入职', value: row?.result.joined || 0 },
        ],
      },
    ],
  };
});

const trendOption = computed(() => {
  const trend = detail.value?.trend ?? [];
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ seriesName: string; value: number | null; axisValue: string }>) => {
        const head = params[0]?.axisValue || '';
        const lines = params.map((p) => {
          const text =
            p.seriesName === '入职率' ? formatRate(p.value as number | null) : String(p.value ?? '—');
          return `${p.seriesName}：${text}`;
        });
        return [head, ...lines].join('<br/>');
      },
    },
    legend: { data: ['新增', '入职', '入职率'] },
    grid: { left: 40, right: 48, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      data: trend.map((t) => (t.range.start === t.range.end ? t.range.start : t.range.start.slice(5))),
    },
    yAxis: [
      { type: 'value', minInterval: 1 },
      {
        type: 'value',
        axisLabel: { formatter: (v: number) => formatRate(v) },
        min: 0,
        max: 1,
      },
    ],
    series: [
      { name: '新增', type: 'bar', data: trend.map((t) => t.newCandidates) },
      { name: '入职', type: 'bar', data: trend.map((t) => t.joined) },
      {
        name: '入职率',
        type: 'line',
        yAxisIndex: 1,
        // null 不画成 0，断开折线
        data: trend.map((t) => t.joinRate),
        connectNulls: false,
      },
    ],
  };
});

function currentQuery() {
  return {
    period: period.value,
    date: date.value,
    department: department.value || undefined,
    hrId: hrId.value || undefined,
  };
}

async function fetchOverview() {
  if (!date.value) {
    ElMessage.warning('请选择锚点日期');
    return;
  }
  loading.value = true;
  try {
    const res = await getHrWorkloadOverview(currentQuery());
    overview.value = res.data;
    if (!hrId.value) {
      hrOptions.value = res.data.rows.map((r) => ({ hrId: r.hrId, hrName: r.hrName }));
    }
    if (!department.value) {
      deptOptions.value = [
        ...new Set(res.data.rows.map((r) => r.department).filter((d): d is string => Boolean(d))),
      ];
    }
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '加载工作监控失败');
  } finally {
    loading.value = false;
  }
}

async function handleExport() {
  if (exporting.value) return;
  if (!date.value) {
    ElMessage.warning('请选择锚点日期');
    return;
  }
  exporting.value = true;
  try {
    await exportHrWorkload(currentQuery());
    ElMessage.success('导出成功');
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

async function openDrawer(row: HrWorkloadRow) {
  drawerTitle.value = `${row.hrName} · 工作详情`;
  drawerVisible.value = true;
  detail.value = null;
  detailLoading.value = true;
  try {
    const res = await getHrWorkloadUserDetail(row.hrId, {
      ...currentQuery(),
      includeTimeline: true,
      includeCandidates: true,
    });
    detail.value = res.data;
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '加载详情失败');
  } finally {
    detailLoading.value = false;
  }
}

onMounted(() => {
  fetchOverview();
});
</script>

<style scoped lang="scss">
.hr-workload-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
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

.filter-card {
  margin-bottom: 16px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.range-hint {
  color: #909399;
  font-size: 13px;
}

.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  margin-bottom: 12px;

  .stat-label {
    font-size: 13px;
    color: #909399;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 600;
    color: #303133;
  }
}

.table-card {
  margin-bottom: 16px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 8px;
}

.chart-row {
  .el-card {
    margin-bottom: 16px;
  }
}

.chart {
  height: 280px;
}

.chart-sm {
  height: 220px;
  margin-bottom: 16px;
}

.ml-tag {
  margin-left: 6px;
}

.drawer-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  color: #606266;
  font-size: 13px;
}

.weak-advice {
  background: #fdf6ec;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.advice-line {
  font-size: 13px;
  color: #e6a23c;
  line-height: 1.6;
}
</style>
