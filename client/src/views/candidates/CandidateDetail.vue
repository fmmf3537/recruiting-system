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
              <div class="header-actions">
                <el-button type="warning" link @click="showResumeUpload = true">
                  <el-icon><Upload /></el-icon>重新解析
                </el-button>
                <el-button v-if="canDelete" type="danger" link @click="handleDelete">
                  <el-icon><Delete /></el-icon>删除
                </el-button>
                <el-button type="primary" link @click="handleEdit">
                  <el-icon><Edit /></el-icon>编辑
                </el-button>
              </div>
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
            <el-descriptions-item label="推荐人">{{ candidate.referrer || '-' }}</el-descriptions-item>
            <el-descriptions-item label="简历附件">
              <el-link v-if="candidate.resumeUrl" :href="candidate.resumeUrl" target="_blank" type="primary">
                下载简历
              </el-link>
              <span v-else>-</span>
            </el-descriptions-item>
          </el-descriptions>

          <div class="tags-section">
            <h4>标签</h4>
            <div class="tag-editor">
              <el-tag
                v-for="tag in candidate.tags || []"
                :key="tag.id"
                size="small"
                :color="tag.color"
                effect="light"
                class="detail-tag"
                closable
                @close="handleRemoveTag(tag.id)"
              >
                {{ tag.name }}
              </el-tag>
              <el-select
                v-model="tagSelectValue"
                placeholder="+ 添加标签"
                size="small"
                clearable
                style="width: 120px"
                @change="handleAddTag"
              >
                <el-option
                  v-for="tag in availableTags"
                  :key="tag.id"
                  :label="tag.name"
                  :value="tag.id"
                />
              </el-select>
            </div>
          </div>

          <div v-if="candidate.skills?.length" class="skills-section">
            <h4>技能标签</h4>
            <div class="skills-wrapper">
              <el-tag
                v-for="skill in candidate.skills"
                :key="skill"
                size="small"
                type="primary"
                effect="light"
                class="skill-tag"
              >
                {{ skill }}
              </el-tag>
            </div>
          </div>

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
            <el-button
              type="default"
              size="large"
              @click="showSendEmail"
              style="width: 100%"
            >
              <el-icon><Message /></el-icon>发送邮件
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

        <!-- 入职任务清单 -->
        <el-card v-if="candidate.offer?.result === 'accepted' || candidate.offer?.joined" shadow="never" class="onboarding-card">
          <template #header>
            <div class="card-header">
              <span>入职任务清单</span>
              <el-button v-if="!onboardingTasks.length" type="primary" link size="small" @click="generateOnboardingTasks">
                生成标准任务
              </el-button>
            </div>
          </template>
          <el-empty v-if="!onboardingTasks.length" description="暂无入职任务" :image-size="60" />
          <div v-else class="task-list">
            <div
              v-for="task in onboardingTasks"
              :key="task.id"
              class="task-item"
            >
              <el-checkbox
                :model-value="task.status === 'completed'"
                @change="(val: boolean) => toggleTaskStatus(task.id, val)"
              >
                <span :class="{ 'task-completed': task.status === 'completed' }">{{ task.title }}</span>
              </el-checkbox>
              <el-tag size="small" type="info">{{ task.category }}</el-tag>
            </div>
          </div>
        </el-card>

        <!-- 面试安排 -->
        <el-card shadow="never" class="interview-card">
          <template #header>
            <div class="card-header">
              <span>面试安排</span>
              <el-button type="primary" link size="small" @click="handleScheduleInterview">
                + 安排面试
              </el-button>
            </div>
          </template>
          <div v-if="candidateInterviews.length" class="interview-list">
            <div v-for="iv in candidateInterviews" :key="iv.id" class="interview-item">
              <div class="interview-header">
                <el-tag size="small">{{ iv.round }}</el-tag>
                <el-tag size="small" :type="getInterviewStatusType(iv.status)">
                  {{ getInterviewStatusText(iv.status) }}
                </el-tag>
              </div>
              <div class="interview-detail">
                <div class="detail-row">
                  <el-icon><Clock /></el-icon>
                  <span>{{ formatDateTime(iv.scheduledAt) }}（{{ iv.duration }}分钟）</span>
                </div>
                <div class="detail-row">
                  <el-icon><User /></el-icon>
                  <span>{{ iv.interviewers?.map((i: any) => i.name).join('、') }}</span>
                </div>
                <div v-if="iv.location" class="detail-row">
                  <el-icon><Location /></el-icon>
                  <span>{{ iv.location }}</span>
                </div>
              </div>
              <div v-if="iv.notes" class="interview-notes">{{ iv.notes }}</div>
            </div>
          </div>
          <el-empty v-else description="暂无面试安排" :image-size="50" />
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

        <!-- 沟通记录 -->
        <el-card shadow="never" class="communication-card">
          <template #header>
            <div class="card-header">
              <span>沟通记录</span>
              <el-button type="primary" link size="small" @click="handleAddCommunication">
                + 添加记录
              </el-button>
            </div>
          </template>
          <div v-if="candidateCommunications.length" class="communication-list">
            <div v-for="log in candidateCommunications" :key="log.id" class="communication-item">
              <div class="comm-header">
                <el-tag size="small" type="info">{{ log.type }}</el-tag>
                <span class="comm-time">{{ formatDateTime(log.createdAt) }}</span>
                <span class="comm-author">{{ log.createdBy?.name || '—' }}</span>
              </div>
              <div class="comm-content">{{ log.content }}</div>
              <div v-if="log.result" class="comm-result">结果：{{ log.result }}</div>
              <div v-if="log.followUpAt" class="comm-followup">
                <el-icon><Clock /></el-icon> 跟进提醒：{{ formatDateTime(log.followUpAt) }}
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无沟通记录" :image-size="50" />
        </el-card>
      </div>
    </div>

    <el-empty v-else-if="notFound" description="候选人不存在或已被删除">
      <el-button type="primary" @click="goToList">返回列表</el-button>
    </el-empty>

    <!-- 发送邮件对话框 -->
    <el-dialog v-model="emailDialogVisible" title="发送邮件" width="600px">
      <el-form label-width="100px">
        <el-form-item label="收件人">
          <el-input :model-value="candidate?.email" disabled />
        </el-form-item>
        <el-form-item label="选择模板">
          <el-select v-model="selectedTemplateId" placeholder="可选" clearable style="width: 100%" @change="handleTemplateChange">
            <el-option
              v-for="tpl in emailTemplates"
              :key="tpl.id"
              :label="tpl.name"
              :value="tpl.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="邮件主题">
          <el-input v-model="emailSubject" placeholder="请输入邮件主题" />
        </el-form-item>
        <el-form-item label="邮件正文">
          <el-input
            v-model="emailBody"
            type="textarea"
            :rows="8"
            placeholder="支持 HTML 语法"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="emailDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSendEmail" :loading="emailSubmitting">发送</el-button>
      </template>
    </el-dialog>

    <!-- 重新上传简历对话框 -->
    <ResumeUpload v-model="showResumeUpload" @confirm="handleResumeReParsed" />

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

    <!-- 添加沟通记录对话框 -->
    <el-dialog v-model="commDialogVisible" title="添加沟通记录" width="500px" destroy-on-close>
      <el-form ref="commFormRef" :model="commForm" :rules="commRules" label-width="80px">
        <el-form-item label="沟通方式" prop="type">
          <el-select v-model="commForm.type" style="width: 100%">
            <el-option label="电话" value="电话" />
            <el-option label="邮件" value="邮件" />
            <el-option label="微信" value="微信" />
            <el-option label="短信" value="短信" />
            <el-option label="面谈" value="面谈" />
          </el-select>
        </el-form-item>
        <el-form-item label="沟通内容" prop="content">
          <el-input v-model="commForm.content" type="textarea" :rows="4" placeholder="请记录沟通内容摘要" />
        </el-form-item>
        <el-form-item label="沟通结果">
          <el-input v-model="commForm.result" placeholder="沟通结果（可选）" />
        </el-form-item>
        <el-form-item label="跟进提醒">
          <el-date-picker
            v-model="commForm.followUpAt"
            type="datetime"
            placeholder="设置下次跟进时间（可选）"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="commDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCommSubmit" :loading="commSubmitting">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Edit, Delete, UserFilled, Promotion, ChatDotRound, Document, View, Upload, Message, Clock, User, Location } from '@element-plus/icons-vue';
