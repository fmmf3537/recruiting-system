<template>
  <div class="hiring-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">招聘工作台</h2>
        <span class="page-subtitle">聚焦岗位招聘进展、候选人和审批事项</span>
      </div>
      <el-radio-group
        v-if="authStore.isAdmin"
        v-model="hiringScope"
        size="small"
        aria-label="招聘工作台数据范围"
        @change="handleScopeChange"
      >
        <el-radio-button label="company">公司全局</el-radio-button>
        <el-radio-button label="owned">我负责的岗位</el-radio-button>
      </el-radio-group>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="总览" name="overview">
        <div v-loading="overviewLoading">
          <CardSkeleton v-if="overviewLoading && !overview.scope" :row-count="3" />
          <template v-else>
            <el-row :gutter="20">
              <el-col :span="6">
                <el-statistic title="开放职位" :value="overview.openJobs ?? 0" />
              </el-col>
              <el-col :span="6">
                <el-statistic title="活跃候选人" :value="overview.activeCandidates ?? 0" />
              </el-col>
              <el-col :span="6">
                <el-statistic title="待审批 Offer" :value="overview.pendingOffers ?? 0" />
              </el-col>
              <el-col :span="6">
                <el-statistic title="即将面试" :value="overview.scheduledInterviews ?? 0" />
              </el-col>
            </el-row>
            <p class="scope-tip">
              数据范围：{{ overview.scope === 'company' ? '全公司' : '我负责的岗位' }}
            </p>
          </template>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="hiringScope === 'company' ? '全部岗位' : '我的岗位'" name="jobs">
        <TableSkeleton v-if="jobsLoading" :row-count="5" />
        <el-table v-else :data="jobs">
          <el-table-column prop="title" label="岗位" min-width="180" />
          <el-table-column prop="candidateCount" label="关联候选人" width="120" />
          <el-table-column label="阶段分布" min-width="240">
            <template #default="{ row }">
              <el-tag
                v-for="(count, stage) in row.stageCounts"
                :key="stage"
                size="small"
                class="stage-tag"
                >{{ stage }} {{ count }}</el-tag
              >
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }"
              ><el-button type="primary" link @click="router.push(`/jobs/${row.id}`)"
                >查看</el-button
              ></template
            >
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="待审批" name="approvals">
        <TableSkeleton v-if="approvalsLoading" :row-count="5" />
        <el-table v-else v-loading="approvalsLoading" :data="approvals">
          <el-table-column label="候选人">
            <template #default="{ row }">{{ row.candidate?.name }}</template>
          </el-table-column>
          <el-table-column label="职位">
            <template #default="{ row }">{{ row.job?.title }}</template>
          </el-table-column>
          <el-table-column label="薪资" prop="salary" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="approveOffer(row.id)">批准</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="岗位候选人" name="candidates">
        <TableSkeleton v-if="candidatesLoading" :row-count="5" />
        <el-table v-else v-loading="candidatesLoading" :data="candidates">
          <el-table-column label="候选人">
            <template #default="{ row }">{{ row.candidate?.name }}</template>
          </el-table-column>
          <el-table-column label="目标职位">
            <template #default="{ row }">{{ row.job?.title }}</template>
          </el-table-column>
          <el-table-column label="当前职位">
            <template #default="{ row }">{{ row.candidate?.currentPosition }}</template>
          </el-table-column>
          <el-table-column label="当前公司">
            <template #default="{ row }">{{ row.candidate?.currentCompany }}</template>
          </el-table-column>
          <el-table-column label="当前阶段">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="stageStatusType(row.candidate?.stageRecords?.[0]?.status)"
              >
                {{ row.candidate?.stageRecords?.[0]?.stage || '入库' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              {{ stageStatusText(row.candidate?.stageRecords?.[0]?.status) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button type="primary" link @click="goToCandidateDetail(row)"
                >查看候选人</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="即将面试" name="interviews">
        <TableSkeleton v-if="interviewsLoading" :row-count="5" />
        <el-table v-else v-loading="interviewsLoading" :data="interviews">
          <el-table-column label="候选人">
            <template #default="{ row }">{{ row.candidate?.name }}</template>
          </el-table-column>
          <el-table-column label="职位">
            <template #default="{ row }">{{ row.job?.title }}</template>
          </el-table-column>
          <el-table-column label="面试官" min-width="120">
            <template #default="{ row }">
              {{ formatInterviewers(row.interviewers) }}
            </template>
          </el-table-column>
          <el-table-column label="方式" width="80">
            <template #default="{ row }">{{ row.type || '—' }}</template>
          </el-table-column>
          <el-table-column label="考察方向" width="100">
            <template #default="{ row }">{{ row.focusType || '—' }}</template>
          </el-table-column>
          <el-table-column label="时间">
            <template #default="{ row }">{{ formatDateTime(row.scheduledAt) }}</template>
          </el-table-column>
          <el-table-column label="时长">
            <template #default="{ row }">{{ row.duration }} 分钟</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">{{ interviewStatusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click="goToInterviewDetail(row)">
                详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { TableSkeleton, CardSkeleton } from '@/components/Skeleton';
import request from '@/utils/request';

interface HiringOverview {
  scope?: 'company' | 'owned_jobs';
  department?: string | null;
  openJobs?: number;
  activeCandidates?: number;
  pendingOffers?: number;
  scheduledInterviews?: number;
}

interface HiringJobRow {
  id: string;
  title: string;
  candidateCount: number;
  stageCounts: Record<string, number>;
}

interface HiringOfferRow {
  id: string;
  salary: string;
  candidate?: { name?: string };
  job?: { title?: string } | null;
}

interface HiringCandidateRow {
  candidate?: {
    id?: string;
    name?: string;
    currentPosition?: string | null;
    currentCompany?: string | null;
    stageRecords?: Array<{ stage: string; status?: string }>;
  };
  job?: { title?: string };
}

interface HiringInterviewRow {
  id: string;
  scheduledAt: string;
  duration: number;
  type?: string;
  status?: string;
  focusType?: string | null;
  interviewers?: Array<{ id?: string; name?: string }>;
  candidate?: { name?: string };
  job?: { title?: string } | null;
}

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

// 面试官数组 → 逗号分隔的姓名（empty/undefined → '—'）
function formatInterviewers(list?: Array<{ name?: string }>): string {
  if (!Array.isArray(list) || !list.length) return '—';
  return (
    list
      .map((i) => i.name || '')
      .filter(Boolean)
      .join('、') || '—'
  );
}

const authStore = useAuthStore();
const activeTab = ref('overview');
const hiringScope = ref<'company' | 'owned'>(authStore.isAdmin ? 'company' : 'owned');
const overviewLoading = ref(false);
const overview = reactive<HiringOverview>({});
const approvalsLoading = ref(false);
const approvals = ref<HiringOfferRow[]>([]);
const candidatesLoading = ref(false);
const candidates = ref<HiringCandidateRow[]>([]);
const interviewsLoading = ref(false);
const interviews = ref<HiringInterviewRow[]>([]);
const jobsLoading = ref(false);
const jobs = ref<HiringJobRow[]>([]);

const router = useRouter();

function getScopeParams(): { scope: 'owned' } | undefined {
  return hiringScope.value === 'owned' ? { scope: 'owned' } : undefined;
}

const INTERVIEW_STATUS_TEXT: Record<string, string> = {
  scheduled: '待进行',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未到',
};

function interviewStatusText(status?: string): string {
  if (!status) return '—';
  return INTERVIEW_STATUS_TEXT[status] || status;
}

function goToInterviewDetail(row: HiringInterviewRow) {
  router.push(`/interviews/${row.id}`);
}

function goToCandidateDetail(row: HiringCandidateRow) {
  if (row.candidate?.id) router.push(`/candidates/${row.candidate.id}`);
}

function stageStatusType(status?: string): string {
  return { in_progress: 'warning', passed: 'success', rejected: 'danger' }[status || ''] || 'info';
}

function stageStatusText(status?: string): string {
  return { in_progress: '进行中', passed: '已通过', rejected: '已淘汰' }[status || ''] || '未开始';
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

async function loadOverview() {
  overviewLoading.value = true;
  try {
    const res = (await request.get('/hiring/overview', {
      params: getScopeParams(),
    })) as ApiSuccess<HiringOverview>;
    if (res.success) Object.assign(overview, res.data);
  } catch {
    ElMessage.error('加载总览失败');
  } finally {
    overviewLoading.value = false;
  }
}

async function loadApprovals() {
  approvalsLoading.value = true;
  try {
    const res = (await request.get('/hiring/approvals', {
      params: getScopeParams(),
    })) as ApiSuccess<HiringOfferRow[]>;
    if (res.success) approvals.value = res.data;
  } catch {
    ElMessage.error('加载待审批失败');
  } finally {
    approvalsLoading.value = false;
  }
}

async function loadCandidates() {
  candidatesLoading.value = true;
  try {
    const res = (await request.get('/hiring/candidates', {
      params: getScopeParams(),
    })) as ApiSuccess<HiringCandidateRow[]>;
    if (res.success) candidates.value = res.data;
  } catch {
    ElMessage.error('加载候选人失败');
  } finally {
    candidatesLoading.value = false;
  }
}

async function loadJobs() {
  jobsLoading.value = true;
  try {
    const res = (await request.get('/hiring/jobs', { params: getScopeParams() })) as ApiSuccess<
      HiringJobRow[]
    >;
    if (res.success) jobs.value = res.data;
  } catch {
    ElMessage.error('加载我的岗位失败');
  } finally {
    jobsLoading.value = false;
  }
}

async function loadInterviews() {
  interviewsLoading.value = true;
  try {
    const res = (await request.get('/hiring/interviews', {
      params: getScopeParams(),
    })) as ApiSuccess<HiringInterviewRow[]>;
    if (res.success) interviews.value = res.data;
  } catch {
    ElMessage.error('加载面试失败');
  } finally {
    interviewsLoading.value = false;
  }
}

async function handleScopeChange(): Promise<void> {
  await Promise.all([
    loadOverview(),
    loadApprovals(),
    loadCandidates(),
    loadJobs(),
    loadInterviews(),
  ]);
}

async function approveOffer(id: string) {
  try {
    const res = (await request.post(`/hiring/approvals/${id}/approve`)) as ApiSuccess<unknown>;
    if (res.success) {
      ElMessage.success('已批准');
      await loadApprovals();
      await loadOverview();
    }
  } catch {
    ElMessage.error('审批失败');
  }
}

onMounted(async () => {
  await loadOverview();
  await loadApprovals();
  await loadCandidates();
  await loadJobs();
  await loadInterviews();
});
</script>

<style scoped>
.hiring-page {
  padding: 0;
}

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

.scope-tip {
  margin-top: 16px;
  color: #909399;
  font-size: 13px;
}
.stage-tag {
  margin-right: 6px;
}
</style>
