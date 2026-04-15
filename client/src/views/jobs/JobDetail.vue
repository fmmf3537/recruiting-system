<template>
  <div class="job-detail-page">
    <!-- 返回按钮 -->
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回列表
      </el-button>
    </div>

    <!-- 职位信息卡片 -->
    <el-card class="info-card" v-loading="loading">
      <template #header v-if="jobInfo">
        <div class="header-content">
          <div class="title-section">
            <h1 class="job-title">{{ jobInfo.title }}</h1>
            <div class="job-tags">
              <el-tag :type="getStatusType(jobInfo.status)" size="large" effect="dark">
                {{ getStatusText(jobInfo.status) }}
              </el-tag>
              <el-tag :type="getTypeType(jobInfo.type)" size="large">
                {{ jobInfo.type }}
              </el-tag>
              <el-tag type="info" size="large">
                <el-icon><Location /></el-icon>{{ jobInfo.location }}
              </el-tag>
              <el-tag type="info" size="large">{{ jobInfo.level }}</el-tag>
            </div>
          </div>
          <div class="action-buttons">
            <el-button
              type="primary"
              @click="handleEdit"
              :disabled="jobInfo.status === 'closed'"
            >
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button @click="handleDuplicate">
              <el-icon><CopyDocument /></el-icon>复制
            </el-button>
            <el-button
              v-if="jobInfo.status !== 'closed'"
              type="danger"
              plain
              @click="handleClose"
            >
              <el-icon><CircleClose /></el-icon>关闭
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="jobInfo" class="job-content">
        <!-- 基本信息 -->
        <div class="info-section">
          <h3 class="section-title">基本信息</h3>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="所属部门">
              <el-tag
                v-for="dept in jobInfo.departments"
                :key="dept"
                size="small"
                type="info"
                style="margin-right: 8px"
              >
                {{ dept }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="技能要求">
              <el-tag
                v-for="skill in jobInfo.skills"
                :key="skill"
                size="small"
                style="margin-right: 8px; margin-bottom: 4px"
              >
                {{ skill }}
              </el-tag>
              <span v-if="!jobInfo.skills?.length">-</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ formatDate(jobInfo.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="创建人">
              {{ jobInfo.createdBy?.name }}
            </el-descriptions-item>
            <el-descriptions-item label="更新时间">
              {{ formatDate(jobInfo.updatedAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 候选人统计 -->
        <div class="stats-section">
          <h3 class="section-title">招聘进展</h3>
          <div class="stats-cards">
            <div class="stat-item">
              <div class="stat-value total">{{ candidateStats.total }}</div>
              <div class="stat-label">总候选人</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ candidateStats.screening }}</div>
              <div class="stat-label">初筛</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ candidateStats.interview }}</div>
              <div class="stat-label">面试中</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ candidateStats.offer }}</div>
              <div class="stat-label">Offer</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ candidateStats.hired }}</div>
              <div class="stat-label">已入职</div>
            </div>
          </div>
        </div>

        <!-- 职位描述 -->
        <div class="description-section">
          <h3 class="section-title">职位描述</h3>
          <div class="rich-text" v-html="jobInfo.description"></div>
        </div>

        <!-- 任职要求 -->
        <div class="requirements-section">
          <h3 class="section-title">任职要求</h3>
          <div class="rich-text" v-html="jobInfo.requirements"></div>
        </div>
      </div>
    </el-card>

    <el-empty v-if="notFound" description="职位不存在或已被删除">
      <el-button type="primary" @click="goToList">返回列表</el-button>
    </el-empty>

    <!-- 关联候选人列表 -->
    <el-card class="candidates-card" v-loading="candidatesLoading">
      <template #header>
        <div class="card-header">
          <span>关联候选人</span>
          <el-button type="primary" link @click="goToCandidates">
            查看全部
            <el-icon class="el-icon--right"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </template>

      <el-table
        v-if="candidateList.length > 0"
        :data="candidateList"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="name" label="姓名" min-width="120">
          <template #default="{ row }">
            <div class="candidate-name">
              <el-avatar :size="28" :icon="UserFilled" />
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="currentStage" label="当前阶段" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getStageType(row.currentStage)" size="small">
              {{ row.currentStage }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="stageStatus" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.stageStatus)" size="small">
              {{ getStatusText(row.stageStatus) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="education" label="学历" width="100" align="center" />

        <el-table-column prop="workYears" label="经验" width="80" align="center">
          <template #default="{ row }">
            {{ row.workYears ? row.workYears + '年' : '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="投递时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="goToCandidateDetail(row)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无候选人投递" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft,
  Edit,
  CopyDocument,
  CircleClose,
  Location,
  ArrowRight,
  UserFilled,
} from '@element-plus/icons-vue';
import {
  getJobById,
  closeJob,
  duplicateJob,
  type JobDetail,
  type JobStatus,
  type JobType,
} from '@/api/job';
import { getCandidateList, type CandidateItem } from '@/api/candidate';

const route = useRoute();
const router = useRouter();
const jobId = route.params.id as string;

// 加载状态
const loading = ref(false);
const candidatesLoading = ref(false);

// 职位信息
const jobInfo = ref<JobDetail | null>(null);
const notFound = ref(false);

// 候选人列表
const candidateList = ref<CandidateItem[]>([]);

// 候选人统计
const candidateStats = reactive({
  total: 0,
  screening: 0,
  interview: 0,
  offer: 0,
  hired: 0,
});

// 获取职位详情
async function fetchJobDetail() {
  loading.value = true;
  notFound.value = false;
  try {
    const res = await getJobById(jobId);
    if (res.success) {
      jobInfo.value = res.data;
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    if (errorMsg.includes('不存在') || errorMsg.includes('not exist')) {
      notFound.value = true;
    } else {
      console.error('获取职位详情失败:', error);
      ElMessage.error('获取职位详情失败');
    }
  } finally {
    loading.value = false;
  }
}

// 获取关联候选人
async function fetchCandidates() {
  candidatesLoading.value = true;
  try {
    const res = await getCandidateList({
      page: 1,
      pageSize: 10,
      jobId: jobId,
    });
    if (res.success) {
      candidateList.value = res.data;
      candidateStats.total = res.pagination.total;

      // 统计各阶段人数
      candidateStats.screening = res.data.filter(
        (c) => c.currentStage === '初筛' || c.currentStage === '入库'
      ).length;
      candidateStats.interview = res.data.filter(
        (c) => c.currentStage === '复试' || c.currentStage === '终面'
      ).length;
      candidateStats.offer = res.data.filter((c) => c.currentStage === 'Offer').length;
      candidateStats.hired = res.data.filter((c) => c.currentStage === '入职').length;
    }
  } catch (error) {
    console.error('获取候选人列表失败:', error);
  } finally {
    candidatesLoading.value = false;
  }
}

// 格式化日期
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 获取状态类型
function getStatusType(status: JobStatus | string): string {
  const typeMap: Record<string, string> = {
    'open': 'success',
    'paused': 'warning',
    'closed': 'info',
    'in_progress': 'warning',
    'passed': 'success',
    'rejected': 'danger',
  };
  return typeMap[status] || 'info';
}

// 获取状态文本
function getStatusText(status: JobStatus): string {
  const textMap: Record<string, string> = {
    'open': '开放',
    'paused': '暂停',
    'closed': '已关闭',
  };
  return textMap[status] || status;
}

// 获取类型类型
function getTypeType(type: JobType): string {
  const typeMap: Record<string, string> = {
    '社招': 'primary',
    '校招': 'success',
    '实习生': 'warning',
  };
  return typeMap[type] || '';
}

// 获取阶段类型
function getStageType(stage: string): string {
  const typeMap: Record<string, string> = {
    '入库': 'info',
    '初筛': '',
    '复试': 'warning',
    '终面': 'warning',
    '拟录用': 'success',
    'Offer': 'success',
    '入职': 'danger',
  };
  return typeMap[stage] || '';
}

// 编辑职位
function handleEdit() {
  router.push(`/jobs/${jobId}/edit`);
}

function goToList() {
  router.push('/jobs');
}

// 复制职位
async function handleDuplicate() {
  try {
    const res = await duplicateJob(jobId);
    if (res.success) {
      ElMessage.success('职位复制成功');
      router.push('/jobs');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '复制失败');
  }
}

// 关闭职位
async function handleClose() {
  if (!jobInfo.value) return;

  try {
    await ElMessageBox.confirm(
      `确定要关闭职位 "${jobInfo.value.title}" 吗？`,
      '确认关闭',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    const res = await closeJob(jobId);
    if (res.success) {
      ElMessage.success('职位已关闭');
      fetchJobDetail();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '关闭失败');
    }
  }
}

// 跳转到候选人列表
function goToCandidates() {
  router.push({
    path: '/candidates',
    query: { jobId: jobId },
  });
}

// 跳转到候选人详情
function goToCandidateDetail(row: CandidateItem) {
  router.push(`/candidates/${row.id}`);
}

// 初始化
onMounted(() => {
  fetchJobDetail();
  fetchCandidates();
});

onActivated(() => {
  fetchJobDetail();
  fetchCandidates();
});
</script>

<style scoped lang="scss">
.job-detail-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.back-nav {
  margin-bottom: 20px;
}

.info-card {
  margin-bottom: 20px;

  :deep(.el-card__header) {
    background-color: #f5f7fa;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    .title-section {
      .job-title {
        margin: 0 0 12px;
        font-size: 24px;
        font-weight: 600;
        color: #303133;
      }

      .job-tags {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
    }

    .action-buttons {
      display: flex;
      gap: 10px;
    }
  }
}

.job-content {
  .section-title {
    font-size: 16px;
    font-weight: 500;
    color: #303133;
    margin: 0 0 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #ebeef5;
  }

  .info-section,
  .stats-section,
  .description-section,
  .requirements-section {
    margin-bottom: 30px;
  }

  .stats-section {
    .stats-cards {
      display: flex;
      gap: 20px;

      .stat-item {
        flex: 1;
        text-align: center;
        padding: 20px;
        background-color: #f5f7fa;
        border-radius: 8px;

        .stat-value {
          font-size: 32px;
          font-weight: 600;
          color: #409eff;
          margin-bottom: 8px;

          &.total {
            color: #303133;
          }
        }

        .stat-label {
          font-size: 14px;
          color: #606266;
        }
      }
    }
  }

  .rich-text {
    line-height: 1.8;
    color: #606266;
    word-break: break-word;
    overflow-wrap: break-word;

    :deep(p) {
      margin: 0 0 12px;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    :deep(span) {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    :deep(ul), :deep(ol) {
      padding-left: 20px;
      margin: 0 0 12px;
    }

    :deep(li) {
      margin-bottom: 8px;
    }
  }
}

.candidates-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
  }

  .candidate-name {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
