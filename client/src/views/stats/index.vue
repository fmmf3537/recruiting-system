<template>
  <div class="stats-dashboard">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">数据统计</h2>
        <span class="page-subtitle">多维度招聘数据分析</span>
      </div>
      <el-button type="primary" @click="handleExportExcel">
        <el-icon><Download /></el-icon>导出 Excel
      </el-button>
    </div>

    <!-- 时间范围筛选 -->
    <el-card shadow="never" class="filter-card" style="margin-bottom: 20px;">
      <div class="filter-row">
        <span class="filter-label">时间范围：</span>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          @change="handleDateChange"
          :shortcuts="dateShortcuts"
        />
        <el-button type="primary" @click="fetchStats" :loading="loading" style="margin-left: 16px;">
          <el-icon><Refresh /></el-icon>刷新数据
        </el-button>
      </div>
    </el-card>

    <!-- Tab 切换 -->
    <el-card shadow="never" class="stats-card" v-loading="loading">
      <el-tabs v-model="activeTab" type="border-card">
        <!-- Tab 1: 招聘漏斗 -->
        <el-tab-pane label="招聘漏斗" name="funnel">
          <div class="tab-content">
            <div class="funnel-chart-container">
              <v-chart class="funnel-chart" :option="funnelOption" autoresize />
            </div>
            <div class="funnel-table">
              <el-table :data="funnelData" stripe style="width: 100%">
                <el-table-column prop="stage" label="阶段" />
                <el-table-column prop="count" label="人数" align="center" />
                <el-table-column prop="conversion" label="转化率" align="center">
                  <template #default="{ row }">
                    <el-progress
                      :percentage="row.conversion"
                      :color="getProgressColor(row.conversion)"
                      :stroke-width="10"
                    />
                  </template>
                </el-table-column>
                <el-table-column prop="dropOff" label="流失率" align="center">
                  <template #default="{ row }">
                    <span :class="{ 'text-danger': row.dropOff > 50 }">{{ row.dropOff }}%</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 2: 招聘周期 -->
        <el-tab-pane label="招聘周期" name="cycle">
          <div class="tab-content">
            <div class="cycle-chart-container">
              <v-chart class="cycle-chart" :option="cycleOption" autoresize />
            </div>
            <div class="cycle-table">
              <el-table :data="cycleData" stripe style="width: 100%">
                <el-table-column prop="stage" label="阶段" />
                <el-table-column prop="avgDays" label="平均停留天数" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.avgDays > 7 ? 'warning' : 'success'">{{ row.avgDays }}天</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="maxDays" label="最长停留" align="center" />
                <el-table-column prop="minDays" label="最短停留" align="center" />
                <el-table-column prop="totalCount" label="总人数" align="center" />
              </el-table>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 3: 渠道分析 -->
        <el-tab-pane label="渠道分析" name="channel">
          <div class="tab-content">
            <div class="channel-chart-container">
              <v-chart class="channel-chart" :option="channelOption" autoresize />
            </div>
            <div class="channel-table">
              <el-table :data="channelData" stripe style="width: 100%">
                <el-table-column prop="source" label="渠道" />
                <el-table-column prop="count" label="简历数" align="center" sortable />
                <el-table-column prop="hired" label="入职数" align="center" sortable />
                <el-table-column prop="conversion" label="转化率" align="center" sortable>
                  <template #default="{ row }">
                    <el-progress
                      :percentage="Math.round(row.conversion)"
                      :color="getProgressColor(row.conversion)"
                    />
                  </template>
                </el-table-column>
                <el-table-column prop="cost" label="人均成本" align="center">
                  <template #default="{ row }">
                    {{ row.cost ? '¥' + row.cost : '-' }}
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 4: 工作量统计 -->
        <el-tab-pane label="工作量统计" name="workload">
          <div class="tab-content">
            <div class="workload-chart-container">
              <v-chart class="workload-chart" :option="workloadOption" autoresize />
            </div>
            <div class="workload-table">
              <el-table :data="workloadData" stripe style="width: 100%">
                <el-table-column prop="userName" label="成员" />
                <el-table-column prop="newCandidates" label="新增候选人" align="center" sortable />
                <el-table-column prop="stageAdvances" label="阶段推进" align="center" sortable />
                <el-table-column prop="interviews" label="面试次数" align="center" sortable />
                <el-table-column prop="offers" label="发放Offer" align="center" sortable />
                <el-table-column prop="hired" label="成功入职" align="center" sortable />
                <el-table-column prop="conversionRate" label="转化率" align="center">
                  <template #default="{ row }">
                    <el-tag :type="row.conversionRate >= 30 ? 'success' : 'warning'">
                      {{ row.conversionRate }}%
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Refresh } from '@element-plus/icons-vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, LineChart, FunnelChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
} from 'echarts/components';
import { LinearGradient } from 'echarts/lib/util/graphic';
import VChart from 'vue-echarts';
import * as XLSX from 'xlsx';
import { getWorkloadStats, getChannelStats } from '@/api/stats';

