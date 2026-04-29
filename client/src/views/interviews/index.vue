<template>
  <div class="interviews-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">面试安排</h2>
        <span class="page-subtitle">管理和安排候选人面试日程</span>
      </div>
      <div class="header-actions">
        <el-radio-group v-model="viewMode" size="large">
          <el-radio-button label="list">列表视图</el-radio-button>
          <el-radio-button label="calendar">日历视图</el-radio-button>
        </el-radio-group>
        <el-button type="primary" @click="handleSchedule">
          <el-icon><Plus /></el-icon>安排面试
        </el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon blue"><el-icon :size="32"><Calendar /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.scheduled }}</div>
              <div class="stat-title">待进行</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon orange"><el-icon :size="32"><Clock /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.today }}</div>
              <div class="stat-title">今日面试</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon green"><el-icon :size="32"><CircleCheck /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.completed }}</div>
              <div class="stat-title">已完成</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon purple"><el-icon :size="32"><Warning /></el-icon></div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.cancelled }}</div>
              <div class="stat-title">已取消</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 列表视图 -->
    <template v-if="viewMode === 'list'">
      <el-card class="filter-card" shadow="never">
        <el-form :model="filterForm" inline class="filter-form">
          <el-form-item label="日期筛选">
            <el-date-picker
              v-model="filterForm.dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              @change="handleDateChange"
            />
          </el-form-item>
          <el-form-item label="面试轮次">
            <el-select v-model="filterForm.round" placeholder="全部轮次" clearable style="width: 140px">
              <el-option label="初试" value="初试" />
              <el-option label="复试" value="复试" />
              <el-option label="终面" value="终面" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="filterForm.status" placeholder="全部状态" clearable style="width: 140px">
              <el-option label="待进行" value="scheduled" />
              <el-option label="已完成" value="completed" />
              <el-option label="已取消" value="cancelled" />
              <el-option label="未到" value="no_show" />
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

      <el-card class="table-card" shadow="never" v-loading="loading">
        <el-table :data="interviewList" stripe style="width: 100%">
          <el-table-column type="index" label="序号" width="70" align="center" />
          <el-table-column prop="candidateName" label="候选人" min-width="140">
            <template #default="{ row }">
              <div class="candidate-info">
                <el-avatar :size="36" :icon="UserFilled" />
                <div class="candidate-detail">
                  <div class="candidate-name">{{ row.candidateName }}</div>
                  <div class="candidate-position">{{ row.jobTitle || '未分配职位' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="round" label="轮次" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="getRoundType(row.round)" effect="light">{{ row.round }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="方式" width="80" align="center" />
          <el-table-column label="面试官" min-width="140">
            <template #default="{ row }">
              <div class="interviewers">
                <el-tag v-for="(iv, idx) in row.interviewers" :key="idx" size="small" style="margin: 1px 2px;">
                  {{ iv.name }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="scheduledAt" label="面试时间" width="170">
            <template #default="{ row }">
              <div class="time-cell">
                <el-icon><Clock /></el-icon>
                <span>{{ formatDateTime(row.scheduledAt) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="duration" label="时长" width="80" align="center">
            <template #default="{ row }">{{ row.duration }}分钟</template>
          </el-table-column>
          <el-table-column prop="location" label="地点/链接" min-width="150" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'scheduled'"
                type="success" link size="small"
                @click="handleComplete(row)"
              >完成</el-button>
              <el-button
                v-if="row.status === 'scheduled'"
                type="warning" link size="small"
                @click="handleCancel(row)"
              >取消</el-button>
              <el-button type="primary" link size="small" @click="handleViewDetail(row)">
                详情
              </el-button>
              <el-button type="primary" link size="small" @click="goToCandidate(row)">
                候选人
              </el-button>
            </template>
          </el-table-column>
        </el-table>

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
    </template>

    <!-- 日历视图 -->
    <template v-else>
      <el-card shadow="never" class="calendar-card">
        <el-calendar v-model="calendarDate">
          <template #date-cell="{ data }">
            <div class="calendar-cell" :class="{ 'has-interview': hasInterview(data.day) }">
              <div class="date-number">{{ new Date(data.day).getDate() }}</div>
              <div v-if="hasInterview(data.day)" class="interview-dots">
                <el-tooltip
                  v-for="item in getDayInterviews(data.day)"
                  :key="item.id"
                  :content="`${item.candidateName} - ${item.round} (${getStatusText(item.status)})`"
                  placement="top"
                >
                  <div class="interview-dot" :class="item.status" @click="handleViewDetail(item)"></div>
                </el-tooltip>
              </div>
            </div>
          </template>
        </el-calendar>

        <!-- 当天面试列表 -->
        <div v-if="selectedDayInterviews.length" class="day-interviews">
          <h4>{{ formatDate(selectedDate) }} 的面试安排 ({{ selectedDayInterviews.length }}场)</h4>
          <el-timeline>
            <el-timeline-item
              v-for="item in selectedDayInterviews"
              :key="item.id"
              :type="item.status === 'scheduled' ? 'primary' : item.status === 'completed' ? 'success' : 'danger'"
              :timestamp="formatTime(item.scheduledAt)"
            >
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="candidate-name">{{ item.candidateName }}</span>
                  <div>
                    <el-tag size="small" style="margin-right: 4px;">{{ item.round }}</el-tag>
                    <el-tag size="small" :type="getStatusType(item.status)">{{ getStatusText(item.status) }}</el-tag>
                  </div>
                </div>
                <div class="timeline-info">
                  <span>
                    面试官：{{ item.interviewers?.map((i: any) => i.name).join('、') || '—' }}
                  </span>
                  <span>职位：{{ item.jobTitle || '—' }}</span>
                  <span v-if="item.location">地点：{{ item.location }}</span>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-card>
    </template>

    <!-- 安排面试对话框 -->
    <el-dialog
      v-model="scheduleDialogVisible"
      :title="scheduleEditId ? '编辑面试安排' : '安排面试'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="scheduleFormRef" :model="scheduleForm" :rules="scheduleRules" label-width="100px">
        <el-form-item label="候选人" prop="candidateId">
          <el-select
            v-model="scheduleForm.candidateId"
            filterable
            remote
            reserve-keyword
            placeholder="搜索候选人姓名/手机号"
            :remote-method="searchCandidates"
            :loading="candidateSearching"
            style="width: 100%"
            :disabled="!!scheduleEditId"
          >
            <el-option
              v-for="c in candidateOptions"
              :key="c.id"
              :label="`${c.name} — ${c.phone}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="关联职位" prop="jobId">
          <el-select v-model="scheduleForm.jobId" placeholder="选择职位（可选）" clearable style="width: 100%">
            <el-option v-for="j in jobOptions" :key="j.id" :label="j.title" :value="j.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试轮次" prop="round">
          <el-select v-model="scheduleForm.round" style="width: 100%">
            <el-option label="初试" value="初试" />
            <el-option label="复试" value="复试" />
            <el-option label="终面" value="终面" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试方式" prop="type">
          <el-select v-model="scheduleForm.type" style="width: 100%">
            <el-option label="电话" value="电话" />
            <el-option label="视频" value="视频" />
            <el-option label="现场" value="现场" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试官" prop="interviewers">
          <el-select
            v-model="scheduleForm.interviewerIds"
            multiple filterable placeholder="选择面试官"
            style="width: 100%"
          >
            <el-option v-for="u in userOptions" :key="u.id" :label="u.name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试时间" prop="scheduledAt">
          <el-date-picker
            v-model="scheduleForm.scheduledAt"
            type="datetime"
            placeholder="选择日期时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="面试时长" prop="duration">
          <el-select v-model="scheduleForm.duration" style="width: 100%">
            <el-option label="30分钟" :value="30" />
            <el-option label="45分钟" :value="45" />
            <el-option label="60分钟" :value="60" />
            <el-option label="90分钟" :value="90" />
            <el-option label="120分钟" :value="120" />
          </el-select>
        </el-form-item>
        <el-form-item label="面试地点" prop="location">
          <el-input v-model="scheduleForm.location" placeholder="会议室/视频链接（可选）" />
        </el-form-item>
        <el-form-item label="备注" prop="notes">
          <el-input v-model="scheduleForm.notes" type="textarea" :rows="3" placeholder="面试准备事项等（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scheduleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleScheduleSubmit" :loading="scheduleSubmitting">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  Calendar, Clock, CircleCheck, TrendCharts, Search, UserFilled,
  Plus, Warning,
} from '@element-plus/icons-vue';
import {
  getInterviews, createInterview, updateInterview, cancelInterview, completeInterview,
  type InterviewItem, type InterviewListQuery, type InterviewParams,
} from '@/api/interview';
import { getCandidateList } from '@/api/candidate';
import { getUserList } from '@/api/user';
import { getJobList } from '@/api/job';

const router = useRouter();

// ============ 视图和数据 ============
const viewMode = ref<'list' | 'calendar'>('list');
const loading = ref(false);
const calendarDate = ref(new Date());

const stats = reactive({ scheduled: 0, today: 0, completed: 0, cancelled: 0 });

const filterForm = reactive({
  dateRange: [] as string[],
  round: '',
  status: '',
});

const pagination = reactive({ page: 1, pageSize: 10, total: 0 });
const interviewList = ref<InterviewItem[]>([]);

// ============ 日历相关 ============
const selectedDate = computed(() => calendarDate.value);

const selectedDayInterviews = computed(() => {
  const dateStr = formatDateKey(selectedDate.value);
  return interviewList.value.filter((item) =>
    formatDateKey(new Date(item.scheduledAt)) === dateStr
  );
});

function hasInterview(day: string): boolean {
  return interviewList.value.some((item) =>
    formatDateKey(new Date(item.scheduledAt)) === day
  );
}

function getDayInterviews(day: string): InterviewItem[] {
  return interviewList.value.filter((item) =>
    formatDateKey(new Date(item.scheduledAt)) === day
  );
}

function formatDateKey(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============ 安排面试对话框 ============
const scheduleDialogVisible = ref(false);
const scheduleSubmitting = ref(false);
const scheduleEditId = ref<string | null>(null);
const scheduleFormRef = ref<FormInstance>();
const candidateSearching = ref(false);

const scheduleForm = reactive({
  candidateId: '',
  jobId: '',
  round: '初试' as string,
  type: '现场' as string,
  interviewerIds: [] as string[],
  scheduledAt: '',
  duration: 60,
  location: '',
  notes: '',
});

const scheduleRules: FormRules = {
  candidateId: [{ required: true, message: '请选择候选人', trigger: 'change' }],
  round: [{ required: true, message: '请选择面试轮次', trigger: 'change' }],
  type: [{ required: true, message: '请选择面试方式', trigger: 'change' }],
  interviewerIds: [{ required: true, message: '请至少选择一位面试官', trigger: 'change' }],
  scheduledAt: [{ required: true, message: '请选择面试时间', trigger: 'change' }],
};

const candidateOptions = ref<Array<{ id: string; name: string; phone: string }>>([]);
const userOptions = ref<Array<{ id: string; name: string }>>([]);
const jobOptions = ref<Array<{ id: string; title: string }>>([]);

// ============ 方法 ============
async function fetchInterviews() {
  loading.value = true;
  try {
    const params: InterviewListQuery = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
    if (filterForm.round) params.round = filterForm.round;
    if (filterForm.status) params.status = filterForm.status;
    if (filterForm.dateRange && filterForm.dateRange.length === 2) {
      params.startDate = filterForm.dateRange[0];
      params.endDate = filterForm.dateRange[1];
    }

    const res = await getInterviews(params) as any;
    if (res.success) {
      interviewList.value = res.data || [];
      pagination.total = res.pagination?.total || 0;
      updateStats();
    }
  } catch (error) {
    console.error('获取面试列表失败:', error);
  } finally {
    loading.value = false;
  }
}

function updateStats() {
  const today = formatDateKey(new Date());
  const all = interviewList.value;
  stats.scheduled = all.filter((i) => i.status === 'scheduled').length;
  stats.today = all.filter((i) => i.status === 'scheduled' && formatDateKey(new Date(i.scheduledAt)) === today).length;
  stats.completed = all.filter((i) => i.status === 'completed').length;
  stats.cancelled = all.filter((i) => i.status === 'cancelled' || i.status === 'no_show').length;
}

async function searchCandidates(query: string) {
  if (!query) return;
  candidateSearching.value = true;
  try {
    const res = await getCandidateList({ keyword: query, pageSize: 20 }) as any;
    if (res.success) {
      candidateOptions.value = res.data || [];
    }
  } catch (error) {
    console.error('搜索候选人失败:', error);
  } finally {
    candidateSearching.value = false;
  }
}

async function loadUsers() {
  try {
    const res = await getUserList({ pageSize: 100 }) as any;
    if (res.success) {
      userOptions.value = (res.data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
      }));
    }
  } catch { /* ignore */ }
}

async function loadJobs() {
  try {
    const res = await getJobList({ pageSize: 100 }) as any;
    if (res.success) {
      jobOptions.value = (res.data || []).map((j: any) => ({
        id: j.id,
        title: j.title,
      }));
    }
  } catch { /* ignore */ }
}

function handleSearch() {
  pagination.page = 1;
  fetchInterviews();
}

function handleReset() {
  filterForm.dateRange = [];
  filterForm.round = '';
  filterForm.status = '';
  pagination.page = 1;
  fetchInterviews();
}

function handleDateChange() {
  handleSearch();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchInterviews();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchInterviews();
}

function handleSchedule() {
  scheduleEditId.value = null;
  scheduleForm.candidateId = '';
  scheduleForm.jobId = '';
  scheduleForm.round = '初试';
  scheduleForm.type = '现场';
  scheduleForm.interviewerIds = [];
  scheduleForm.scheduledAt = '';
  scheduleForm.duration = 60;
  scheduleForm.location = '';
  scheduleForm.notes = '';
  scheduleDialogVisible.value = true;
  loadUsers();
  loadJobs();
}

async function handleScheduleSubmit() {
  const valid = await scheduleFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  scheduleSubmitting.value = true;
  try {
    const data: InterviewParams = {
      candidateId: scheduleForm.candidateId,
      jobId: scheduleForm.jobId || undefined,
      round: scheduleForm.round,
      type: scheduleForm.type,
      interviewers: scheduleForm.interviewerIds.map((id) => {
        const user = userOptions.value.find((u) => u.id === id);
        return { id, name: user?.name || '' };
      }),
      scheduledAt: scheduleForm.scheduledAt,
      duration: scheduleForm.duration,
      location: scheduleForm.location || undefined,
      notes: scheduleForm.notes || undefined,
    };

    if (scheduleEditId.value) {
      await updateInterview(scheduleEditId.value, data);
      ElMessage.success('面试安排已更新');
    } else {
      await createInterview(data);
      ElMessage.success('面试安排创建成功');
    }
    scheduleDialogVisible.value = false;
    fetchInterviews();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || error.message || '操作失败');
  } finally {
    scheduleSubmitting.value = false;
  }
}

async function handleComplete(row: InterviewItem) {
  try {
    await ElMessageBox.confirm(
      `确认将 ${row.candidateName} 的面试标记为已完成？完成后请及时录入面试反馈。`,
      '确认完成',
      { type: 'info' }
    );
    await completeInterview(row.id);
    ElMessage.success('面试已标记为完成');
    fetchInterviews();
  } catch { /* cancelled */ }
}

async function handleCancel(row: InterviewItem) {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入取消原因', '取消面试', {
      type: 'warning',
      inputPlaceholder: '取消原因（可选）',
      inputType: 'text',
    }) as any;

    await cancelInterview(row.id, reason || undefined);
    ElMessage.success('面试已取消');
    fetchInterviews();
  } catch { /* cancelled */ }
}

