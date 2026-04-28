<template>
  <div class="jobs-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">职位管理</h2>
        <span class="page-subtitle">共 {{ pagination.total }} 个职位</span>
      </div>
      <el-button type="primary" @click="handleCreate" v-if="authStore.isLoggedIn" :loading="createLoading">
        <el-icon><Plus /></el-icon>发布职位
      </el-button>
    </div>

    <!-- 筛选栏 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="关键词">
          <el-input
            v-model="filterForm.keyword"
            placeholder="职位名称"
            clearable
            @keyup.enter="handleSearch"
            style="width: 200px"
          />
        </el-form-item>

        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="开放" value="open">
              <el-tag type="success" size="small">开放</el-tag>
            </el-option>
            <el-option label="暂停" value="paused">
              <el-tag type="warning" size="small">暂停</el-tag>
            </el-option>
            <el-option label="已关闭" value="closed">
              <el-tag type="info" size="small">已关闭</el-tag>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="类型">
          <el-select
            v-model="filterForm.type"
            placeholder="全部类型"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option
              v-for="item in dictionaryStore.jobTypeOptions"
              :key="item.code"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="地域">
          <el-select
            v-model="filterForm.location"
            placeholder="全部地域"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option
              v-for="item in dictionaryStore.locationOptions"
              :key="item.code"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="searchLoading">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="handleReset" :loading="searchLoading">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="table-card" shadow="never" v-loading="loading">
      <el-table
        :data="jobList"
        stripe
        style="width: 100%"
        @sort-change="handleSortChange"
        highlight-current-row
      >
        <el-table-column type="index" label="序号" width="70" align="center" />

        <el-table-column prop="title" label="职位名称" min-width="180" sortable="custom">
          <template #default="{ row }">
            <div class="job-title">
              <el-link type="primary" @click="handleDetail(row)">{{ row.title }}</el-link>
              <el-tag size="small" :type="getTypeType(row.type)">{{ row.type }}</el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="departments" label="部门" min-width="150">
          <template #default="{ row }">
            <div class="dept-tags">
              <el-tag
                v-for="dept in row.departments?.slice(0, 2)"
                :key="dept"
                size="small"
                type="info"
                class="dept-tag"
              >
                {{ dept }}
              </el-tag>
              <el-tag v-if="row.departments?.length > 2" size="small" type="info">
                +{{ row.departments.length - 2 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="level" label="职级" width="100" align="center" />

        <el-table-column prop="location" label="地域" width="100" align="center" />

        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" effect="light">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="tags" label="标签" min-width="120">
          <template #default="{ row }">
            <div class="tag-list">
              <el-tag
                v-for="tag in row.tags?.slice(0, 3)"
                :key="tag.id"
                size="small"
                :color="tag.color"
                effect="light"
                class="job-tag-item"
              >
                {{ tag.name }}
              </el-tag>
              <span v-if="!row.tags?.length" class="no-tag">-</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="_count" label="候选人" width="100" align="center">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="goToCandidates(row)"
            >
              {{ row._count?.candidateJobs || 0 }}
            </el-button>
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="创建时间" width="160" sortable="custom">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="handleDetail(row)"
            >
              详情
            </el-button>
            <el-button
              type="primary"
              link
              size="small"
              @click="handleEdit(row)"
              :disabled="row.status === 'closed'"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.status !== 'closed'"
              type="warning"
              link
              size="small"
              @click="handleClose(row)"
              :loading="row.loading"
            >
              关闭
            </el-button>
            <el-button
              type="success"
              link
              size="small"
              @click="handleDuplicate(row)"
              :loading="row.duplicateLoading"
            >
              复制
            </el-button>
            <el-button
              v-if="authStore.isAdmin"
              type="danger"
              link
              size="small"
              @click="handleDelete(row)"
              :loading="row.deleteLoading"
            >
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useDictionaryStore } from '@/stores/dictionary';
import {
  getJobList,
  closeJob,
  duplicateJob,
  deleteJob,
  type JobItem,
  type JobListParams,
  type JobStatus,
  type JobType,
} from '@/api/job';

const router = useRouter();
const authStore = useAuthStore();
const dictionaryStore = useDictionaryStore();

// ============ 表格数据 ============
const loading = ref(false);
const createLoading = ref(false);
const searchLoading = ref(false);
const jobList = ref<(JobItem & { loading?: boolean; duplicateLoading?: boolean; deleteLoading?: boolean })[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

// ============ 筛选表单 ============
const filterForm = reactive<JobListParams>({
  keyword: '',
  status: undefined,
  type: undefined,
  location: undefined,
});

// ============ 方法 ============

// 获取职位列表
async function fetchJobList() {
  loading.value = true;
  try {
    const res = await getJobList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filterForm.keyword || undefined,
      status: filterForm.status as JobStatus,
      type: filterForm.type as JobType,
      location: filterForm.location,
    });
    if (res.success) {
      jobList.value = res.data.map(item => ({ ...item, loading: false, duplicateLoading: false, deleteLoading: false }));
      pagination.total = res.pagination.total;
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取职位列表失败');
  } finally {
    loading.value = false;
  }
}

// 搜索
async function handleSearch() {
  searchLoading.value = true;
  pagination.page = 1;
  await fetchJobList();
  searchLoading.value = false;
}

// 重置筛选
async function handleReset() {
  searchLoading.value = true;
  filterForm.keyword = '';
  filterForm.status = undefined;
  filterForm.type = undefined;
  filterForm.location = undefined;
  pagination.page = 1;
  await fetchJobList();
  searchLoading.value = false;
}

// 分页
function handlePageChange(page: number) {
  pagination.page = page;
  fetchJobList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchJobList();
}

// 排序
function handleSortChange({ prop, order }: { prop: string; order: string | null }) {
  console.log('排序:', prop, order);
}

// 格式化日期
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 获取状态类型
function getStatusType(status: JobStatus): string {
  const typeMap: Record<string, string> = {
    'open': 'success',
    'paused': 'warning',
    'closed': 'info',
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

// 创建职位
function handleCreate() {
  router.push('/jobs/create');
}

// 查看详情
function handleDetail(row: JobItem) {
  router.push(`/jobs/${row.id}`);
}

// 编辑职位
function handleEdit(row: JobItem) {
  router.push(`/jobs/${row.id}/edit`);
}

// 跳转到候选人列表（按职位筛选）
function goToCandidates(row: JobItem) {
  router.push({
    path: '/candidates',
    query: { jobId: row.id },
  });
}

// 关闭职位
async function handleClose(row: JobItem & { loading?: boolean }) {
  row.loading = true;
  const abortCtrl = new AbortController();
  try {
    await ElMessageBox.confirm(
      `确定要关闭职位 "${row.title}" 吗？关闭后无法继续投递。`,
      '确认关闭',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    console.log('[JobClose] sending request for', row.id);
    const res = await closeJob(row.id, { signal: abortCtrl.signal });
    console.log('[JobClose] received', res);
    if (res.success) {
      ElMessage.success('职位已关闭');
      fetchJobList();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('[JobClose] error', error);
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        ElMessage.warning('请求已取消');
      } else {
        ElMessage.error(error.message || '关闭失败');
      }
    }
  } finally {
    row.loading = false;
  }
}

// 复制职位
async function handleDuplicate(row: JobItem & { duplicateLoading?: boolean }) {
  row.duplicateLoading = true;
  try {
    const res = await duplicateJob(row.id);
    if (res.success) {
      ElMessage.success('职位复制成功，标题已自动追加"（副本）"');
      fetchJobList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '复制失败');
  } finally {
    row.duplicateLoading = false;
  }
}

// 删除职位
async function handleDelete(row: JobItem & { deleteLoading?: boolean }) {
  row.deleteLoading = true;
  const abortCtrl = new AbortController();
  try {
    const candidateCount = row._count?.candidateJobs || 0;
    let confirmMessage = `确定要删除职位 "${row.title}" 吗？删除后不可恢复。`;
    
    if (candidateCount > 0) {
      confirmMessage = `该职位有关联 ${candidateCount} 位候选人，删除后这些数据将保留但无法再关联到该职位。确定要删除吗？`;
    }
    
    await ElMessageBox.confirm(
      confirmMessage,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'danger',
      }
    );

    console.log('[JobDelete] sending request for', row.id);
    const res = await deleteJob(row.id, { signal: abortCtrl.signal });
    console.log('[JobDelete] received', res);
    if (res.success) {
      ElMessage.success('删除成功');
      fetchJobList();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('[JobDelete] error', error);
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        ElMessage.warning('请求已取消');
      } else {
        ElMessage.error(error.message || '删除失败');
      }
    }
  } finally {
    row.deleteLoading = false;
  }
}

// 初始化
onMounted(() => {
  dictionaryStore.fetchDictionaries('location');
  dictionaryStore.fetchDictionaries('job_type');
  fetchJobList();
});
onActivated(() => {
  dictionaryStore.fetchDictionaries('location');
  dictionaryStore.fetchDictionaries('job_type');
  fetchJobList();
});
</script>

<style scoped lang="scss">
.jobs-page {
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
  .job-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dept-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .dept-tag {
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;

    .job-tag-item {
      color: #fff;
      border: none;
    }

    .no-tag {
      color: #909399;
    }
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
