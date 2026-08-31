<template>
  <div class="interviewer-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">面试官工作台</h2>
        <span class="page-subtitle">今日面试、待填评估与历史记录</span>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="今日面试" name="today">
        <el-table v-loading="todayLoading" :data="todayInterviews">
          <el-table-column label="候选人">
            <template #default="{ row }">{{ row.candidate?.name }}</template>
          </el-table-column>
          <el-table-column label="职位">
            <template #default="{ row }">{{ row.job?.title }}</template>
          </el-table-column>
          <el-table-column label="时间">
            <template #default="{ row }">{{ formatDateTime(row.scheduledAt) }}</template>
          </el-table-column>
          <el-table-column label="时长">
            <template #default="{ row }">{{ row.duration }} 分钟</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" @click="openEvaluationDialog(row)">填评估</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="待填评估" name="pending">
        <el-table v-loading="pendingLoading" :data="pendingEvaluations">
          <el-table-column label="候选人">
            <template #default="{ row }">{{ row.candidate?.name }}</template>
          </el-table-column>
          <el-table-column label="职位">
            <template #default="{ row }">{{ row.job?.title }}</template>
          </el-table-column>
          <el-table-column label="完成时间">
            <template #default="{ row }">{{ formatDate(row.scheduledAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openEvaluationDialog(row)">
                立即填评估
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="历史" name="history">
        <el-table v-loading="historyLoading" :data="historyInterviews">
          <el-table-column label="候选人">
            <template #default="{ row }">{{ row.candidate?.name }}</template>
          </el-table-column>
          <el-table-column label="职位">
            <template #default="{ row }">{{ row.job?.title }}</template>
          </el-table-column>
          <el-table-column label="面试时间">
            <template #default="{ row }">{{ formatDate(row.scheduledAt) }}</template>
          </el-table-column>
          <el-table-column label="结论">
            <template #default="{ row }">{{ row.evaluations?.[0]?.conclusion }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" @click="openEvaluationDialog(row, true)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="evalDialogVisible" title="面试评估" width="600px">
      <el-form :model="evalForm" label-width="100px">
        <el-form-item label="候选人">
          <span>{{ currentInterview?.candidate?.name }}</span>
        </el-form-item>
        <el-form-item label="维度评分">
          <div v-for="dim in evalForm.dimensions" :key="dim.name" class="dimension-row">
            <span class="dimension-name">{{ dim.name }}：</span>
            <el-rate v-model="dim.score" :max="5" :disabled="readonly" />
            <el-input
              v-model="dim.comment"
              placeholder="评语（可选）"
              :disabled="readonly"
              class="dimension-comment"
            />
          </div>
        </el-form-item>
        <el-form-item label="综合评分">
          <el-rate v-model="evalForm.overallScore" :max="5" :disabled="readonly" />
        </el-form-item>
        <el-form-item label="结论">
          <el-radio-group v-model="evalForm.conclusion" :disabled="readonly">
            <el-radio label="pass">通过</el-radio>
            <el-radio label="reject">淘汰</el-radio>
            <el-radio label="pending">待定</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="evalDialogVisible = false">关闭</el-button>
        <el-button v-if="!readonly" type="primary" @click="submitEvaluation">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '@/utils/request';

interface EvalDimension {
  name: string;
  score: number;
  comment: string;
}

interface InterviewEval {
  dimensions?: EvalDimension[];
  overallScore?: number | null;
  conclusion?: string | null;
  submittedAt?: string | null;
}

interface InterviewerInterview {
  id: string;
  scheduledAt: string;
  duration: number;
  candidate?: { name?: string };
  job?: { title?: string } | null;
  evaluations?: InterviewEval[];
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

const DEFAULT_DIMENSIONS: EvalDimension[] = [
  { name: '技术能力', score: 0, comment: '' },
  { name: '沟通能力', score: 0, comment: '' },
  { name: '工作经验', score: 0, comment: '' },
];

const activeTab = ref('today');
const todayLoading = ref(false);
const todayInterviews = ref<InterviewerInterview[]>([]);
const pendingLoading = ref(false);
const pendingEvaluations = ref<InterviewerInterview[]>([]);
const historyLoading = ref(false);
const historyInterviews = ref<InterviewerInterview[]>([]);

const evalDialogVisible = ref(false);
const readonly = ref(false);
const currentInterview = ref<InterviewerInterview | null>(null);
const evalForm = reactive({
  dimensions: DEFAULT_DIMENSIONS.map((d) => ({ ...d })),
  overallScore: 0,
  conclusion: 'pending',
});

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

async function loadToday() {
  todayLoading.value = true;
  try {
    const res = await request.get('/interview/today') as ApiSuccess<InterviewerInterview[]>;
    if (res.success) todayInterviews.value = res.data;
  } catch {
    ElMessage.error('加载今日面试失败');
  } finally {
    todayLoading.value = false;
  }
}

async function loadPending() {
  pendingLoading.value = true;
  try {
    const res = await request.get('/interview/pending-evaluations') as ApiSuccess<InterviewerInterview[]>;
    if (res.success) pendingEvaluations.value = res.data;
  } catch {
    ElMessage.error('加载待填评估失败');
  } finally {
    pendingLoading.value = false;
  }
}

async function loadHistory() {
  historyLoading.value = true;
  try {
    const res = await request.get('/interview/history') as ApiSuccess<InterviewerInterview[]>;
    if (res.success) historyInterviews.value = res.data;
  } catch {
    ElMessage.error('加载历史失败');
  } finally {
    historyLoading.value = false;
  }
}

function openEvaluationDialog(interview: InterviewerInterview, isReadonly = false) {
  currentInterview.value = interview;
  readonly.value = isReadonly;
  const existing = interview.evaluations?.[0];
  if (existing) {
    evalForm.dimensions = (existing.dimensions || DEFAULT_DIMENSIONS).map((d) => ({
      name: d.name,
      score: d.score ?? 0,
      comment: d.comment ?? '',
    }));
    evalForm.overallScore = existing.overallScore ?? 0;
    evalForm.conclusion = existing.conclusion || 'pending';
  } else {
    evalForm.dimensions = DEFAULT_DIMENSIONS.map((d) => ({ ...d }));
    evalForm.overallScore = 0;
    evalForm.conclusion = 'pending';
  }
  evalDialogVisible.value = true;
}

async function submitEvaluation() {
  if (!currentInterview.value) return;
  try {
    const res = await request.put(
      `/interview/${currentInterview.value.id}/evaluation`,
      evalForm
    ) as ApiSuccess<unknown>;
    if (res.success) {
      ElMessage.success('评估已提交');
      evalDialogVisible.value = false;
      await loadToday();
      await loadPending();
      await loadHistory();
    }
  } catch {
    ElMessage.error('提交失败');
  }
}

onMounted(async () => {
  await loadToday();
  await loadPending();
  await loadHistory();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.page-subtitle {
  margin-left: 12px;
  color: #909399;
  font-size: 13px;
}

.dimension-row {
  margin-bottom: 8px;
}

.dimension-name {
  display: inline-block;
  width: 100px;
}

.dimension-comment {
  margin-top: 4px;
}
</style>
