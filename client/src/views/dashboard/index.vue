<template>
  <div class="dashboard-container">
    <h1 class="page-title">仪表盘</h1>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <!-- UI-S4：lg 8→6，四张卡一行（原 4×8=32>24 导致第四张换行留白） -->
      <el-col :xs="24" :sm="12" :lg="newLayout ? 6 : 8">
        <el-card shadow="hover" class="stat-card" @click="goTo('/candidates')">
          <div class="stat-content">
            <div class="stat-icon blue">
              <el-icon :size="40"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.newCandidates }}</div>
              <div class="stat-title">本月新增候选人</div>
              <div class="stat-trend" v-if="stats.candidatesTrend">
                <el-tag :type="stats.candidatesTrend > 0 ? 'success' : 'danger'" size="small">
                  {{ stats.candidatesTrend > 0 ? '+' : '' }}{{ stats.candidatesTrend }}%
                </el-tag>
                <span>较上月</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- UI-S4：lg 8→6，四张卡一行（原 4×8=32>24 导致第四张换行留白） -->
      <el-col :xs="24" :sm="12" :lg="newLayout ? 6 : 8">
        <el-card shadow="hover" class="stat-card" @click="goTo('/jobs')">
          <div class="stat-content">
            <div class="stat-icon green">
              <el-icon :size="40"><Briefcase /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.openJobs }}</div>
              <div class="stat-title">进行中职位数</div>
              <div class="stat-desc">包含开放和暂停的职位</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- UI-S4：lg 8→6，四张卡一行（原 4×8=32>24 导致第四张换行留白） -->
      <el-col :xs="24" :sm="12" :lg="newLayout ? 6 : 8">
        <el-card shadow="hover" class="stat-card" @click="goTo('/offers')">
          <div class="stat-content">
            <div class="stat-icon orange">
              <el-icon :size="40"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.pendingJoin }}</div>
              <div class="stat-title">待入职人数</div>
              <div class="stat-desc">已接受 Offer 待入职</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- UI-S4：lg 8→6，四张卡一行（原 4×8=32>24 导致第四张换行留白） -->
      <el-col :xs="24" :sm="12" :lg="newLayout ? 6 : 8">
        <el-card shadow="hover" class="stat-card" @click="goTo('/hc-requests')">
          <div class="stat-content">
            <div class="stat-icon purple">
              <el-icon :size="40"><Tickets /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.hcApproved }}</div>
              <div class="stat-title">已批准编制</div>
              <div class="stat-desc" v-if="stats.hcPending > 0">{{ stats.hcPending }} 条待审批</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- F4-C：HR 考核「我的积分」卡片，仅 hr（含存量 member）可见；原 4 卡布局不动 -->
    <el-row v-if="isHrRole" :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12" :lg="8">
        <PersonalScoreCard />
      </el-col>
    </el-row>

    <!-- 快捷操作 -->
    <el-card class="quick-actions" shadow="never">
      <template #header>
        <div class="card-header">
          <span>快捷操作</span>
        </div>
      </template>
      <div class="actions-list">
        <el-button type="primary" size="large" @click="goTo('/candidates')">
          <el-icon><Plus /></el-icon>新增候选人
        </el-button>
        <el-button type="success" size="large" @click="goTo('/jobs')">
          <el-icon><Briefcase /></el-icon>发布职位
        </el-button>
        <el-button type="warning" size="large" @click="goTo('/stats')">
          <el-icon><TrendCharts /></el-icon>查看报表
        </el-button>
      </div>
    </el-card>

    <!-- 图表和列表 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :xs="24" :lg="14">
        <el-card shadow="never" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>招聘漏斗</span>
              <el-radio-group v-model="funnelTimeRange" size="small">
                <el-radio-button label="month">本月</el-radio-button>
                <el-radio-button label="quarter">本季度</el-radio-button>
                <el-radio-button label="year">本年度</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div v-if="newLayout && isFunnelEmpty" class="funnel-empty">
            <EmptyState
              type="empty"
              title="暂无招聘数据"
              description="当前时间范围内没有候选人流转记录"
            />
          </div>
          <div v-show="!newLayout || !isFunnelEmpty" ref="funnelChartRef" class="funnel-chart"></div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card shadow="never" class="activity-card">
          <template #header>
            <div class="card-header">
              <span>近期候选人动态</span>
              <el-button link type="primary" @click="goTo('/candidates')">
                查看全部
              </el-button>
            </div>
          </template>
          
          <div class="activity-list" v-loading="activityLoading">
            <CardSkeleton v-if="activityLoading && recentActivities.length === 0" />
            <template v-else>
              <div
                v-for="item in recentActivities"
                :key="item.id"
                class="activity-item"
              >
                <div class="activity-avatar">
                  <el-avatar :size="40" :icon="UserFilled" />
                </div>
                <div class="activity-content">
                  <div class="activity-title">
                    <span class="candidate-name">{{ item.candidateName }}</span>
                    <span class="activity-action">{{ item.action }}</span>
                  </div>
                  <div class="activity-meta">
                    <span class="stage-tag" :class="item.stage">
                      {{ item.stageText }}
                    </span>
                    <span class="activity-time">{{ formatTime(item.time) }}</span>
                  </div>
                </div>
              </div>

              <el-empty v-if="recentActivities.length === 0" description="暂无动态" />
            </template>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { CardSkeleton } from '@/components/Skeleton';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import PersonalScoreCard from '@/components/dashboard/PersonalScoreCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import {
  User,
  Briefcase,
  CircleCheck,
  Plus,
  TrendCharts,
  UserFilled,
  Tickets,
} from '@element-plus/icons-vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { FunnelChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import type { EChartsOption } from 'echarts';
import * as echarts from 'echarts/core';