// 注册 ECharts 组件
use([
  CanvasRenderer,
  BarChart,
  LineChart,
  FunnelChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
]);

const activeTab = ref('funnel');
const loading = ref(false);

// 时间范围筛选
const dateRange = ref<[string, string] | null>(null);
const dateShortcuts = [
  {
    text: '最近一周',
    value: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]];
    },
  },
  {
    text: '最近一个月',
    value: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]];
    },
  },
  {
    text: '本季度',
    value: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      return [start.toISOString().split('T')[0], now.toISOString().split('T')[0]];
    },
  },
  {
    text: '本年度',
    value: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return [start.toISOString().split('T')[0], now.toISOString().split('T')[0]];
    },
  },
];

function handleDateChange() {
  fetchStats();
}

// ============ 招聘漏斗数据 ============
const funnelData = ref([
  { stage: '简历入库', count: 1000, conversion: 100, dropOff: 0 },
  { stage: '初筛通过', count: 600, conversion: 60, dropOff: 40 },
  { stage: '复试通过', count: 300, conversion: 30, dropOff: 50 },
  { stage: '终面通过', count: 150, conversion: 15, dropOff: 50 },
  { stage: 'Offer接受', count: 80, conversion: 8, dropOff: 47 },
  { stage: '成功入职', count: 60, conversion: 6, dropOff: 25 },
]);

const funnelOption = computed(() => ({
  title: { text: '招聘漏斗分析', left: 'center' },
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c}人 ({d}%)',
  },
  series: [
    {
      name: '招聘漏斗',
      type: 'funnel',
      left: '10%',
      top: 60,
      bottom: 60,
      width: '80%',
      min: 0,
      max: 1000,
      minSize: '0%',
      maxSize: '100%',
      sort: 'descending',
      gap: 2,
      label: {
        show: true,
        position: 'inside',
        formatter: '{b}\n{c}人',
        fontSize: 12,
      },
      labelLine: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      emphasis: {
        label: { fontSize: 14 },
      },
      data: funnelData.value.map((item, index) => ({
        value: item.count,
        name: item.stage,
        itemStyle: {
          color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'][index],
        },
      })),
    },
  ],
}));

// ============ 招聘周期数据 ============
const cycleData = ref([
  { stage: '初筛', avgDays: 2, maxDays: 7, minDays: 1, totalCount: 600 },
  { stage: '复试', avgDays: 5, maxDays: 14, minDays: 2, totalCount: 300 },
  { stage: '终面', avgDays: 3, maxDays: 10, minDays: 1, totalCount: 150 },
  { stage: 'Offer谈判', avgDays: 4, maxDays: 21, minDays: 1, totalCount: 80 },
  { stage: '入职准备', avgDays: 15, maxDays: 45, minDays: 7, totalCount: 60 },
]);

