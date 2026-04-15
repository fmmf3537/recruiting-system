<template>
  <div class="candidates-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">候选人管理</h2>
        <span class="page-subtitle">共 {{ pagination.total }} 位候选人</span>
      </div>
      <div class="action-buttons">
        <el-button @click="showResumeUpload = true">
          <el-icon><Upload /></el-icon>上传简历
        </el-button>
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>新增候选人
        </el-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="关键词">
          <el-input
            v-model="filterForm.keyword"
            placeholder="姓名/邮箱/手机号"
            clearable
            @keyup.enter="handleSearch"
            style="width: 200px"
          />
        </el-form-item>

        <el-form-item label="招聘阶段">
          <el-select
            v-model="filterForm.stage"
            placeholder="全部阶段"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="入库" value="入库" />
            <el-option label="初筛" value="初筛" />
            <el-option label="复试" value="复试" />
            <el-option label="终面" value="终面" />
            <el-option label="拟录用" value="拟录用" />
            <el-option label="Offer" value="Offer" />
            <el-option label="入职" value="入职" />
          </el-select>
        </el-form-item>

        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="进行中" value="in_progress" />
            <el-option label="已通过" value="passed" />
            <el-option label="已淘汰" value="rejected" />
          </el-select>
        </el-form-item>

        <el-form-item label="来源">
          <el-select
            v-model="filterForm.source"
            placeholder="全部来源"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="BOSS直聘" value="BOSS直聘" />
            <el-option label="猎聘" value="猎聘" />
            <el-option label="智联招聘" value="智联招聘" />
            <el-option label="前程无忧" value="前程无忧" />
            <el-option label="内推" value="内推" />
            <el-option label="官网投递" value="官网投递" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="table-card" shadow="never" v-loading="loading">
      <el-table
        :data="candidateList"
        stripe
        style="width: 100%"
        @row-click="handleRowClick"
        highlight-current-row
      >
        <el-table-column type="index" label="序号" width="70" align="center" />

        <el-table-column prop="name" label="候选人" min-width="150">
          <template #default="{ row }">
            <div class="candidate-info">
              <el-avatar :size="36" :icon="UserFilled" />
              <div class="candidate-detail">
                <div class="candidate-name">{{ row.name }}</div>
                <div class="candidate-contact">{{ row.phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="currentStage" label="当前阶段" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getStageType(row.currentStage)" effect="light" class="stage-tag">
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

        <el-table-column prop="candidateJobs" label="应聘职位" min-width="150">
          <template #default="{ row }">
            <div class="job-tags">
              <el-tag
                v-for="job in row.candidateJobs?.slice(0, 2)"
                :key="job.id"
                size="small"
                type="info"
                class="job-tag"
              >
                {{ job.job?.title || '未知职位' }}
              </el-tag>
              <span v-if="!row.candidateJobs?.length" class="no-job">-</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="source" label="来源" width="120" align="center" />

        <el-table-column prop="education" label="学历" width="100" align="center">
          <template #default="{ row }">
            {{ row.education || '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="入库时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click.stop="handleDetail(row)">
              详情
            </el-button>
            <el-button v-if="canAdvance(row)" type="success" link size="small" @click.stop="handleAdvance(row)">
              推进
            </el-button>
            <el-button v-if="row.stageStatus !== 'rejected'" type="danger" link size="small" @click.stop="handleReject(row)">
              淘汰
            </el-button>
            <el-button v-if="canDelete(row)" type="danger" link size="small" @click.stop="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 推进流程对话框 -->
    <el-dialog v-model="advanceDialogVisible" title="推进候选人流程" width="500px">
      <el-form ref="advanceFormRef" :model="advanceForm" :rules="advanceRules" label-width="100px">
        <el-form-item label="当前阶段">
          <el-tag>{{ currentCandidate?.currentStage }}</el-tag>
        </el-form-item>

        <el-form-item label="目标阶段" prop="stage">
          <el-select v-model="advanceForm.stage" placeholder="请选择目标阶段" style="width: 100%">
            <el-option v-for="stage in availableStages" :key="stage" :label="stage" :value="stage" />
          </el-select>
        </el-form-item>

        <el-form-item label="阶段结果" prop="status">
          <el-radio-group v-model="advanceForm.status">
            <el-radio-button label="in_progress">进行中</el-radio-button>
            <el-radio-button label="passed">通过</el-radio-button>
            <el-radio-button label="rejected">淘汰</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="淘汰原因" prop="rejectReason" v-if="advanceForm.status === 'rejected'">
          <el-input v-model="advanceForm.rejectReason" type="textarea" :rows="3" placeholder="请填写淘汰原因" />
        </el-form-item>

        <el-form-item label="备注" prop="note">
          <el-input v-model="advanceForm.note" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="advanceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAdvanceSubmit" :loading="advanceSubmitting">确认推进</el-button>
      </template>
    </el-dialog>

    <!-- 淘汰确认对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="淘汰候选人" width="500px">
      <p style="margin-bottom: 20px">确定要淘汰候选人 <strong>{{ currentCandidate?.name }}</strong> 吗？</p>
      <el-form ref="rejectFormRef" :model="rejectForm" :rules="rejectRules" label-width="100px">
        <el-form-item label="淘汰原因" prop="rejectReason">
          <el-input v-model="rejectForm.rejectReason" type="textarea" :rows="3" placeholder="请填写淘汰原因（必填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleRejectSubmit" :loading="rejectSubmitting">确认淘汰</el-button>
      </template>
    </el-dialog>

    <!-- 简历上传对话框 -->
    <ResumeUpload v-model="showResumeUpload" @confirm="handleResumeParsed" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search, UserFilled, Upload } from '@element-plus/icons-vue';
import {
  getCandidateList,
  advanceStage,
  deleteCandidate,
  type CandidateItem,
  type AdvanceStageParams,
  type ResumeParseResult,
} from '@/api/candidate';
import { useAuthStore } from '@/stores/auth';
import ResumeUpload from './ResumeUpload.vue';

const router = useRouter();
const authStore = useAuthStore();

// ============ 数据 ============
const loading = ref(false);
const candidateList = ref<CandidateItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });
const filterForm = reactive({ keyword: '', stage: '', status: '', source: '' });

// ============ 推进流程 ============
const advanceDialogVisible = ref(false);
const advanceSubmitting = ref(false);
const advanceFormRef = ref<FormInstance>();
const currentCandidate = ref<CandidateItem | null>(null);
const stageOrder = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'];

const availableStages = computed(() => {
  if (!currentCandidate.value) return [];
  const currentIndex = stageOrder.indexOf(currentCandidate.value.currentStage);
  // Admin 用户可以跳到任意阶段
  if (authStore.isAdmin) {
    return stageOrder;
  }
  const stages: string[] = [];
  stages.push(stageOrder[currentIndex]);
  const nextStage = stageOrder[currentIndex + 1];
  if (nextStage) stages.push(nextStage);
  return stages;
});

const advanceForm = reactive<AdvanceStageParams>({
  stage: '' as any,
  status: 'passed',
  rejectReason: '',
  note: '',
});

const advanceRules: FormRules = {
  stage: [{ required: true, message: '请选择目标阶段', trigger: 'change' }],
  status: [{ required: true, message: '请选择阶段结果', trigger: 'change' }],
  rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }],
};

