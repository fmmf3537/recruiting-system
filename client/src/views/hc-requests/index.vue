<template>
  <div class="hc-requests-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">编制管理</h2>
        <span class="page-subtitle">共 {{ pagination.total }} 条申请</span>
      </div>
      <el-button type="primary" @click="router.push('/hc-requests/create')">
        <el-icon><Plus /></el-icon>新建申请
      </el-button>
    </div>

    <el-card class="filter-card" shadow="never">
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 140px" @change="handleSearch">
            <el-option label="草稿" value="draft" />
            <el-option label="审批中" value="submitted" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已完成" value="fulfilled" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filterForm.keyword" placeholder="岗位/部门" clearable @keyup.enter="handleSearch" style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never" v-loading="loading">
      <el-table :data="list" stripe highlight-current-row>
        <el-table-column prop="title" label="岗位名称" min-width="140" />
        <el-table-column prop="department" label="部门" width="120" />
        <el-table-column prop="level" label="职级" width="80" align="center" />
        <el-table-column label="需求/已招" width="100" align="center">
          <template #default="{ row }">{{ row.filledCount }}/{{ row.headcount }}</template>
        </el-table-column>
        <el-table-column prop="urgency" label="紧急程度" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="urgencyType(row.urgency)" size="small">{{ urgencyLabel(row.urgency) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="100">
          <template #default="{ row }">{{ row.requester?.name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="150">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'draft' || row.status === 'rejected'">
              <el-button type="primary" link size="small" @click="router.push('/hc-requests/' + row.id + '/edit')">编辑</el-button>
              <el-button v-if="row.status === 'draft'" type="success" link size="small" @click="handleSubmit(row)">提交</el-button>
              <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
            </template>
            <template v-else-if="row.status === 'submitted' && authStore.isAdmin">
              <el-button type="success" link size="small" @click="handleApprove(row)">通过</el-button>
              <el-button type="danger" link size="small" @click="handleReject(row)">驳回</el-button>
            </template>
            <template v-else-if="row.status === 'approved' && !row.createdJobId && authStore.isAdmin">
              <el-button type="primary" link size="small" @click="handleCreateJob(row)">创建职位</el-button>
            </template>
            <template v-else-if="row.status === 'fulfilled' || row.createdJobId">
              <el-button v-if="row.createdJobId" type="primary" link size="small" @click="router.push('/jobs/' + row.createdJobId)">查看职位</el-button>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && !list.length" description="暂无编制申请" />

      <div class="pagination-wrapper" v-if="pagination.totalPages > 1">
        <el-pagination
          v-model:current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          layout="prev, pager, next"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 审批对话框 -->
    <el-dialog v-model="approveDialogVisible" :title="approveDialogTitle" width="450px">
      <el-form>
        <el-form-item :label="approveAction === 'approve' ? '审批意见' : '驳回原因'" required>
          <el-input v-model="approveNote" type="textarea" :rows="3" :placeholder="approveAction === 'approve' ? '选填' : '必填'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialogVisible = false">取消</el-button>
        <el-button :type="approveAction === 'approve' ? 'success' : 'danger'" @click="handleApproveSubmit" :loading="approveSubmitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onActivated, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import {
  getHCRequests,
  submitHCRequest,
  approveHCRequest,
  rejectHCRequest,
  createJobFromHCRequest,
  deleteHCRequest,
  type HCRequestItem,
} from '@/api/hc-request';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const list = ref<HCRequestItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
const filterForm = reactive({ status: '', keyword: '' });

const approveDialogVisible = ref(false);
const approveAction = ref<'approve' | 'reject'>('approve');
const approveDialogTitle = ref('');
const approveNote = ref('');
const approveSubmitting = ref(false);
const currentHCId = ref('');

async function fetchList() {
  loading.value = true;
  try {
    const res = await getHCRequests({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filterForm.status || undefined,
      keyword: filterForm.keyword || undefined,
    });
    if (res.success) {
      list.value = res.data;
      Object.assign(pagination, res.pagination);
    }
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() { pagination.page = 1; fetchList(); }
function handleReset() { filterForm.status = ''; filterForm.keyword = ''; handleSearch(); }

async function handleSubmit(row: HCRequestItem) {
  try {
    await ElMessageBox.confirm('确认提交该申请？提交后将无法编辑。', '提交确认', { type: 'warning' });
    await submitHCRequest(row.id);
    ElMessage.success('已提交审批');
    fetchList();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '提交失败');
  }
}

function handleApprove(row: HCRequestItem) {
  approveAction.value = 'approve';
  approveDialogTitle.value = '审批通过';
  approveNote.value = '';
  currentHCId.value = row.id;
  approveDialogVisible.value = true;
}

function handleReject(row: HCRequestItem) {
  approveAction.value = 'reject';
  approveDialogTitle.value = '驳回申请';
  approveNote.value = '';
  currentHCId.value = row.id;
  approveDialogVisible.value = true;
}

async function handleApproveSubmit() {
  if (approveAction.value === 'reject' && !approveNote.value) {
    ElMessage.warning('驳回必须填写原因');
    return;
  }
  approveSubmitting.value = true;
  try {
    if (approveAction.value === 'approve') {
      await approveHCRequest(currentHCId.value, approveNote.value || undefined);
      ElMessage.success('审批通过');
    } else {
      await rejectHCRequest(currentHCId.value, approveNote.value);
      ElMessage.success('已驳回');
    }
    approveDialogVisible.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败');
  } finally {
    approveSubmitting.value = false;
  }
}

async function handleCreateJob(row: HCRequestItem) {
  try {
    await ElMessageBox.confirm('确认为该编制创建招聘职位？', '创建职位', { type: 'info' });
    await createJobFromHCRequest(row.id);
    ElMessage.success('职位创建成功');
    fetchList();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '创建失败');
  }
}

async function handleDelete(row: HCRequestItem) {
  try {
    await ElMessageBox.confirm('确定删除该申请？', '删除确认', { type: 'warning' });
    await deleteHCRequest(row.id);
    ElMessage.success('已删除');
    fetchList();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败');
  }
}

function urgencyType(v: string) {
  const map: Record<string, string> = { urgent: 'danger', normal: 'warning', low: 'info' };
  return map[v] || 'info';
}
function urgencyLabel(v: string) {
  const map: Record<string, string> = { urgent: '紧急', normal: '普通', low: '较低' };
  return map[v] || v;
}
function statusType(v: string) {
  const map: Record<string, string> = { draft: 'info', submitted: 'warning', approved: 'success', rejected: 'danger', fulfilled: '' };
  return map[v] || 'info';
}
function statusLabel(v: string) {
  const map: Record<string, string> = { draft: '草稿', submitted: '审批中', approved: '已通过', rejected: '已驳回', fulfilled: '已完成' };
  return map[v] || v;
}
function formatDate(s: string) {
  if (!s) return '-';
  return new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

onMounted(fetchList);
onActivated(fetchList);
</script>

<style scoped lang="scss">
.hc-requests-page { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
  .title-section { .page-title { margin: 0; font-size: 24px; font-weight: 500; }
    .page-subtitle { margin-top: 8px; font-size: 14px; color: #909399; }
  }
}
.filter-card { margin-bottom: 20px; }
.table-card { .pagination-wrapper { display: flex; justify-content: center; margin-top: 20px; } }
</style>
