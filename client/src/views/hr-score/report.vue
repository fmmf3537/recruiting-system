<template>
  <div class="hr-score-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">考核报表</h2>
        <span class="page-subtitle">周期对比、趋势与 TopN</span>
      </div>
      <div class="header-actions">
        <el-radio-group v-model="period" @change="fetchReport">
          <el-radio-button v-for="opt in PERIOD_OPTIONS" :key="opt.value" :label="opt.value">
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
        <el-button :loading="exporting" @click="handleExport">导出 CSV</el-button>
        <el-button @click="goRules">管理规则</el-button>
      </div>
    </div>

    <el-row v-loading="loading" :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">本期综合</div>
          <div class="stat-value">{{ formatScore(report.comparison.current.totalScore) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">上期综合</div>
          <div class="stat-value">{{ formatScore(report.comparison.previous.totalScore) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">环比</div>
          <div class="stat-value" :class="deltaClass">{{ deltaText }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">团队人数</div>
          <div class="stat-value">{{ teamSize }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never">
          <template #header>业务分趋势</template>
          <v-chart class="line-chart" :option="businessOption" autoresize />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="never">
          <template #header>过程分趋势</template>
          <v-chart class="line-chart" :option="processOption" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>TopN 排名</template>
      <el-table :data="report.topN" stripe style="width: 100%">
        <el-table-column prop="rank" label="排名" width="80" />
        <el-table-column prop="userName" label="姓名" min-width="140" />
        <el-table-column label="综合分" width="140">
          <template #default="{ row }">{{ formatScore(row.totalScore) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import {
  PERIOD_OPTIONS,
  exportHrScoreCsv,
  formatScore,
  getAdminReport,
  getTeamRanking,
  type AdminReport,
  type ScorePeriod,
  type TrendPoint,
} from '@/api/hr-score';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent]);

const emptyReport = (): AdminReport => ({
  businessTrend: [],
  processTrend: [],
  comparison: {
    current: { businessPts: 0, processPts: 0, totalScore: 0 },
    previous: { businessPts: 0, processPts: 0, totalScore: 0 },
    deltaPct: null,
  },
  topN: [],
});

const router = useRouter();
const period = ref<ScorePeriod>('month');
const loading = ref(false);
const exporting = ref(false);
const teamSize = ref(0);
const report = reactive<AdminReport>(emptyReport());

const deltaText = computed(() => {
  const d = report.comparison.deltaPct;
  if (d === null) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}%`;
});

const deltaClass = computed(() => {
  const d = report.comparison.deltaPct;
  if (d === null || d === 0) return '';
  return d > 0 ? 'pts-pos' : 'pts-neg';
});

function lineOption(title: string, points: TrendPoint[], color: string) {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.date),
    },
    yAxis: { type: 'value', name: '分值' },
    series: [
      {
        name: title,
        type: 'line',
        smooth: true,
        data: points.map((p) => p.value),
        itemStyle: { color },
        areaStyle: { color: `${color}22` },
      },
    ],
  };
}

const businessOption = computed(() => lineOption('业务分', report.businessTrend, '#409EFF'));
const processOption = computed(() => lineOption('过程分', report.processTrend, '#67C23A'));

async function fetchReport() {
  loading.value = true;
  try {
    const [res, teamRes] = await Promise.all([
      getAdminReport({ period: period.value }),
      getTeamRanking({ period: period.value }),
    ]);
    Object.assign(report, res.data ?? emptyReport());
    teamSize.value = teamRes.data?.length ?? 0;
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '加载报表失败');
  } finally {
    loading.value = false;
  }
}

async function handleExport() {
  exporting.value = true;
  try {
    await exportHrScoreCsv(period.value);
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

function goRules() {
  router.push('/settings/hr-score-rules');
}

onMounted(() => {
  fetchReport();
});
</script>

<style scoped lang="scss">
.hr-score-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.stats-row,
.chart-row {
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

.line-chart {
  height: 280px;
  width: 100%;
}

.pts-pos {
  color: #67c23a;
}

.pts-neg {
  color: #f56c6c;
}
</style>