import {
  getCandidateById,
  advanceStage,
  addInterviewFeedback,
  deleteCandidate,
  type CandidateDetail,
  type AdvanceStageParams,
  type InterviewFeedbackParams,
  type ResumeParseResult,
} from '@/api/candidate';
import { getTags, setCandidateTags, type Tag } from '@/api/tag';
import { getEmailTemplates, sendEmail, type EmailTemplate } from '@/api/email';
import { getTasksByCandidate, updateTask, generateDefaultTasks, type OnboardingTask } from '@/api/onboarding-task';
import { getCandidateInterviews, type InterviewItem } from '@/api/interview';
import { getCandidateCommunications, createCommunication, type CommunicationItem } from '@/api/communication';
import { useAuthStore } from '@/stores/auth';
import { useResumeParserStore } from '@/stores/resumeParser';
import ResumeUpload from './ResumeUpload.vue';

const route = useRoute();
const router = useRouter();
const candidateId = route.params.id as string;
const authStore = useAuthStore();
const resumeParserStore = useResumeParserStore();

const candidate = ref<CandidateDetail | null>(null);
const loading = ref(false);
const notFound = ref(false);
const showResumeUpload = ref(false);
const tagOptions = ref<Tag[]>([]);
const onboardingTasks = ref<OnboardingTask[]>([]);
const tagSelectValue = ref('');

