<template>
  <div class="interviews-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">面试安排</h2>
        <span class="page-subtitle">管理即将进行的面试日程</span>
      </div>
      <el-radio-group v-model="viewMode" size="large">
        <el-radio-button label="list">列表视图</el-radio-button>
        <el-radio-button label="calendar">日历视图</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon blue">
              <el-icon :size="32"><Calendar /></el-icon>
            </div>
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
            <div class="stat-icon orange">
              <el-icon :size="32"><Clock /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.pending }}</div>
              <div class="stat-title">待安排</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon green">
              <el-icon :size="32"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.completed }}</div>
              <div class="stat-title">本周已完成</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon purple">
              <el-icon :size="32"><TrendCharts /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.passRate }}%</div>
              <div class="stat-title">通过率</div>
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
          <el-form-item label="面试结果">
            <el-select v-model="filterForm.conclusion" placeholder="全部状态" clearable style="width: 140px">
              <el-option label="待反馈" value="pending" />
              <el-option label="通过" value="pass" />
              <el-option label="淘汰" value="reject" />
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
          
          <el-table-column prop="candidateName" label="候选人" min-width="150">
            <template #default="{ row }">
              <div class="candidate-info">
                <el-avatar :size="36" :icon="UserFilled" />
                <div class="candidate-detail">
                  <div class="candidate-name">{{ row.candidateName }}</div>
                  <div class="candidate-position">{{ row.jobTitle }}</div>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="round" label="面试轮次" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="getRoundType(row.round)" effect="light">
                {{ row.round }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="interviewTime" label="面试时间" width="180">
            <template #default="{ row }">
              <div class="time-cell">
                <el-icon><Clock /></el-icon>
                <span>{{ formatDateTime(row.interviewTime) }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="interviewerName" label="面试官" width="120">
            <template #default="{ row }">
              <div class="interviewer">
                <el-avatar :size="24" :icon="User" />
                <span>{{ row.interviewerName }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="conclusion" label="面试结果" width="120" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.conclusion" :type="getConclusionType(row.conclusion)">
                {{ getConclusionText(row.conclusion) }}
              </el-tag>
              <el-tag v-else type="info">待反馈</el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="feedbackContent" label="反馈内容" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.feedbackContent">{{ row.feedbackContent }}</span>
              <span v-else class="no-feedback">暂无反馈</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button v-if="!row.conclusion" type="primary" link size="small" @click="handleAddFeedback(row)">
                添加反馈
              </el-button>
              <el-button v-else type="primary" link size="small" @click="handleViewDetail(row)">
                查看详情
              </el-button>
              <el-button type="success" link size="small" @click="goToCandidate(row)">
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
                  :content="`${item.candidateName} - ${item.round}`"
                  placement="top"
                >
                  <div class="interview-dot" :class="item.conclusion || 'pending'" @click="handleDotClick(item)"></div>
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
              :type="getTimelineType(item)"
              :timestamp="formatTime(item.interviewTime)"
            >
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="candidate-name">{{ item.candidateName }}</span>
                  <el-tag size="small">{{ item.round }}</el-tag>
                </div>
                <div class="timeline-info">
                  <span>面试官：{{ item.interviewerName }}</span>
                  <span>职位：{{ item.jobTitle }}</span>
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-card>
    </template>

    <!-- 添加反馈对话框 -->
    <el-dialog v-model="feedbackDialogVisible" title="添加面试反馈" width="500px">
      <el-form ref="feedbackFormRef" :model="feedbackForm" :rules="feedbackRules" label-width="100px">
        <el-form-item label="候选人">
          <span>{{ currentInterview?.candidateName }}</span>
        </el-form-item>
        <el-form-item label="面试轮次">
          <el-tag>{{ currentInterview?.round }}</el-tag>
        </el-form-item>
        <el-form-item label="面试结论" prop="conclusion">
          <el-radio-group v-model="feedbackForm.conclusion">
            <el-radio-button label="pass">通过</el-radio-button>
            <el-radio-button label="reject">淘汰</el-radio-button>
            <el-radio-button label="pending">待定</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="反馈内容" prop="feedbackContent">
          <el-input
            v-model="feedbackForm.feedbackContent"
            type="textarea"
            :rows="4"
            placeholder="请填写面试反馈内容"
          />
        </el-form-item>
        <el-form-item v-if="feedbackForm.conclusion === 'reject'" label="淘汰原因" prop="rejectReason">
          <el-input v-model="feedbackForm.rejectReason" type="textarea" :rows="2" placeholder="请填写淘汰原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="feedbackDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleFeedbackSubmit" :loading="feedbackSubmitting">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  Calendar,
  Clock,
  CircleCheck,
  TrendCharts,
  Search,
  UserFilled,
  User,
} from '@element-plus/icons-vue';
import { getInterviewList, addInterviewFeedback, type InterviewListItem } from '@/api/candidate';

const router = useRouter();

// ============ 视图和数据 ============
const viewMode = ref<'list' | 'calendar'>('list');
const loading = ref(false);
const calendarDate = ref(new Date());

const stats = reactive({
  today: 3,
  pending: 8,
  completed: 12,
  passRate: 75,
});

const filterForm = reactive({
  dateRange: [] as string[],
  round: '',
  conclusion: '',
});

const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

// ============ 面试列表数据 ============
type InterviewItem = InterviewListItem;

const interviewList = ref<InterviewItem[]>([]);

// ============ 日历相关 ============
const selectedDate = computed(() => calendarDate.value);

const selectedDayInterviews = computed(() => {
  const dateStr = formatDateKey(selectedDate.value);
  return interviewList.value.filter(item => 
    formatDateKey(new Date(item.interviewTime)) === dateStr
  );
});

function hasInterview(day: string): boolean {
  return interviewList.value.some(item => 
    formatDateKey(new Date(item.interviewTime)) === day
  );
}

function getDayInterviews(day: string): InterviewItem[] {
  return interviewList.value.filter(item => 
    formatDateKey(new Date(item.interviewTime)) === day
  );
}

function formatDateKey(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============ 反馈对话框 ============
const feedbackDialogVisible = ref(false);
const feedbackSubmitting = ref(false);
const feedbackFormRef = ref<FormInstance>();
const currentInterview = ref<InterviewItem | null>(null);

const feedbackForm = reactive({
  conclusion: 'pass' as 'pass' | 'reject' | 'pending',
  feedbackContent: '',
  rejectReason: '',
});

const feedbackRules: FormRules = {
  conclusion: [{ required: true, message: '请选择面试结论', trigger: 'change' }],
  feedbackContent: [{ required: true, message: '请填写反馈内容', trigger: 'blur' }],
  rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }],
};

// ============ 方法 ============
async function fetchInterviews() {
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
    if (filterForm.round) {
      params.round = filterForm.round;
    }
    if (filterForm.conclusion) {
      params.conclusion = filterForm.conclusion;
    }
    if (filterForm.dateRange && filterForm.dateRange.length === 2) {
      params.startDate = filterForm.dateRange[0];
      params.endDate = filterForm.dateRange[1];
    }

    const res = await getInterviewList(params);
    if (res.success) {
      interviewList.value = res.data;
      pagination.total = res.pagination.total;
      updateStats(res.data);
    }
  } catch (error) {
    console.error('获取面试列表失败:', error);
  } finally {
    loading.value = false;
  }
}