use([CanvasRenderer, FunnelChart, TooltipComponent]);
import { getFunnelStats } from '@/api/stats';
import { getCandidateList, getRecentActivities } from '@/api/candidate';
import { getJobList } from '@/api/job';
import { getOfferList } from '@/api/offer';
import { getHCRequests } from '@/api/hc-request';

const router = useRouter();
const authStore = useAuthStore();
// UI-S4：新布局开关（关闭时回到改造前栅格与图表配置）；默认开启。回退：localStorage.setItem('ui:new-layout:UI-S4','false')
const newLayout = ref(localStorage.getItem('ui:new-layout:UI-S4') !== 'false');
// member 归一为 hr（与菜单/路由守卫一致）
const isHrRole = computed(() => {
  const raw = authStore.userInfo?.role;
  return raw === 'hr' || raw === 'member';
});

// 统计数据
const stats = reactive({
  newCandidates: 0,
  candidatesTrend: 15,
  openJobs: 0,
  pendingJoin: 0,
  hcApproved: 0,
  hcPending: 0,
});

// 加载状态
const activityLoading = ref(false);

// 漏斗图时间范围
const funnelTimeRange = ref('month');

// 漏斗图容器
const funnelChartRef = ref<HTMLDivElement>();
let funnelChart: echarts.ECharts | null = null;

// 漏斗图数据
const funnelData = ref<{ value: number; name: string; itemStyle: { color: string } }[]>([
  { value: 0, name: '简历入库', itemStyle: { color: '#5470c6' } },
  { value: 0, name: '初筛通过', itemStyle: { color: '#91cc75' } },
  { value: 0, name: '复试通过', itemStyle: { color: '#fac858' } },
  { value: 0, name: '终面通过', itemStyle: { color: '#ee6666' } },
  { value: 0, name: 'Offer接受', itemStyle: { color: '#73c0de' } },
  { value: 0, name: '成功入职', itemStyle: { color: '#3ba272' } },
]);

// UI-S4：所有阶段均为 0 时视为空（不新增接口，纯前端判断）
const isFunnelEmpty = computed(() => funnelData.value.every((d) => !d.value));