// 面试安排
const candidateInterviews = ref<InterviewItem[]>([]);

// 沟通记录
const candidateCommunications = ref<CommunicationItem[]>([]);
const commDialogVisible = ref(false);
const commSubmitting = ref(false);
const commFormRef = ref<FormInstance>();
const commForm = reactive({
  type: '电话' as string,
  content: '',
  result: '',
  followUpAt: '',
});
const commRules: FormRules = {
  type: [{ required: true, message: '请选择沟通方式', trigger: 'change' }],
  content: [{ required: true, message: '请填写沟通内容', trigger: 'blur' }],
};

const availableTags = computed(() => {
  const currentTagIds = new Set((candidate.value?.tags || []).map((t) => t.id));
  return tagOptions.value.filter((t) => !currentTagIds.has(t.id));
});

function handleResumeReParsed(data: ResumeParseResult) {
  // 将解析结果存入 Store，跳转到编辑页面
  resumeParserStore.setParsedData(data);
  router.push(`/candidates/${candidateId}/edit`);
}

// 计算是否可推进
const canAdvance = computed(() => {
  if (!candidate.value) return false;
  return candidate.value.stageStatus !== 'rejected' && candidate.value.currentStage !== '入职';
});

// 计算是否可删除
const canDelete = computed(() => {
  if (!candidate.value) return false;
  const currentUser = authStore.userInfo;
  return currentUser?.id === candidate.value.createdById || currentUser?.role === 'admin';
});

