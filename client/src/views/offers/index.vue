<template>
  <div class="offers-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">Offer管理</h2>
        <span class="page-subtitle">共 {{ pagination.total }} 个 Offer</span>
      </div>
    </div>

    <!-- 筛选栏 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="候选人姓名">
          <el-input
            v-model="filterForm.keyword"
            placeholder="请输入候选人姓名"
            clearable
            @keyup.enter="handleSearch"
            style="width: 200px"
          />
        </el-form-item>

        <el-form-item label="Offer状态">
          <el-select
            v-model="filterForm.result"
            placeholder="全部状态"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="待确认" value="pending">
              <el-tag type="warning" size="small">待确认</el-tag>
            </el-option>
            <el-option label="已接受" value="accepted">
              <el-tag type="success" size="small">已接受</el-tag>
            </el-option>
            <el-option label="已拒绝" value="rejected">
              <el-tag type="danger" size="small">已拒绝</el-tag>
            </el-option>
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
        :data="offerList"
        stripe
        style="width: 100%"
        highlight-current-row
      >
        <el-table-column type="index" label="序号" width="70" align="center" />

        <el-table-column prop="candidate" label="候选人" min-width="150">
          <template #default="{ row }">
            <div class="candidate-info">
              <el-avatar :size="36" :icon="UserFilled" />
              <div class="candidate-detail">
                <div class="candidate-name">{{ row.candidate?.name }}</div>
                <div class="candidate-contact">{{ row.candidate?.phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="jobTitle" label="应聘职位" min-width="180">
          <template #default="{ row }">
            <div class="job-info">
              <span class="job-title">{{ row.candidate?.candidateJobs?.[0]?.job?.title || '-' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="salary" label="薪资" width="150" align="center">
          <template #default="{ row }">
            <span class="salary-text">{{ row.salary || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="offerDate" label="Offer日期" width="140" align="center">
          <template #default="{ row }">
            {{ formatDate(row.offerDate) }}
          </template>
        </el-table-column>

        <el-table-column prop="expectedJoinDate" label="预计入职" width="140" align="center">
          <template #default="{ row }">
            {{ row.expectedJoinDate ? formatDate(row.expectedJoinDate) : '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="result" label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getResultType(row.result)" effect="light" class="result-tag">
              {{ getResultText(row.result) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="joined" label="入职状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.joined" type="success" size="small">已入职</el-tag>
            <el-tag v-else-if="row.result === 'accepted'" type="info" size="small">待入职</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleDetail(row)">
              查看详情
            </el-button>
            <el-button 
              type="primary" 
              link 
              size="small" 
              @click="handleEdit(row)"
              :disabled="row.result === 'rejected'"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.result === 'accepted' && !row.joined"
              type="success"
              link
              size="small"
              @click="handleMarkJoined(row)"
            >
              标记入职
            </el-button>
            <el-button
              v-if="row.result === 'pending'"
              type="warning"
              link
              size="small"
              @click="handleUpdateResult(row, 'accepted')"
            >
              接受
            </el-button>
            <el-button
              v-if="row.result === 'pending'"
              type="danger"
              link
              size="small"
              @click="handleUpdateResult(row, 'rejected')"
            >
              拒绝
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

    <!-- 编辑 Offer 对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑 Offer" width="500px">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="100px">
        <el-form-item label="候选人">
          <span>{{ currentOffer?.candidate?.name }}</span>
        </el-form-item>
        <el-form-item label="薪资" prop="salary">
          <el-input v-model="editForm.salary" placeholder="如：30k" />
        </el-form-item>
        <el-form-item label="Offer日期" prop="offerDate">
          <el-date-picker v-model="editForm.offerDate" type="date" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="预计入职" prop="expectedJoinDate">
          <el-date-picker v-model="editForm.expectedJoinDate" type="date" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注" prop="note">
          <el-input v-model="editForm.note" type="textarea" :rows="3" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit" :loading="editSubmitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- 标记入职对话框 -->
    <el-dialog v-model="joinDialogVisible" title="标记入职" width="500px">
      <el-form ref="joinFormRef" :model="joinForm" :rules="joinRules" label-width="120px">
        <el-form-item label="候选人">
          <span>{{ currentOffer?.candidate?.name }}</span>
        </el-form-item>
        <el-form-item label="Offer薪资">
          <span>{{ currentOffer?.salary }}</span>
        </el-form-item>
        <el-form-item label="实际入职日期" prop="actualJoinDate">
          <el-date-picker 
            v-model="joinForm.actualJoinDate" 
            type="date" 
            placeholder="请选择实际入职日期" 
            style="width: 100%" 
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="joinDialogVisible = false">取消</el-button>
        <el-button type="success" @click="handleJoinSubmit" :loading="joinSubmitting">确认入职</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search, UserFilled } from '@element-plus/icons-vue';
import {
  getOfferList,
  updateOffer,
  updateOfferResult,
  markAsJoined,
  type OfferItem,
  type UpdateOfferParams,
  type OfferResult,
} from '@/api/offer';

const router = useRouter();

// ============ 数据 ============
const loading = ref(false);
const offerList = ref<OfferItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });
const filterForm = reactive({ keyword: '', result: '' as OfferResult | '' });

// ============ 编辑对话框 ============
const editDialogVisible = ref(false);
const editSubmitting = ref(false);
const editFormRef = ref<FormInstance>();
const currentOffer = ref<OfferItem | null>(null);

const editForm = reactive<UpdateOfferParams>({
  salary: '',
  offerDate: '',
  expectedJoinDate: '',
  note: '',
});

const editRules: FormRules = {
  salary: [{ required: true, message: '请输入薪资', trigger: 'blur' }],
  offerDate: [{ required: true, message: '请选择Offer日期', trigger: 'change' }],
};

// ============ 标记入职对话框 ============
const joinDialogVisible = ref(false);
const joinSubmitting = ref(false);
const joinFormRef = ref<FormInstance>();

const joinForm = reactive({
  actualJoinDate: '',
});

const joinRules: FormRules = {
  actualJoinDate: [{ required: true, message: '请选择实际入职日期', trigger: 'change' }],
};

// ============ 方法 ============
async function fetchOfferList() {
  loading.value = true;
  try {
    const res = await getOfferList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      result: filterForm.result || undefined,
    });
    if (res.success) {
      offerList.value = res.data;
      pagination.total = res.pagination.total;
    }
  } catch (error) {
    console.error('获取Offer列表失败:', error);
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchOfferList();
}

function handleReset() {
  filterForm.keyword = '';
  filterForm.result = '';
  handleSearch();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchOfferList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchOfferList();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function getResultType(result: OfferResult): string {
  const typeMap: Record<string, string> = {
    'pending': 'warning',
    'accepted': 'success',
    'rejected': 'danger',
  };
  return typeMap[result] || 'info';
}

function getResultText(result: OfferResult): string {
  const textMap: Record<string, string> = {
    'pending': '待确认',
    'accepted': '已接受',
    'rejected': '已拒绝',
  };
  return textMap[result] || result;
}

function handleDetail(row: OfferItem) {
  router.push(`/offers/${row.candidateId}`);
}

function handleEdit(row: OfferItem) {
  currentOffer.value = row;
  editForm.salary = row.salary;
  editForm.offerDate = row.offerDate;
  editForm.expectedJoinDate = row.expectedJoinDate || '';
  editForm.note = row.note || '';
  editDialogVisible.value = true;
}

async function handleEditSubmit() {
  if (!currentOffer.value) return;
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  editSubmitting.value = true;
  try {
    const res = await updateOffer(currentOffer.value.candidateId, { ...editForm });
    if (res.success) {
      ElMessage.success('Offer更新成功');
      editDialogVisible.value = false;
      fetchOfferList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败');
  } finally {
    editSubmitting.value = false;
  }
}

async function handleUpdateResult(row: OfferItem, result: OfferResult) {
  const actionText = result === 'accepted' ? '接受' : '拒绝';
  try {
    await ElMessageBox.confirm(
      `确定要${actionText}候选人 "${row.candidate?.name}" 的 Offer 吗？`,
      `确认${actionText}`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: result === 'accepted' ? 'success' : 'warning',
      }
    );

    const res = await updateOfferResult(row.candidateId, { result });
    if (res.success) {
      ElMessage.success(`Offer已${actionText}`);
      fetchOfferList();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '操作失败');
    }
  }
}

function handleMarkJoined(row: OfferItem) {
  currentOffer.value = row;
  joinForm.actualJoinDate = new Date().toISOString().split('T')[0];
  joinDialogVisible.value = true;
}

async function handleJoinSubmit() {
  if (!currentOffer.value) return;
  const valid = await joinFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  joinSubmitting.value = true;
  try {
    const res = await markAsJoined(currentOffer.value.candidateId, {
      actualJoinDate: joinForm.actualJoinDate,
    });
    if (res.success) {
      ElMessage.success('入职标记成功');
      joinDialogVisible.value = false;
      fetchOfferList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '标记失败');
  } finally {
    joinSubmitting.value = false;
  }
}

onMounted(() => {
  fetchOfferList();
});
</script>

<style scoped lang="scss">
.offers-page {
  padding: 20px;
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

.filter-card {
  margin-bottom: 20px;

  .filter-form {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;

    :deep(.el-form-item) {
      margin-bottom: 0;
    }
  }
}

.table-card {
  .candidate-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .candidate-detail {
      .candidate-name {
        font-weight: 500;
        color: #303133;
        margin-bottom: 4px;
      }

      .candidate-contact {
        font-size: 12px;
        color: #909399;
      }
    }
  }

  .job-info {
    .job-title {
      color: #606266;
    }
  }

  .salary-text {
    font-weight: 500;
    color: #f56c6c;
  }

  .result-tag {
    min-width: 70px;
    text-align: center;
  }

  .pagination-wrapper {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ebeef5;
  }
}
</style>