// ============ 淘汰 ============
const rejectDialogVisible = ref(false);
const rejectSubmitting = ref(false);
const rejectFormRef = ref<FormInstance>();
const rejectForm = reactive({ rejectReason: '' });
const rejectRules: FormRules = { rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }] };

// ============ 简历上传 ============
const showResumeUpload = ref(false);

function handleResumeParsed(data: ResumeParseResult) {
  // 将解析结果存储到 sessionStorage，跳转到创建页面
  sessionStorage.setItem('parsedResume', JSON.stringify(data));
  router.push('/candidates/create');
}

// ============ 方法 ============
async function fetchCandidateList() {
  loading.value = true;
  try {
    const res = await getCandidateList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filterForm.keyword || undefined,
      stage: filterForm.stage || undefined,
      status: filterForm.status || undefined,
      source: filterForm.source || undefined,
    });
    if (res.success) {
      candidateList.value = res.data;
      pagination.total = res.pagination.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() { pagination.page = 1; fetchCandidateList(); }
function handleReset() {
  filterForm.keyword = '';
  filterForm.stage = '';
  filterForm.status = '';
  filterForm.source = '';
  handleSearch();
}
function handlePageChange(page: number) { pagination.page = page; fetchCandidateList(); }
function handleSizeChange(size: number) { pagination.pageSize = size; pagination.page = 1; fetchCandidateList(); }
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getStageType(stage: string): string {
  const map: Record<string, string> = { '入库': 'info', '初筛': '', '复试': 'warning', '终面': 'warning', '拟录用': 'success', 'Offer': 'success', '入职': 'danger' };
  return map[stage] || '';
}
function getStatusType(status: string): string {
  return { 'in_progress': 'warning', 'passed': 'success', 'rejected': 'danger' }[status] || 'info';
}
function getStatusText(status: string): string {
  return { 'in_progress': '进行中', 'passed': '已通过', 'rejected': '已淘汰' }[status] || status;
}
function canAdvance(row: CandidateItem): boolean {
  return row.stageStatus !== 'rejected' && row.currentStage !== '入职';
}
function canDelete(row: CandidateItem): boolean {
  const currentUser = authStore.userInfo;
  return currentUser?.id === row.createdById || currentUser?.role === 'admin';
}

async function handleDelete(row: CandidateItem) {
  try {
    await ElMessageBox.confirm(
      `确定要删除候选人「${row.name}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    );
    const res = await deleteCandidate(row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      fetchCandidateList();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

function handleAdd() { router.push('/candidates/create'); }
function handleRowClick(row: CandidateItem) { handleDetail(row); }
function handleDetail(row: CandidateItem) { router.push(`/candidates/${row.id}`); }

function handleAdvance(row: CandidateItem) {
  currentCandidate.value = row;
  advanceForm.stage = row.currentStage as any;
  advanceForm.status = 'passed';
  advanceForm.rejectReason = '';
  advanceForm.note = '';
  advanceDialogVisible.value = true;
}

async function handleAdvanceSubmit() {
  if (!currentCandidate.value) return;
  const valid = await advanceFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  advanceSubmitting.value = true;
  try {
    const res = await advanceStage(currentCandidate.value.id, { ...advanceForm });
    if (res.success) {
      ElMessage.success('阶段推进成功');
      advanceDialogVisible.value = false;
      fetchCandidateList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '推进失败');
  } finally {
    advanceSubmitting.value = false;
  }
}

function handleReject(row: CandidateItem) {
  currentCandidate.value = row;
  rejectForm.rejectReason = '';
  rejectDialogVisible.value = true;
}

async function handleRejectSubmit() {
  if (!currentCandidate.value) return;
  const valid = await rejectFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  rejectSubmitting.value = true;
  try {
    const res = await advanceStage(currentCandidate.value.id, {
      stage: currentCandidate.value.currentStage as any,
      status: 'rejected',
      rejectReason: rejectForm.rejectReason,
    });
    if (res.success) {
      ElMessage.success('已淘汰该候选人');
      rejectDialogVisible.value = false;
      fetchCandidateList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    rejectSubmitting.value = false;
  }
}

onMounted(() => { fetchCandidateList(); });
onActivated(() => { fetchCandidateList(); });
</script>

<style scoped lang="scss">
.candidates-page { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
  .title-section { .page-title { margin: 0; font-size: 24px; font-weight: 500; color: #303133; }
    .page-subtitle { margin-top: 8px; font-size: 14px; color: #909399; }
  }
}
.filter-card { margin-bottom: 20px;
  .filter-form { display: flex; flex-wrap: wrap; gap: 10px; :deep(.el-form-item) { margin-bottom: 0; } }
}
.table-card {
  .candidate-info { display: flex; align-items: center; gap: 12px;
    .candidate-detail { .candidate-name { font-weight: 500; color: #303133; margin-bottom: 4px; }
      .candidate-contact { font-size: 12px; color: #909399; }
    }
  }
  .stage-tag { min-width: 60px; text-align: center; }
  .job-tags { display: flex; flex-wrap: wrap; gap: 6px; .job-tag { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .no-job { color: #909399; } }
  .pagination-wrapper { display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ebeef5; }
}
</style>
