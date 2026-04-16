<template>
  <div class="stats-page">
    <van-nav-bar title="数据看板" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="content">
      <!-- KPI 卡片 -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="number">{{ kpi.newCandidatesThisMonth }}</span>
          <span class="label">本月新增候选人</span>
        </div>
        <div class="kpi-card">
          <span class="number">{{ kpi.interviewingCount }}</span>
          <span class="label">在面人数</span>
        </div>
        <div class="kpi-card">
          <span class="number">{{ kpi.pendingOffers }}</span>
          <span class="label">待发 Offer</span>
        </div>
        <div class="kpi-card">
          <span class="number">{{ kpi.joinedThisMonth }}</span>
          <span class="label">本月入职</span>
        </div>
      </div>

      <!-- 趋势图 -->
      <div class="chart-card">
        <div class="chart-title">近 7 天新增候选人趋势</div>
        <v-chart class="chart" :option="chartOption" autoresize />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { showToast } from 'vant';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { getDashboard, type DashboardKpi, type TrendItem } from '@/api/stats';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

const kpi = ref<DashboardKpi>({
  newCandidatesThisMonth: 0,
  interviewingCount: 0,
  pendingOffers: 0,
  joinedThisMonth: 0,
});

const trend = ref<TrendItem[]>([]);

const chartOption = computed(() => ({
  grid: { top: 24, right: 16, bottom: 24, left: 32 },
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: trend.value.map((item) => item.date),
    axisLine: { lineStyle: { color: '#ccc' } },
    axisLabel: { color: '#666', fontSize: 11 },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    axisLine: { show: false },
    splitLine: { lineStyle: { color: '#eee' } },
    axisLabel: { color: '#666', fontSize: 11 },
  },
  series: [
    {
      type: 'line',
      data: trend.value.map((item) => item.count),
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#1989fa', width: 2 },
      itemStyle: { color: '#1989fa' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(25,137,250,0.2)' },
            { offset: 1, color: 'rgba(25,137,250,0)' },
          ],
        },
      },
    },
  ],
}));

async function loadData() {
  try {
    const res = await getDashboard();
    if (res.success) {
      kpi.value = res.data.kpi;
      trend.value = res.data.trend;
    }
  } catch {
    showToast('加载数据失败');
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.stats-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.content {
  padding: 12px 16px 24px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.kpi-card .number {
  font-size: 22px;
  font-weight: 600;
  color: #1989fa;
  margin-bottom: 4px;
}

.kpi-card .label {
  font-size: 12px;
  color: #666;
}

.chart-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 16px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.chart {
  width: 100%;
  height: 220px;
}
</style>