const cycleOption = computed(() => ({
  title: { text: '各阶段平均停留天数', left: 'center' },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  xAxis: {
    type: 'category',
    data: cycleData.value.map(item => item.stage),
    axisLabel: { rotate: 0 },
  },
  yAxis: {
    type: 'value',
    name: '天数',
  },
  series: [
    {
      name: '平均天数',
      type: 'bar',
      data: cycleData.value.map(item => item.avgDays),
      itemStyle: {
        color: new LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#83bff6' },
          { offset: 0.5, color: '#188df0' },
          { offset: 1, color: '#188df0' },
        ]),
      },
      label: {
        show: true,
        position: 'top',
        formatter: '{c}天',
      },
    },
    {
      name: '趋势',
      type: 'line',
      data: cycleData.value.map(item => item.avgDays),
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { color: '#fac858', width: 3 },
      itemStyle: { color: '#fac858' },
    },
  ],
}));

// ============ 渠道分析数据 ============
const channelData = ref([
  { source: 'BOSS直聘', count: 450, hired: 25, conversion: 5.6, cost: 120 },
  { source: '猎聘', count: 200, hired: 12, conversion: 6.0, cost: 200 },
  { source: '智联招聘', count: 180, hired: 8, conversion: 4.4, cost: 150 },
  { source: '前程无忧', count: 120, hired: 6, conversion: 5.0, cost: 180 },
  { source: '内推', count: 80, hired: 15, conversion: 18.8, cost: 50 },
  { source: '官网投递', count: 60, hired: 5, conversion: 8.3, cost: 30 },
  { source: '其他', count: 30, hired: 1, conversion: 3.3, cost: 0 },
]);

const channelOption = computed(() => ({
  title: { text: '渠道简历量对比', left: 'center' },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  legend: { data: ['简历数', '入职数'], bottom: 0 },
  xAxis: {
    type: 'category',
    data: channelData.value.map(item => item.source),
    axisLabel: { rotate: 30 },
  },
  yAxis: [
    { type: 'value', name: '简历数' },
    { type: 'value', name: '入职数', minInterval: 1 },
  ],
  series: [
    {
      name: '简历数',
      type: 'bar',
      data: channelData.value.map(item => item.count),
      itemStyle: { color: '#5470c6' },
    },
    {
      name: '入职数',
      type: 'bar',
      yAxisIndex: 1,
      data: channelData.value.map(item => item.hired),
      itemStyle: { color: '#91cc75' },
    },
  ],
}));

// ============ 工作量统计数据 ============
const workloadData = ref([
  { userName: '张三', newCandidates: 50, stageAdvances: 30, interviews: 20, offers: 8, hired: 5, conversionRate: 10 },
  { userName: '李四', newCandidates: 45, stageAdvances: 25, interviews: 18, offers: 6, hired: 4, conversionRate: 8.9 },
  { userName: '王五', newCandidates: 60, stageAdvances: 35, interviews: 25, offers: 10, hired: 7, conversionRate: 11.7 },
  { userName: '赵六', newCandidates: 40, stageAdvances: 20, interviews: 15, offers: 5, hired: 3, conversionRate: 7.5 },
  { userName: '钱七', newCandidates: 55, stageAdvances: 32, interviews: 22, offers: 9, hired: 6, conversionRate: 10.9 },
]);

const workloadOption = computed(() => ({
  title: { text: '团队成员工作量对比', left: 'center' },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  legend: { data: ['新增候选人', '阶段推进', '面试次数', '发放Offer', '成功入职'], bottom: 0 },
  xAxis: {
    type: 'category',
    data: workloadData.value.map(item => item.userName),
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: '新增候选人',
      type: 'bar',
      data: workloadData.value.map(item => item.newCandidates),
      itemStyle: { color: '#5470c6' },
    },
    {
      name: '阶段推进',
      type: 'bar',
      data: workloadData.value.map(item => item.stageAdvances),
      itemStyle: { color: '#91cc75' },
    },
    {
      name: '面试次数',
      type: 'bar',
      data: workloadData.value.map(item => item.interviews),
      itemStyle: { color: '#fac858' },
    },
    {
      name: '发放Offer',
      type: 'bar',
      data: workloadData.value.map(item => item.offers),
      itemStyle: { color: '#ee6666' },
    },
    {
      name: '成功入职',
      type: 'bar',
      data: workloadData.value.map(item => item.hired),
      itemStyle: { color: '#73c0de' },
    },
  ],
}));