// 删除候选人
async function handleDelete() {
  if (!candidate.value) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除候选人「${candidate.value.name}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    );
    const res = await deleteCandidate(candidate.value.id);
    if (res.success) {
      ElMessage.success('删除成功');
      router.push('/candidates');
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

// 推进流程
const advanceDialogVisible = ref(false);
const advanceSubmitting = ref(false);
const advanceFormRef = ref<FormInstance>();
const stageOrder = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'];

const availableStages = computed(() => {
  if (!candidate.value) return [];
  const currentIndex = stageOrder.indexOf(candidate.value.currentStage);
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

async function fetchTags() {
  try {
    const res = await getTags();
    if (res.success) {
      tagOptions.value = res.data;
    }
  } catch {
    // 静默失败
  }
}

async function handleAddTag(tagId: string) {
  if (!tagId || !candidate.value) return;
  const currentTagIds = (candidate.value.tags || []).map((t) => t.id);
  if (currentTagIds.includes(tagId)) return;
  try {
    const res = await setCandidateTags(candidateId, { tagIds: [...currentTagIds, tagId] });
    if (res.success) {
      candidate.value.tags = res.data;
      ElMessage.success('标签添加成功');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '添加标签失败');
  } finally {
    tagSelectValue.value = '';
  }
}

async function handleRemoveTag(tagId: string) {
  if (!candidate.value) return;
  const currentTagIds = (candidate.value.tags || []).map((t) => t.id);
  try {
    const res = await setCandidateTags(
      candidateId,
      { tagIds: currentTagIds.filter((id) => id !== tagId) }
    );
    if (res.success) {
      candidate.value.tags = res.data;
      ElMessage.success('标签移除成功');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '移除标签失败');
  }
}

// 方法
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  if (!candidate.value) return;
  advanceForm.stage = candidate.value.currentStage as any;
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
    router.push(`/offers/${candidateId}`);
  }
}

// ============ 发送邮件 ============
const emailDialogVisible = ref(false);
const emailTemplates = ref<EmailTemplate[]>([]);
const selectedTemplateId = ref('');
const emailSubject = ref('');
const emailBody = ref('');
const emailSubmitting = ref(false);

function showSendEmail() {
  selectedTemplateId.value = '';
  emailSubject.value = '';
  emailBody.value = '';
  fetchEmailTemplates();
  emailDialogVisible.value = true;
}

async function fetchEmailTemplates() {
  try {
    const res = await getEmailTemplates();
    if (res.success) emailTemplates.value = res.data;
  } catch {
    // 静默失败
  }
}

function handleTemplateChange(id: string) {
  const tpl = emailTemplates.value.find((t) => t.id === id);
  if (tpl && candidate.value) {
    const vars: Record<string, string> = {
      candidateName: candidate.value.name,
      currentStage: candidate.value.currentStage,
    };
    emailSubject.value = tpl.subject.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] || `{{${k}}}`);
    emailBody.value = tpl.body.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] || `{{${k}}}`);
  }
}

async function handleSendEmail() {
  if (!candidate.value) return;
  if (!emailSubject.value || !emailBody.value) {
    ElMessage.warning('请填写邮件主题和正文');
    return;
  }
  emailSubmitting.value = true;
  try {
    const res = await sendEmail({
      to: candidate.value.email,
      subject: emailSubject.value,
      body: emailBody.value,
      candidateId: candidate.value.id,
      templateId: selectedTemplateId.value || undefined,
    });
    if (res.success) {
      ElMessage.success('邮件发送成功');
      emailDialogVisible.value = false;
    }
  } catch (error: any) {
    ElMessage.error(error.message || '发送失败');
  } finally {
    emailSubmitting.value = false;
  }
}

async function fetchOnboardingTasks() {
  try {
    const res = await getTasksByCandidate(candidateId);
    if (res.success) onboardingTasks.value = res.data;
  } catch {
    // 静默失败
  }
}

