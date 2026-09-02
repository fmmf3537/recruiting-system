<template>
  <div class="interview-detail-page" v-loading="loading">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <el-button @click="handleBack">
          <el-icon><Back /></el-icon>返回列表
        </el-button>
        <h2 class="page-title">面试详情</h2>
      </div>
    </div>

    <!-- 面试信息卡片 -->
    <el-card shadow="never" class="info-card">
      <template #header>
        <span class="card-title">面试信息</span>
      </template>
      <el-descriptions v-if="interview" :column="3" border>
        <el-descriptions-item label="候选人">{{ interview.candidateName }}</el-descriptions-item>
        <el-descriptions-item label="职位">{{ interview.jobTitle || '未分配职位' }}</el-descriptions-item>
        <el-descriptions-item label="轮次">
          <el-tag effect="light">{{ interview.round }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="面试方式">{{ interview.type }}</el-descriptions-item>
        <el-descriptions-item label="考察方向">{{ interviewFocusTypeName }}</el-descriptions-item>
        <el-descriptions-item label="面试时间">{{ formatDateTime(interview.scheduledAt) }}</el-descriptions-item>
        <el-descriptions-item label="时长">{{ interview.duration }}分钟</el-descriptions-item>
        <el-descriptions-item label="地点/链接">{{ interview.location || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(interview.status)">{{ getStatusText(interview.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="面试官">
          {{ interview.interviewers?.map((i) => i.name).join('、') || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="3">{{ interview.notes || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- AI 面试大纲（F3-C 卡片，组件内自带拉取/版本切换/手动微调） -->
    <QuestionOutlineCard
      v-if="interview"
      :interview-id="interview.id"
      :interview-focus-type="interview.focusType"
    />

    <!-- 面试官评估 -->
    <el-card shadow="never" class="evaluation-card">
      <template #header>
        <span class="card-title">面试官评估</span>
      </template>

      <el-table :data="evaluations" stripe style="width: 100%">
        <el-table-column type="expand">
          <template #default="{ row }">
            <!-- 各维度评分明细 -->
            <div class="dimension-detail">
              <el-table v-if="row.dimensions?.length" :data="row.dimensions" size="small" border>
                <el-table-column prop="name" label="评估维度" width="200" />
                <el-table-column label="评分" width="200">
                  <template #default="{ row: dim }">
                    <el-rate :model-value="dim.score" :max="5" disabled />
                  </template>
                </el-table-column>
                <el-table-column prop="comment" label="评语">
                  <template #default="{ row: dim }">{{ dim.comment || '—' }}</template>
                </el-table-column>
              </el-table>
              <el-empty v-else description="暂无维度评分" :image-size="60" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="interviewerName" label="面试官" min-width="120" />
        <el-table-column label="提交状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.submittedAt ? 'success' : 'info'">
              {{ row.submittedAt ? '已提交' : '待提交' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="综合评分" width="180" align="center">
          <template #default="{ row }">
            <el-rate v-if="row.overallScore" :model-value="row.overallScore" :max="5" disabled />
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="结论" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.conclusion" :type="getConclusionType(row.conclusion)">
              {{ getConclusionText(row.conclusion) }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="170">
          <template #default="{ row }">
            {{ row.submittedAt ? formatDateTime(row.submittedAt) : '—' }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!evaluations.length" description="暂无评估记录" />
    </el-card>

    <!-- 维度评分雷达图（有已提交评估时展示） -->
    <el-card v-if="radarOption" shadow="never" class="radar-card">
      <template #header>
        <span class="card-title">维度评分对比</span>
      </template>
      <v-chart class="radar-chart" :option="radarOption" autoresize />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Back } from '@element-plus/icons-vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { RadarChart } from 'echarts/charts';
import { RadarComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import { getInterviewById, type InterviewItem } from '@/api/interview';
import {
  getInterviewEvaluations,
  type InterviewEvaluationItem,
  type EvaluationConclusion,
} from '@/api/evaluation';
import { getDictionaries, type DictionaryItem } from '@/api/dictionary';
import QuestionOutlineCard from '@/components/interviews/QuestionOutlineCard.vue';

// 注册 ECharts 组件（雷达图按需引入）
use([CanvasRenderer, RadarChart, RadarComponent, TooltipComponent, LegendComponent]);

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const interview = ref<InterviewItem | null>(null);
const evaluations = ref<InterviewEvaluationItem[]>([]);

// F3-C 考察方向字典（code → name）
const focusTypeDict = ref<DictionaryItem[]>([]);
const focusTypeMap = computed(() => {
  const m: Record<string, string> = {};
  focusTypeDict.value.forEach((d) => {
    if (d.enabled) m[d.code] = d.name;
  });
  return m;
});
// 面试信息行展示用：code 转中文名，无 focusType 显示 —
const interviewFocusTypeName = computed(() => {
  const code = interview.value?.focusType;
  if (!code) return '—';
  return focusTypeMap.value[code] || code;
});

// 已提交的评估（用于雷达图）
const submittedEvaluations = computed(() =>
  evaluations.value.filter((e) => e.submittedAt && e.dimensions && e.dimensions.length)
);

// 雷达图配置：indicator 取所有已提交评估的维度并集，每位面试官一条 series
const radarOption = computed(() => {
  if (!submittedEvaluations.value.length) return null;

  const dimensionNames: string[] = [];
  submittedEvaluations.value.forEach((e) => {
    e.dimensions?.forEach((d) => {
      if (!dimensionNames.includes(d.name)) dimensionNames.push(d.name);
    });
  });

  return {
    tooltip: {},
    legend: {
      data: submittedEvaluations.value.map((e) => e.interviewerName),
    },
    radar: {
      indicator: dimensionNames.map((name) => ({ name, max: 5 })),
    },
    series: [
      {
        type: 'radar',
        data: submittedEvaluations.value.map((e) => ({
          name: e.interviewerName,
          // 未评的维度补 0
          value: dimensionNames.map(
            (name) => e.dimensions?.find((d) => d.name === name)?.score || 0
          ),
        })),
      },
    ],
  };
});

async function fetchDetail() {
  loading.value = true;
  try {
    const id = route.params.id as string;
    const [detailRes, evalRes, dictRes] = await Promise.all([
      // 响应拦截器直接返回 response.data，此处断言为实际返回结构
      getInterviewById(id) as unknown as Promise<{ success: boolean; data: InterviewItem }>,
      getInterviewEvaluations(id),
      // 考察方向字典（用于描述行展示与卡片初始默认值）
      getDictionaries({ category: 'interview_focus_type' }) as unknown as Promise<{
        success: boolean;
        data: DictionaryItem[];
      }>,
    ]);
    if (detailRes.success) {
      interview.value = detailRes.data;
    }
    if (evalRes.success) {
      evaluations.value = evalRes.data || [];
    }
    if (dictRes.success) {
      focusTypeDict.value = dictRes.data || [];
    }
  } catch (error) {
    console.error('获取面试详情失败:', error);
    ElMessage.error('获取面试详情失败');
  } finally {
    loading.value = false;
  }
}

function handleBack() {
  router.push('/interviews');
}

// ============ 格式化 ============
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getStatusType(status: string): string {
  return { scheduled: 'primary', completed: 'success', cancelled: 'info', no_show: 'danger' }[status] || 'info';
}

function getStatusText(status: string): string {
  return { scheduled: '待进行', completed: '已完成', cancelled: '已取消', no_show: '未到' }[status] || status;
}

function getConclusionType(c: EvaluationConclusion): string {
  return { pass: 'success', reject: 'danger', pending: 'warning' }[c] || 'info';
}

function getConclusionText(c: EvaluationConclusion): string {
  return { pass: '通过', reject: '不通过', pending: '待定' }[c] || c;
}

onMounted(() => {
  fetchDetail();
});
</script>

<style scoped lang="scss">
.interview-detail-page {
  padding: 20px;

  .page-header {
    margin-bottom: 20px;

    .title-section {
      display: flex;
      align-items: center;
      gap: 16px;

      .page-title {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
        color: #303133;
      }
    }
  }

  .info-card,
  .evaluation-card,
  .radar-card {
    margin-bottom: 20px;

    .card-title {
      font-weight: 500;
    }
  }

  .dimension-detail {
    padding: 12px 40px;
  }

  .radar-chart {
    height: 400px;
  }
}
</style>
