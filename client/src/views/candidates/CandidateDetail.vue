<template>
  <div class="candidate-detail-page">
    <!-- 返回按钮 -->
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回列表
      </el-button>
    </div>

    <div v-if="candidate" class="detail-container">
      <!-- 左侧：基本信息 -->
      <div class="left-column">
        <el-card shadow="never" class="info-card">
          <template #header>
            <div class="card-header">
              <span>基本信息</span>
              <el-button type="primary" link @click="handleEdit">
                <el-icon><Edit /></el-icon>编辑
              </el-button>
            </div>
          </template>

          <div class="profile-section">
            <el-avatar :size="80" :icon="UserFilled" />
            <h3 class="candidate-name">{{ candidate.name }}</h3>
            <el-tag :type="getStatusType(candidate.stageStatus)">
              {{ getStatusText(candidate.stageStatus) }}
            </el-tag>
          </div>

          <el-descriptions :column="1" border class="info-desc">
            <el-descriptions-item label="性别">{{ candidate.gender }}</el-descriptions-item>
            <el-descriptions-item label="年龄">{{ candidate.age ? candidate.age + '岁' : '-' }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ candidate.phone }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ candidate.email }}</el-descriptions-item>
            <el-descriptions-item label="学历">{{ candidate.education || '-' }}</el-descriptions-item>
            <el-descriptions-item label="院校">{{ candidate.school || '-' }}</el-descriptions-item>
            <el-descriptions-item label="工作年限">{{ candidate.workYears ? candidate.workYears + '年' : '-' }}</el-descriptions-item>
            <el-descriptions-item label="当前公司">{{ candidate.currentCompany || '-' }}</el-descriptions-item>
            <el-descriptions-item label="当前职位">{{ candidate.currentPosition || '-' }}</el-descriptions-item>
            <el-descriptions-item label="期望薪资">{{ candidate.expectedSalary || '-' }}</el-descriptions-item>
            <el-descriptions-item label="来源渠道">{{ candidate.source }}</el-descriptions-item>
          </el-descriptions>

          <div v-if="candidate.intro" class="intro-section">
            <h4>候选人说明</h4>
            <p>{{ candidate.intro }}</p>
          </div>
        </el-card>
      </div>

      <!-- 中间：流程记录 -->
      <div class="middle-column">
        <el-card shadow="never" class="timeline-card">
          <template #header>
            <div class="card-header">
              <span>流程记录</span>
              <el-tag type="primary">{{ candidate.currentStage }}</el-tag>
            </div>
          </template>

          <el-timeline>
            <el-timeline-item
              v-for="(record, index) in candidate.stageRecords"
              :key="record.id"
              :type="getTimelineType(record.status)"
              :color="getTimelineColor(record.status)"
              :timestamp="formatDate(record.enteredAt)"
              placement="top"
            >
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="stage-name">{{ record.stage }}</span>
                  <el-tag :type="getStatusType(record.status)" size="small">
                    {{ getStatusText(record.status) }}
                  </el-tag>
                </div>
                <div v-if="record.assignee" class="assignee">
                  负责人：{{ record.assignee.name }}
                </div>
                <div v-if="record.rejectReason" class="reject-reason">
                  淘汰原因：{{ record.rejectReason }}
                </div>
                <div v-if="record.note" class="note">
                  {{ record.note }}
                </div>
              </div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </div>

      <!-- 右侧：面试反馈 + Offer + 操作 -->
      <div class="right-column">
        <!-- 操作栏 -->
        <el-card shadow="never" class="action-card">
          <div class="action-buttons">
            <el-button
              v-if="canAdvance"
              type="primary"
              size="large"
              @click="handleAdvance"
              style="width: 100%"
            >
              <el-icon><Promotion /></el-icon>推进流程
            </el-button>
            <el-button
              type="success"
              size="large"
              @click="handleAddFeedback"
              style="width: 100%"
            >
              <el-icon><ChatDotRound /></el-icon>添加面试反馈
            </el-button>
            <el-button
              v-if="!candidate.offer"
              type="warning"
              size="large"
              @click="handleCreateOffer"
              style="width: 100%"
            >
              <el-icon><Document /></el-icon>创建 Offer
            </el-button>
            <el-button
              v-else
              type="info"
              size="large"
              @click="handleViewOffer"
              style="width: 100%"
            >
              <el-icon><View /></el-icon>查看 Offer
            </el-button>
          </div>
        </el-card>

        <!-- Offer 信息 -->
        <el-card v-if="candidate.offer" shadow="never" class="offer-card">
          <template #header>
            <div class="card-header">
              <span>Offer 信息</span>
              <el-tag :type="getOfferResultType(candidate.offer.result)">
                {{ getOfferResultText(candidate.offer.result) }}
              </el-tag>
            </div>
          </template>
          <el-descriptions :column="1">
            <el-descriptions-item label="薪资">{{ candidate.offer.salary || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Offer日期">{{ formatDate(candidate.offer.offerDate) }}</el-descriptions-item>
            <el-descriptions-item label="预计入职">{{ candidate.offer.expectedJoinDate ? formatDate(candidate.offer.expectedJoinDate) : '-' }}</el-descriptions-item>
            <el-descriptions-item label="入职状态">
              <el-tag :type="candidate.offer.joined ? 'success' : 'info'">
                {{ candidate.offer.joined ? '已入职' : '未入职' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- 面试反馈 -->
        <el-card shadow="never" class="feedback-card">
          <template #header>
            <div class="card-header">
              <span>面试反馈</span>
            </div>
          </template>
          <div v-if="candidate.interviewFeedbacks?.length" class="feedback-list">
            <div
              v-for="feedback in candidate.interviewFeedbacks"
              :key="feedback.id"
              class="feedback-item"
            >
              <div class="feedback-header">
                <span class="round">{{ feedback.round }}</span>
                <el-tag :type="getFeedbackConclusionType(feedback.conclusion)" size="small">
                  {{ getFeedbackConclusionText(feedback.conclusion) }}
                </el-tag>
              </div>
              <div class="feedback-info">
                <span>面试官：{{ feedback.interviewerName }}</span>
                <span>{{ formatDate(feedback.interviewTime) }}</span>
              </div>
              <div class="feedback-content">{{ feedback.feedbackContent }}</div>
              <div v-if="feedback.rejectReason" class="reject-reason">
                淘汰原因：{{ feedback.rejectReason }}
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无面试反馈" />
        </el-card>
      </div>
    </div>

    <el-empty v-else-if="notFound" description="候选人不存在或已被删除">
      <el-button type="primary" @click="goToList">返回列表</el-button>
    </el-empty>

    <!-- 推进流程对话框 -->
    <el-dialog v-model="advanceDialogVisible" title="推进候选人流程" width="500px">
      <el-form ref="advanceFormRef" :model="advanceForm" :rules="advanceRules" label-width="100px">
        <el-form-item label="当前阶段">
          <el-tag>{{ candidate?.currentStage }}</el-tag>
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

    <!-- 添加面试反馈对话框 -->
    <el-dialog v-model="feedbackDialogVisible" title="添加面试反馈" width="500px">
      <el-form ref="feedbackFormRef" :model="feedbackForm" :rules="feedbackRules" label-width="100px">
        <el-form-item label="面试轮次" prop="round">
          <el-radio-group v-model="feedbackForm.round">
            <el-radio-button label="初试">初试</el-radio-button>
            <el-radio-button label="复试">复试</el-radio-button>
            <el-radio-button label="终面">终面</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="面试官" prop="interviewerName">
          <el-input v-model="feedbackForm.interviewerName" placeholder="请输入面试官姓名" />
        </el-form-item>
        <el-form-item label="面试时间" prop="interviewTime">
          <el-date-picker v-model="feedbackForm.interviewTime" type="datetime" placeholder="选择面试时间" style="width: 100%" />
        </el-form-item>
        <el-form-item label="面试结论" prop="conclusion">
          <el-radio-group v-model="feedbackForm.conclusion">
            <el-radio-button label="pass">通过</el-radio-button>
            <el-radio-button label="reject">淘汰</el-radio-button>
            <el-radio-button label="pending">待定</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="反馈内容" prop="feedbackContent">
          <el-input v-model="feedbackForm.feedbackContent" type="textarea" :rows="4" placeholder="请填写面试反馈内容" />
        </el-form-item>
        <el-form-item label="淘汰原因" prop="rejectReason" v-if="feedbackForm.conclusion === 'reject'">
          <el-input v-model="feedbackForm.rejectReason" type="textarea" :rows="2" placeholder="请填写淘汰原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="feedbackDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleFeedbackSubmit" :loading="feedbackSubmitting">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Edit, UserFilled, Promotion, ChatDotRound, Document, View } from '@element-plus/icons-vue';
import {
  getCandidateById,
  advanceStage,
  addInterviewFeedback,
  type CandidateDetail,
  type AdvanceStageParams,
  type InterviewFeedbackParams,
} from '@/api/candidate';

const route = useRoute();
const router = useRouter();
const candidateId = route.params.id as string;

const candidate = ref<CandidateDetail | null>(null);
const loading = ref(false);
const notFound = ref(false);

// 计算是否可推进
const canAdvance = computed(() => {
  if (!candidate.value) return false;
  return candidate.value.stageStatus !== 'rejected' && candidate.value.currentStage !== '入职';
});

// 推进流程
const advanceDialogVisible = ref(false);
const advanceSubmitting = ref(false);
const advanceFormRef = ref<FormInstance>();
const stageOrder = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'];

const availableStages = computed(() => {
  if (!candidate.value) return [];
  const currentIndex = stageOrder.indexOf(candidate.value.currentStage);
  // 只返回下一个阶段（不能跳过）
  const nextStage = stageOrder[currentIndex + 1];
  return nextStage ? [nextStage] : [];
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

// 面试反馈
const feedbackDialogVisible = ref(false);
const feedbackSubmitting = ref(false);
const feedbackFormRef = ref<FormInstance>();

const feedbackForm = reactive<InterviewFeedbackParams>({
  round: '初试',
  interviewerName: '',
  interviewTime: new Date().toISOString(),
  conclusion: 'pass',
  feedbackContent: '',
  rejectReason: '',
});

const feedbackRules: FormRules = {
  round: [{ required: true, message: '请选择面试轮次', trigger: 'change' }],
  interviewerName: [{ required: true, message: '请输入面试官姓名', trigger: 'blur' }],
  interviewTime: [{ required: true, message: '请选择面试时间', trigger: 'change' }],
  conclusion: [{ required: true, message: '请选择面试结论', trigger: 'change' }],
  feedbackContent: [{ required: true, message: '请填写反馈内容', trigger: 'blur' }],
  rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }],
};

// 获取候选人详情
async function fetchCandidateDetail() {
  loading.value = true;
  notFound.value = false;
  try {
    const res = await getCandidateById(candidateId);
    if (res.success) {
      candidate.value = res.data;
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    if (errorMsg.includes('不存在') || errorMsg.includes('not exist')) {
      notFound.value = true;
    } else {
      ElMessage.error('获取候选人详情失败');
    }
  } finally {
    loading.value = false;
  }
}

// 方法
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getStatusType(status: string): string {
  return { 'in_progress': 'warning', 'passed': 'success', 'rejected': 'danger' }[status] || 'info';
}

function getStatusText(status: string): string {
  return { 'in_progress': '进行中', 'passed': '已通过', 'rejected': '已淘汰' }[status] || status;
}

function getTimelineType(status: string): any {
  return { 'passed': 'success', 'rejected': 'danger', 'in_progress': 'primary' }[status] || '';
}

function getTimelineColor(status: string): string {
  return { 'passed': '#67c23a', 'rejected': '#f56c6c', 'in_progress': '#409eff' }[status] || '';
}

function getOfferResultType(result: string): string {
  return { 'pending': 'warning', 'accepted': 'success', 'rejected': 'danger' }[result] || 'info';
}

function getOfferResultText(result: string): string {
  return { 'pending': '待确认', 'accepted': '已接受', 'rejected': '已拒绝' }[result] || result;
}

function getFeedbackConclusionType(conclusion: string): string {
  return { 'pass': 'success', 'reject': 'danger', 'pending': 'warning' }[conclusion] || 'info';
}

function getFeedbackConclusionText(conclusion: string): string {
  return { 'pass': '通过', 'reject': '淘汰', 'pending': '待定' }[conclusion] || conclusion;
}

function handleEdit() {
  router.push(`/candidates/${candidateId}/edit`);
}

function goToList() {
  router.push('/candidates');
}

function handleAdvance() {
  advanceForm.stage = '' as any;
  advanceForm.status = 'passed';
  advanceForm.rejectReason = '';
  advanceForm.note = '';
  advanceDialogVisible.value = true;
}

async function handleAdvanceSubmit() {
  const valid = await advanceFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  advanceSubmitting.value = true;
  try {
    const res = await advanceStage(candidateId, { ...advanceForm });
    if (res.success) {
      ElMessage.success('阶段推进成功');
      advanceDialogVisible.value = false;
      fetchCandidateDetail();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '推进失败');
  } finally {
    advanceSubmitting.value = false;
  }
}

function handleAddFeedback() {
  feedbackForm.round = '初试';
  feedbackForm.interviewerName = '';
  feedbackForm.interviewTime = new Date().toISOString();
  feedbackForm.conclusion = 'pass';
  feedbackForm.feedbackContent = '';
  feedbackForm.rejectReason = '';
  feedbackDialogVisible.value = true;
}

async function handleFeedbackSubmit() {
  const valid = await feedbackFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  feedbackSubmitting.value = true;
  try {
    const res = await addInterviewFeedback(candidateId, { ...feedbackForm });
    if (res.success) {
      ElMessage.success('面试反馈添加成功');
      feedbackDialogVisible.value = false;
      fetchCandidateDetail();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '添加失败');
  } finally {
    feedbackSubmitting.value = false;
  }
}

function handleCreateOffer() {
  router.push(`/offers/create?candidateId=${candidateId}`);
}

function handleViewOffer() {
  if (candidate.value?.offer) {
    router.push(`/offers/${candidate.value.offer.id}`);
  }
}

onMounted(() => {
  fetchCandidateDetail();
});
</script>

<style scoped lang="scss">
.candidate-detail-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;

  .back-nav {
    margin-bottom: 20px;
  }

  .detail-container {
    display: grid;
    grid-template-columns: 320px 1fr 380px;
    gap: 20px;

    @media (max-width: 1200px) {
      grid-template-columns: 1fr;
    }
  }

  .left-column,
  .middle-column,
  .right-column {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
  }

  .info-card {
    .profile-section {
      text-align: center;
      padding: 20px 0;

      .candidate-name {
        margin: 12px 0;
        font-size: 20px;
        font-weight: 500;
      }
    }

    .info-desc {
      margin-top: 20px;
    }

    .intro-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ebeef5;

      h4 {
        margin: 0 0 10px;
        font-size: 14px;
        color: #606266;
      }

      p {
        margin: 0;
        color: #909399;
        line-height: 1.6;
      }
    }
  }

  .timeline-card {
    .timeline-content {
      .timeline-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .stage-name {
          font-weight: 500;
          font-size: 16px;
        }
      }

      .assignee,
      .reject-reason,
      .note {
        margin-top: 8px;
        font-size: 13px;
        color: #606266;
      }

      .reject-reason {
        color: #f56c6c;
      }
    }
  }

  .action-card {
    .action-buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;

      .el-button {
        margin: 0;
      }
    }
  }

  .offer-card {
    :deep(.el-descriptions__label) {
      width: 100px;
    }
  }

  .feedback-card {
    .feedback-list {
      display: flex;
      flex-direction: column;
      gap: 16px;

      .feedback-item {
        padding: 16px;
        background-color: #f5f7fa;
        border-radius: 8px;

        .feedback-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;

          .round {
            font-weight: 500;
            font-size: 15px;
          }
        }

        .feedback-info {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #909399;
          margin-bottom: 8px;
        }

        .feedback-content {
          color: #606266;
          line-height: 1.6;
        }

        .reject-reason {
          margin-top: 8px;
          color: #f56c6c;
          font-size: 13px;
        }
      }
    }
  }
}
</style>