async function generateOnboardingTasks() {
  try {
    const res = await generateDefaultTasks(candidateId);
    if (res.success) {
      ElMessage.success('标准任务已生成');
      onboardingTasks.value = res.data;
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败');
  }
}

async function toggleTaskStatus(taskId: string, completed: boolean) {
  try {
    const res = await updateTask(taskId, { status: completed ? 'completed' : 'pending' });
    if (res.success) {
      const idx = onboardingTasks.value.findIndex((t) => t.id === taskId);
      if (idx !== -1) onboardingTasks.value[idx] = res.data;
    }
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败');
  }
}

// 获取候选人的面试安排
async function fetchCandidateInterviews() {
  if (!candidateId) return;
  try {
    const res = await getCandidateInterviews(candidateId) as any;
    if (res.success) {
      candidateInterviews.value = res.data || [];
    }
  } catch { /* ignore */ }
}

// 获取候选人的沟通记录
async function fetchCandidateCommunications() {
  if (!candidateId) return;
  try {
    const res = await getCandidateCommunications(candidateId) as any;
    if (res.success) {
      candidateCommunications.value = res.data || [];
    }
  } catch { /* ignore */ }
}

// 添加沟通记录
function handleAddCommunication() {
  commForm.type = '电话';
  commForm.content = '';
  commForm.result = '';
  commForm.followUpAt = '';
  commDialogVisible.value = true;
}

async function handleCommSubmit() {
  const valid = await commFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  commSubmitting.value = true;
  try {
    await createCommunication({
      candidateId: candidateId!,
      type: commForm.type,
      content: commForm.content,
      result: commForm.result || undefined,
      followUpAt: commForm.followUpAt || undefined,
    });
    ElMessage.success('沟通记录已添加');
    commDialogVisible.value = false;
    fetchCandidateCommunications();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || error.message || '添加失败');
  } finally {
    commSubmitting.value = false;
  }
}

// 安排面试（跳转到面试管理页面）
function handleScheduleInterview() {
  router.push('/interviews');
}

function getInterviewStatusType(status: string): string {
  return { 'scheduled': 'primary', 'completed': 'success', 'cancelled': 'info', 'no_show': 'danger' }[status] || 'info';
}

function getInterviewStatusText(status: string): string {
  return { 'scheduled': '待进行', 'completed': '已完成', 'cancelled': '已取消', 'no_show': '未到' }[status] || status;
}

onMounted(() => {
  fetchTags();
  fetchCandidateDetail();
  fetchOnboardingTasks();
  fetchCandidateInterviews();
  fetchCandidateCommunications();
});

onActivated(() => {
  fetchCandidateDetail();
  fetchOnboardingTasks();
  fetchCandidateInterviews();
  fetchCandidateCommunications();
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

    .header-actions {
      display: flex;
      gap: 8px;
    }
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

    .tags-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ebeef5;

      h4 {
        margin: 0 0 10px;
        font-size: 14px;
        color: #606266;
      }

      .tag-editor {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .detail-tag {
        color: #fff;
        border: none;
      }
    }

    .skills-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ebeef5;

      h4 {
        margin: 0 0 10px;
        font-size: 14px;
        color: #606266;
      }

      .skills-wrapper {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .skill-tag {
        margin: 0;
      }
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
        word-break: break-all;
        overflow-wrap: break-word;
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

  .onboarding-card {
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 10px;

      .task-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background-color: #f5f7fa;
        border-radius: 6px;

        .task-completed {
          text-decoration: line-through;
          color: #909399;
        }
      }
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

  .interview-card {
    margin-top: 16px;
    .interview-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      .interview-item {
        padding: 12px;
        background: #f5f7fa;
        border-radius: 8px;
        .interview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .interview-detail {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
          color: #606266;
          .detail-row {
            display: flex;
            align-items: center;
            gap: 6px;
          }
        }
        .interview-notes {
          margin-top: 8px;
          font-size: 13px;
          color: #909399;
          border-top: 1px dashed #dcdfe6;
          padding-top: 8px;
        }
      }
    }
  }

  .communication-card {
    margin-top: 16px;
    .communication-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      .communication-item {
        padding: 12px;
        background: #f5f7fa;
        border-radius: 8px;
        .comm-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
          .comm-time { font-size: 12px; color: #909399; }
          .comm-author { font-size: 12px; color: #909399; margin-left: auto; }
        }
        .comm-content { color: #303133; line-height: 1.6; }
        .comm-result { margin-top: 4px; font-size: 13px; color: #67c23a; }
        .comm-followup {
          margin-top: 4px;
          font-size: 13px;
          color: #e6a23c;
          display: flex;
          align-items: center;
          gap: 4px;
        }
      }
    }
  }
}
</style>