// 根据时间范围类型计算起止日期
function getDateRangeByType(type: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const year = now.getFullYear();
  const month = now.getMonth();
  let startDate: string;

  if (type === 'month') {
    startDate = new Date(year, month, 1).toISOString().split('T')[0];
  } else if (type === 'quarter') {
    const quarter = Math.floor(month / 3);
    startDate = new Date(year, quarter * 3, 1).toISOString().split('T')[0];
  } else {
    startDate = new Date(year, 0, 1).toISOString().split('T')[0];
  }

  return { startDate, endDate };
}

// 近期动态
interface ActivityItem {
  id: string;
  candidateName: string;
  action: string;
  stage: string;
  stageText: string;
  time: string;
}

const recentActivities = ref<ActivityItem[]>([]);

// 获取近期候选人动态
async function fetchRecentActivities() {
  activityLoading.value = true;
  try {
    const res = await getRecentActivities(20);
    console.log('[Dashboard] 近期动态 API 返回:', res.data?.length, res.data);
    if (res.success) {
      recentActivities.value = res.data;
    }
  } catch (error: any) {
    console.error('[Dashboard] 近期动态 API 错误:', error?.response?.data || error);
  } finally {
    activityLoading.value = false;
  }
}

// 跳转到指定页面
function goTo(path: string) {
  router.push(path);
}

// 格式化时间
function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    return `${hours}小时前`;
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

// UI-S4：漏斗配置统一入口，供初始化与时间范围切换共用，避免两处配置漂移
function buildFunnelOption(): EChartsOption {
  // 开关关闭：完整保留改造前配置，便于一键回退对比
  if (!newLayout.value) {
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c}人 ({d}%)',
      },
      series: [
        {
          name: '招聘漏斗',
          type: 'funnel',
          left: '10%',
          top: 20,
          bottom: 20,
          width: '80%',
          min: 0,
          max: 100,
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
          labelLine: {
            show: false,
          },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1,
          },
          emphasis: {
            label: {
              fontSize: 14,
            },
          },
          data: funnelData.value,
        },
      ],
    };
  }

  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}人 ({d}%)' },
    series: [
      {
        name: '招聘漏斗',
        type: 'funnel',
        left: '5%',
        top: 20,
        bottom: 20,
        width: '55%',
        // UI-S4：删除硬编码 min/max，改为按数据自适应（原 min:0/max:100 会压扁小值阶段）
        // UI-S4：minSize 0%→20%，保证每一层都有可容纳图形的最小高度
        minSize: '20%',
        maxSize: '100%',
        sort: 'descending',
        gap: 2,
        label: {
          show: true,
          position: 'right', // UI-S4：由 inside 改为右侧外显，彻底解决细条内文字重叠
          formatter: '{b} {c}人',
          fontSize: 12,
        },
        labelLine: { show: true, length: 12, lineStyle: { width: 1 } },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        emphasis: { label: { fontSize: 14 } },
        data: funnelData.value,
      },
    ],
  };
}

// 初始化漏斗图
function initFunnelChart() {
  if (!funnelChartRef.value) return;

  funnelChart = echarts.init(funnelChartRef.value);

  funnelChart.setOption(buildFunnelOption());
}

// 获取漏斗图数据
async function fetchFunnelStats() {
  try {
    const { startDate, endDate } = getDateRangeByType(funnelTimeRange.value);
    const res = await getFunnelStats({ startDate, endDate });
    if (res.success && res.data) {
      const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'];
      funnelData.value = res.data.map((item, index) => ({
        value: item.count,
        name: item.stage,
        itemStyle: { color: colors[index] || '#5470c6' },
      }));
      funnelChart?.setOption(buildFunnelOption());
      // UI-S4：空态切回图表时容器可能刚从 display:none 恢复，补一次 resize
      nextTick(() => funnelChart?.resize());
    }
  } catch (error) {
    console.error('获取漏斗数据失败:', error);
  }
}

