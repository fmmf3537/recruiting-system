<template>
  <div class="my-interviews-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">我的面试</h2>
        <span class="page-subtitle">填写并管理你的结构化面试评估</span>
      </div>
    </div>

    <el-card class="table-card" shadow="never" v-loading="loading">
      <!-- 待评估 / 已提交 切换 -->
      <el-tabs v-model="activeStatus" @tab-change="handleTabChange">
        <el-tab-pane label="待评估" name="pending" />
        <el-tab-pane label="已提交" name="submitted" />
      </el-tabs>

      <el-table :data="evaluationList" stripe style="width: 100%">
        <el-table-column type="index" label="序号" width="70" align="center" />
        <el-table-column label="候选人" min-width="120">
          <template #default="{ row }">{{ row.interview.candidateName }}</template>
        </el-table-column>
        <el-table-column label="职位" min-width="140">
          <template #default="{ row }">{{ row.interview.jobTitle || '未分配职位' }}</template>
        </el-table-column>
        <el-table-column label="轮次" width="90" align="center">
          <template #default="{ row }">
            <el-tag effect="light">{{ row.interview.round }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="面试方式" width="90" align="center">
          <template #default="{ row }">{{ row.interview.type }}</template>
        </el-table-column>
        <el-table-column label="面试时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.interview.scheduledAt) }}</template>
        </el-table-column>
        <el-table-column label="时长" width="80" align="center">
          <template #default="{ row }">{{ row.interview.duration }}分钟</template>
        </el-table-column>
        <!-- 已提交 tab 额外展示综合评分与结论 -->
        <el-table-column v-if="activeStatus === 'submitted'" label="综合评分" width="160" align="center">
          <template #default="{ row }">
            <el-rate :model-value="row.overallScore || 0" :max="5" disabled />
          </template>
        </el-table-column>
        <el-table-column v-if="activeStatus === 'submitted'" label="结论" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.conclusion" :type="getConclusionType(row.conclusion)">
              {{ getConclusionText(row.conclusion) }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleOpenDialog(row)">
              {{ row.submittedAt ? '修改评估' : '填写评估' }}
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

    <!-- 评估表单弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="currentEvaluation?.submittedAt ? '修改评估' : '填写评估'"
      width="640px"
      destroy-on-close
    >
      <!-- 面试信息 -->
      <el-descriptions v-if="currentEvaluation" :column="2" border size="small" class="interview-info">
        <el-descriptions-item label="候选人">
          {{ currentEvaluation.interview.candidateName }}
        </el-descriptions-item>
        <el-descriptions-item label="职位">
          {{ currentEvaluation.interview.jobTitle || '未分配职位' }}
        </el-descriptions-item>
        <el-descriptions-item label="轮次">{{ currentEvaluation.interview.round }}</el-descriptions-item>
        <el-descriptions-item label="面试时间">
          {{ formatDateTime(currentEvaluation.interview.scheduledAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <el-form label-width="100px" class="evaluation-form">
        <!-- 维度评分 -->
        <el-form-item
          v-for="(dim, idx) in dimensionRows"
          :key="dim.name"
          :label="dim.name"
          required
        >
          <div class="dimension-row">
            <el-rate v-model="dimensionRows[idx].score" :max="5" />
            <el-input
              v-model="dimensionRows[idx].comment"
              placeholder="评语（可选）"
              class="dimension-comment"
            />
          </div>
        </el-form-item>
        <el-empty v-if="!dimensionRows.length" description="暂无评估维度，请先在字典管理中配置评估维度" />

        <el-form-item label="综合评分" required>
          <el-rate v-model="overallScore" :max="5" />
        </el-form-item>
        <el-form-item label="结论" required>
          <el-radio-group v-model="conclusion">
            <el-radio label="pass">通过</el-radio>
            <el-radio label="reject">不通过</el-radio>
            <el-radio label="pending">待定</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">提交评估</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getMyEvaluations,
  submitEvaluation,
  type MyEvaluationItem,
  type EvaluationConclusion,
} from '@/api/evaluation';
import { getDictionaries } from '@/api/dictionary';

// ============ 列表数据 ============
const activeStatus = ref<'pending' | 'submitted'>('pending');
const loading = ref(false);
const evaluationList = ref<MyEvaluationItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

async function fetchEvaluations() {
  loading.value = true;
  try {
    const res = await getMyEvaluations({
      status: activeStatus.value,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      evaluationList.value = res.data || [];
      pagination.total = res.pagination?.total || 0;
    }
  } catch (error) {
    console.error('获取我的评估列表失败:', error);
  } finally {
    loading.value = false;
  }
}

function handleTabChange() {
  pagination.page = 1;
  fetchEvaluations();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchEvaluations();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchEvaluations();
}

// ============ 评估表单弹窗 ============
const dialogVisible = ref(false);
const submitting = ref(false);
const currentEvaluation = ref<MyEvaluationItem | null>(null);
const dimensionRows = ref<Array<{ name: string; score: number; comment: string }>>([]);
const overallScore = ref(0);
const conclusion = ref<EvaluationConclusion | ''>('');

async function handleOpenDialog(row: MyEvaluationItem) {
  currentEvaluation.value = row;
  overallScore.value = row.overallScore || 0;
  conclusion.value = row.conclusion || '';

  // 拉取评估维度字典，已提交的评估按维度名预填（字典新增维度补空）
  try {
    const res = await getDictionaries({ category: 'evaluation_dimension' });
    const dictNames = (res.data || []).filter((d) => d.enabled).map((d) => d.name);
    const submitted = row.dimensions || [];
    dimensionRows.value = dictNames.map((name) => {
      const existing = submitted.find((d) => d.name === name);
      return {
        name,
        score: existing?.score || 0,
        comment: existing?.comment || '',
      };
    });
  } catch (error) {
    console.error('获取评估维度字典失败:', error);
    dimensionRows.value = [];
  }

  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!currentEvaluation.value) return;

  // 校验：所有维度必须评分、综合评分必填、结论必选
  if (dimensionRows.value.some((d) => d.score < 1)) {
    ElMessage.warning('请为所有评估维度打分');
    return;
  }
  if (overallScore.value < 1) {
    ElMessage.warning('请填写综合评分');
    return;
  }
  if (!conclusion.value) {
    ElMessage.warning('请选择评估结论');
    return;
  }

  submitting.value = true;
  try {
    await submitEvaluation(currentEvaluation.value.id, {
      dimensions: dimensionRows.value.map((d) => ({
        name: d.name,
        score: d.score,
        comment: d.comment || undefined,
      })),
      overallScore: overallScore.value,
      conclusion: conclusion.value,
    });
    ElMessage.success('评估提交成功');
    dialogVisible.value = false;
    fetchEvaluations();
  } catch (error) {
    console.error('提交评估失败:', error);
  } finally {
    submitting.value = false;
  }
}

// ============ 格式化 ============
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getConclusionType(c: EvaluationConclusion): string {
  return { pass: 'success', reject: 'danger', pending: 'warning' }[c] || 'info';
}

function getConclusionText(c: EvaluationConclusion): string {
  return { pass: '通过', reject: '不通过', pending: '待定' }[c] || c;
}

onMounted(() => {
  fetchEvaluations();
});
onActivated(() => {
  fetchEvaluations();
});
</script>

<style scoped lang="scss">
.my-interviews-page {
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

  .table-card {
    .pagination-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ebeef5;
    }
  }

  .interview-info {
    margin-bottom: 20px;
  }

  .evaluation-form {
    .dimension-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;

      .dimension-comment {
        flex: 1;
      }
    }
  }
}
</style>
