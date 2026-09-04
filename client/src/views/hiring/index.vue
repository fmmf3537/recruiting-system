<template>
  <div class="hiring-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">招聘工作台</h2>
        <span class="page-subtitle">用人经理视角：看本部门招聘、审批 Offer</span>
      </div>
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
              数据范围：{{ overview.scope === 'company' ? '全公司' : `部门 ${overview.department || '(未设置)'}` }}
            </p>
          </template>
        </div>
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

      <el-tab-pane label="本部门候选人" name="candidates">
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
            <template #default="{ row }">{{ row.candidate?.stageRecords?.[0]?.stage }}</template>
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
import { TableSkeleton, CardSkeleton } from '@/components/Skeleton';
import request from '@/utils/request';

interface HiringOverview {
  scope?: 'company' | 'department';
  department?: string | null;
  openJobs?: number;
  activeCandidates?: number;
  pendingOffers?: number;
  scheduledInterviews?: number;
}

interface HiringOfferRow {
  id: string;
  salary: string;
  candidate?: { name?: string };
  job?: { title?: string } | null;
}

interface HiringCandidateRow {
  candidate?: {
    name?: string;
    currentPosition?: string | null;
    currentCompany?: string | null;
    stageRecords?: Array<{ stage: string }>;
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
  return list.map((i) => i.name || '').filter(Boolean).join('、') || '—';
}

const activeTab = ref('overview');
const overviewLoading = ref(false);
const overview = reactive<HiringOverview>({});
const approvalsLoading = ref(false);
const approvals = ref<HiringOfferRow[]>([]);
const candidatesLoading = ref(false);
const candidates = ref<HiringCandidateRow[]>([]);
const interviewsLoading = ref(false);
const interviews = ref<HiringInterviewRow[]>([]);

const router = useRouter();

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

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

async function loadOverview() {
  overviewLoading.value = true;
  try {
    const res = await request.get('/hiring/overview') as ApiSuccess<HiringOverview>;
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
    const res = await request.get('/hiring/approvals') as ApiSuccess<HiringOfferRow[]>;
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
    const res = await request.get('/hiring/candidates') as ApiSuccess<HiringCandidateRow[]>;
    if (res.success) candidates.value = res.data;
  } catch {
    ElMessage.error('加载候选人失败');
  } finally {
    candidatesLoading.value = false;
  }
}

async function loadInterviews() {
  interviewsLoading.value = true;
  try {
    const res = await request.get('/hiring/interviews') as ApiSuccess<HiringInterviewRow[]>;
    if (res.success) interviews.value = res.data;
  } catch {
    ElMessage.error('加载面试失败');
  } finally {
    interviewsLoading.value = false;
  }
}

async function approveOffer(id: string) {
  try {
    const res = await request.post(`/hiring/approvals/${id}/approve`) as ApiSuccess<unknown>;
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
</style>