// 获取统计数据
async function fetchStats() {
  try {
    const [candidatesRes, jobsRes, offersRes, hcRes] = await Promise.all([
      getCandidateList({ page: 1, pageSize: 1 }),
      getJobList({ page: 1, pageSize: 1, status: 'open' }),
      getOfferList({ page: 1, pageSize: 100, result: 'accepted' }),
      getHCRequests({ pageSize: 100 }),
    ]);

    if (candidatesRes.success) {
      stats.newCandidates = candidatesRes.pagination.total;
    }
    if (jobsRes.success) {
      stats.openJobs = jobsRes.pagination.total;
    }
    if (offersRes.success) {
      stats.pendingJoin = offersRes.data.filter((o: any) => !o.joined).length;
    }
    if (hcRes.success) {
      stats.hcApproved = hcRes.data.filter((h: any) => h.status === 'approved' || h.status === 'fulfilled').length;
      stats.hcPending = hcRes.data.filter((h: any) => h.status === 'submitted').length;
    }
  } catch (error) {
    console.error('获取统计数据失败:', error);
  }
}

// 监听时间范围变化
watch(funnelTimeRange, () => {
  fetchFunnelStats();
});

// 窗口大小变化时重新渲染图表
function handleResize() {
  funnelChart?.resize();
}

onMounted(() => {
  fetchStats();
  fetchFunnelStats();
  fetchRecentActivities();
  nextTick(() => {
    initFunnelChart();
  });
  window.addEventListener('resize', handleResize);
});

onActivated(() => {
  fetchStats();
  fetchFunnelStats();
  fetchRecentActivities();
  nextTick(() => {
    funnelChart?.resize();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  funnelChart?.dispose();
});
</script>

<style scoped lang="scss">
.dashboard-container {
  padding: 20px;
}

.page-title {
  margin: 0 0 24px;
  font-size: 24px;
  font-weight: 500;
  color: #303133;
}

// 统计卡片
.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }

  .stat-content {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .stat-icon {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;

    &.blue {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    &.green {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    }

    &.orange {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }

    &.purple {
      background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
    }
  }

  .stat-info {
    flex: 1;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 600;
    color: #303133;
    line-height: 1.2;
    margin-bottom: 4px;
  }

  .stat-title {
    font-size: 14px;
    color: #606266;
    margin-bottom: 8px;
  }

  .stat-desc {
    font-size: 12px;
    color: #909399;
  }

  .stat-trend {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #909399;
  }
}

// 快捷操作
.quick-actions {
  margin-bottom: 24px;

  .actions-list {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;

    .el-button {
      min-width: 140px;
    }
  }
}

// 图表区域
.chart-row {
  .chart-card,
  .activity-card {
    height: 420px;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.funnel-chart {
  width: 100%;
  height: 350px;
}

.funnel-empty {
  width: 100%;
  height: 350px;
  display: flex;
  align-items: center;
  justify-content: center;
}

// 动态列表
.activity-list {
  height: 350px;
  overflow-y: auto;

  .activity-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 0;
    border-bottom: 1px solid #ebeef5;

    &:last-child {
      border-bottom: none;
    }
  }

  .activity-content {
    flex: 1;
  }

  .activity-title {
    margin-bottom: 8px;

    .candidate-name {
      font-weight: 500;
      color: #303133;
      margin-right: 8px;
    }

    .activity-action {
      color: #606266;
      font-size: 14px;
    }
  }

  .activity-meta {
    display: flex;
    align-items: center;
    gap: 12px;

    .stage-tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;

      &.screening {
        background-color: #ecf5ff;
        color: #409eff;
      }

      &.interview {
        background-color: #f0f9eb;
        color: #67c23a;
      }

      &.offer {
        background-color: #fdf6ec;
        color: #e6a23c;
      }

      &.hired {
        background-color: #f0f9eb;
        color: #67c23a;
      }
    }

    .activity-time {
      font-size: 12px;
      color: #909399;
    }
  }
}
</style>