// ============ 方法 ============
function getProgressColor(percentage: number): string {
  if (percentage >= 50) return '#67c23a';
  if (percentage >= 20) return '#e6a23c';
  return '#f56c6c';
}

// 获取当前 Tab 的数据
function getCurrentTabData() {
  switch (activeTab.value) {
    case 'funnel':
      return {
        sheetName: '招聘漏斗',
        data: funnelData.value,
        columns: ['阶段', '人数', '转化率(%)', '流失率(%)'],
      };
    case 'cycle':
      return {
        sheetName: '招聘周期',
        data: cycleData.value,
        columns: ['阶段', '平均停留天数', '最长停留', '最短停留', '总人数'],
      };
    case 'channel':
      return {
        sheetName: '渠道分析',
        data: channelData.value,
        columns: ['渠道', '简历数', '入职数', '转化率(%)', '人均成本'],
      };
    case 'workload':
      return {
        sheetName: '工作量统计',
        data: workloadData.value,
        columns: ['成员', '新增候选人', '阶段推进', '面试次数', '发放Offer', '成功入职', '转化率(%)'],
      };
    default:
      return null;
  }
}

// 导出 Excel
function handleExportExcel() {
  const tabData = getCurrentTabData();
  if (!tabData) return;

  const exportData = tabData.data.map((item: any) => {
    const row: Record<string, any> = {};
    tabData.columns.forEach((col, index) => {
      const key = Object.keys(item)[index];
      row[col] = item[key as keyof typeof item];
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabData.sheetName);

  const fileName = `招聘统计_${tabData.sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);

  ElMessage.success('导出成功');
}

// 获取真实数据
async function fetchStats() {
  loading.value = true;
  try {
    const params: any = {};
    if (dateRange.value) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }

    // 获取工作量统计
    const workloadRes = await getWorkloadStats(params);
    if (workloadRes.success && workloadRes.data.length > 0) {
      workloadData.value = workloadRes.data.map((item: any) => ({
        ...item,
        conversionRate: item.newCandidates > 0 
          ? Math.round((item.hired || item.offers) / item.newCandidates * 100) 
          : 0,
      }));
    }

    // 获取渠道统计
    const channelRes = await getChannelStats(params);
    if (channelRes.success && channelRes.data.length > 0) {
      channelData.value = channelRes.data.map((item: any) => ({
        ...item,
        cost: 0, // 成本数据需要额外计算
      }));
    }
  } catch (error) {
    console.error('获取统计数据失败:', error);
    ElMessage.error('获取统计数据失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchStats();
});
</script>

<style scoped lang="scss">
.stats-dashboard {
  padding: 20px;

  .filter-card {
    .filter-row {
      display: flex;
      align-items: center;
      gap: 12px;

      .filter-label {
        font-size: 14px;
        color: #606266;
        font-weight: 500;
      }
    }
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .title-section {
      .page-title {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
        color: #303133;
      }

      .page-subtitle {
        margin-top: 8px;
        font-size: 14px;
        color: #909399;
      }
    }
  }

  .stats-card {
    .tab-content {
      padding: 20px 0;
    }

    .funnel-chart-container,
    .cycle-chart-container,
    .channel-chart-container,
    .workload-chart-container {
      height: 400px;
      margin-bottom: 30px;

      .funnel-chart,
      .cycle-chart,
      .channel-chart,
      .workload-chart {
        width: 100%;
        height: 100%;
      }
    }

    .funnel-table,
    .cycle-table,
    .channel-table,
    .workload-table {
      margin-top: 20px;
    }
  }

  .text-danger {
    color: #f56c6c;
    font-weight: 500;
  }
}
</style>