function handleViewDetail(row: InterviewItem) {
  router.push(`/candidates/${row.candidateId}`);
}

function goToCandidate(row: InterviewItem) {
  router.push(`/candidates/${row.candidateId}`);
}

// ============ 格式化 ============
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getRoundType(round: string): string {
  return { '初试': '', '复试': 'warning', '终面': 'danger' }[round] || '';
}

function getStatusType(status: string): string {
  return { 'scheduled': 'primary', 'completed': 'success', 'cancelled': 'info', 'no_show': 'danger' }[status] || 'info';
}

function getStatusText(status: string): string {
  return { 'scheduled': '待进行', 'completed': '已完成', 'cancelled': '已取消', 'no_show': '未到' }[status] || status;
}

onMounted(() => {
  fetchInterviews();
});
onActivated(() => {
  fetchInterviews();
});
</script>

<style scoped lang="scss">
.interviews-page {
  padding: 20px;

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

    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
  }

  .stats-row {
    margin-bottom: 20px;

    .stat-card {
      cursor: pointer;
      transition: all 0.3s;
      &:hover { transform: translateY(-4px); }

      .stat-content {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .stat-icon {
        width: 60px;
        height: 60px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;

        &.blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        &.orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
        &.green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
        &.purple { background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%); }
      }

      .stat-value {
        font-size: 28px;
        font-weight: 600;
        color: #303133;
      }
      .stat-title {
        font-size: 14px;
        color: #909399;
        margin-top: 4px;
      }
    }
  }

  .filter-card {
    margin-bottom: 20px;
    .filter-form {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      :deep(.el-form-item) { margin-bottom: 0; }
    }
  }

  .table-card {
    .candidate-info {
      display: flex;
      align-items: center;
      gap: 12px;
      .candidate-detail {
        .candidate-name { font-weight: 500; color: #303133; margin-bottom: 4px; }
        .candidate-position { font-size: 12px; color: #909399; }
      }
    }
    .time-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #606266;
    }
    .interviewers {
      display: flex;
      flex-wrap: wrap;
    }
    .pagination-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ebeef5;
    }
  }

  .calendar-card {
    .calendar-cell {
      height: 100%;
      padding: 4px;
      &.has-interview { background-color: #f0f9eb; }
      .date-number { font-size: 14px; margin-bottom: 4px; }
      .interview-dots {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        .interview-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          cursor: pointer;
          &.scheduled { background-color: #409eff; }
          &.completed { background-color: #67c23a; }
          &.cancelled { background-color: #c0c4cc; }
          &.no_show { background-color: #f56c6c; }
        }
      }
    }

    .day-interviews {
      margin-top: 20px;
      padding: 20px;
      background-color: #f5f7fa;
      border-radius: 8px;
      h4 { margin: 0 0 16px; font-size: 16px; color: #303133; }
      .timeline-content {
        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          .candidate-name { font-weight: 500; }
        }
        .timeline-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
          color: #909399;
        }
      }
    }
  }
}
</style>