function updateStats(interviews: InterviewItem[]) {
  const today = formatDateKey(new Date());
  stats.today = interviews.filter(item => formatDateKey(new Date(item.interviewTime)) === today).length;
  stats.pending = interviews.filter(item => !item.conclusion).length;
  stats.completed = interviews.filter(item => item.conclusion && new Date(item.interviewTime) <= new Date()).length;
  const passed = interviews.filter(item => item.conclusion === 'pass').length;
  const total = interviews.filter(item => item.conclusion).length;
  stats.passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
}

function handleSearch() {
  pagination.page = 1;
  fetchInterviews();
}

function handleReset() {
  filterForm.dateRange = [];
  filterForm.round = '';
  filterForm.conclusion = '';
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

function getConclusionType(conclusion: string): string {
  return { 'pass': 'success', 'reject': 'danger', 'pending': 'warning' }[conclusion] || 'info';
}

function getConclusionText(conclusion: string): string {
  return { 'pass': '通过', 'reject': '淘汰', 'pending': '待定' }[conclusion] || conclusion;
}

function getTimelineType(item: InterviewItem): any {
  if (!item.conclusion) return 'primary';
  return { 'pass': 'success', 'reject': 'danger', 'pending': 'warning' }[item.conclusion];
}

function handleAddFeedback(row: InterviewItem) {
  currentInterview.value = row;
  feedbackForm.conclusion = 'pass';
  feedbackForm.feedbackContent = '';
  feedbackForm.rejectReason = '';
  feedbackDialogVisible.value = true;
}

async function handleFeedbackSubmit() {
  if (!currentInterview.value) return;
  const valid = await feedbackFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  feedbackSubmitting.value = true;
  try {
    // 这里需要调用更新面试反馈的API
    ElMessage.success('反馈已更新');
    feedbackDialogVisible.value = false;
    fetchInterviews();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    feedbackSubmitting.value = false;
  }
}

function handleViewDetail(row: InterviewItem) {
  router.push(`/candidates/${row.candidateId}`);
}

function goToCandidate(row: InterviewItem) {
  router.push(`/candidates/${row.candidateId}`);
}

function handleDotClick(item: InterviewItem) {
  router.push(`/candidates/${item.candidateId}`);
}

onMounted(() => {
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
  }

  .stats-row {
    margin-bottom: 20px;

    .stat-card {
      cursor: pointer;
      transition: all 0.3s;

      &:hover {
        transform: translateY(-4px);
      }

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

        .candidate-position {
          font-size: 12px;
          color: #909399;
        }
      }
    }

    .time-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #606266;
    }

    .interviewer {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .no-feedback {
      color: #909399;
      font-style: italic;
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

      &.has-interview {
        background-color: #f0f9eb;
      }

      .date-number {
        font-size: 14px;
        margin-bottom: 4px;
      }

      .interview-dots {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;

        .interview-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          cursor: pointer;

          &.pending { background-color: #909399; }
          &.pass { background-color: #67c23a; }
          &.reject { background-color: #f56c6c; }
        }
      }
    }

    .day-interviews {
      margin-top: 20px;
      padding: 20px;
      background-color: #f5f7fa;
      border-radius: 8px;

      h4 {
        margin: 0 0 16px;
        font-size: 16px;
        color: #303133;
      }

      .timeline-content {
        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;

          .candidate-name {
            font-weight: 500;
          }
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
