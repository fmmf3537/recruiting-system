<template>
  <div class="candidate-detail-page">
    <template v-if="candidate">
      <!-- A. 候选人头部带 -->
      <CandidateHeaderBand
        :candidate="candidate"
        :can-advance="canAdvance"
        :can-delete="canDelete"
        @back="goToList"
        @edit="handleEdit"
        @advance="handleAdvance"
        @email="showSendEmail"
        @delete="handleDelete"
      />

      <!-- B. 下一步行动条（状态机驱动） -->
      <NextActionBanner :action="nextAction" @primary="handleNextAction" />

      <!-- C. Pipeline 横向步骤条 -->
      <PipelineStepper
        :steps="stepperSteps"
        :current-index="currentStageIndex"
        @select="handleStepSelect"
      />

      <div class="main-grid">
        <!-- 左轨：联系与归属 / 标签与技能 / 简历（内嵌预览） -->
        <aside class="left-rail">
          <el-card shadow="never" class="rail-card">
            <template #header>
              <div class="rail-card-header">
                <span>联系与归属</span>
                <el-button type="primary" link size="small" @click="handleEdit">编辑</el-button>
              </div>
            </template>
            <div class="rail-item">
              <div class="k">手机号</div>
              <div class="v">{{ candidate.phone || '未填写' }}</div>
            </div>
            <div class="rail-item">
              <div class="k">邮箱</div>
              <div class="v">{{ candidate.email || '未填写' }}</div>
            </div>
            <div class="rail-item">
              <div class="k">授权状态</div>
              <div class="v" :class="candidate.consentAt ? 'is-authorized' : 'is-unauthorized'">
                {{ candidate.consentAt ? `已授权（${formatDate(candidate.consentAt)}）` : '未授权' }}
              </div>
            </div>
            <div v-if="candidate.consentNote" class="rail-item">
              <div class="k">授权备注</div>
              <div class="v consent-note">{{ candidate.consentNote }}</div>
            </div>
          </el-card>

          <el-card shadow="never" class="rail-card">
            <template #header><span>标签与技能</span></template>
            <div class="tag-editor">
              <el-tag
                v-for="tag in candidate.tags || []"
                :key="tag.id"
                size="small"
                :color="tag.color"
                effect="light"
                closable
                class="detail-tag"
                @close="handleRemoveTag(tag.id)"
              >
                {{ tag.name }}
              </el-tag>
              <el-select
                v-model="tagSelectValue"
                placeholder="+ 添加标签"
                size="small"
                clearable
                class="tag-select"
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
            <div v-if="candidate.skills?.length" class="skills-block">
              <div class="k">技能</div>
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
          </el-card>

          <el-card shadow="never" class="rail-card">
            <template #header><span>简历</span></template>
            <div v-if="candidate.resumeUrl" class="resume-block">
              <button type="button" class="resume-inline" @click="showResumePreview = !showResumePreview">
                <el-icon><Document /></el-icon>
                <span class="resume-name">候选人简历</span>
                <span class="resume-toggle">{{ showResumePreview ? '收起 ▴' : '内嵌预览 ▾' }}</span>
              </button>
              <!-- 内嵌预览：resolveFileUrl 附带 ?token=，iframe 可直接加载 -->
              <iframe
                v-if="showResumePreview"
                :src="resumeDownloadUrl"
                class="resume-frame"
                title="简历预览"
              ></iframe>
              <div class="resume-links">
                <el-link
                  :href="resumeDownloadUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  type="primary"
                  @click="handleResumeView"
                >
                  下载
                </el-link>
                <el-button type="primary" link size="small" @click="showResumeUpload = true">
                  重新解析
                </el-button>
              </div>
            </div>
            <el-empty v-else description="暂无简历附件" :image-size="50" />
          </el-card>
        </aside>

        <!-- 主区：Tab 化内容 -->
        <section class="center-card">
          <div class="tabs">
            <button
              v-for="t in tabDefs"
              :key="t.key"
              type="button"
              class="tab"
              :class="{ active: activeTab === t.key }"
              @click="activeTab = t.key"
            >
              {{ t.label }}
              <span v-if="t.dot" class="tab-dot"></span>
            </button>
          </div>

          <div class="tab-body">
            <!-- 人才档案 -->
            <div v-show="activeTab === 'profile'" class="tab-pane">
              <CandidateProfilePanel :candidate="candidate" />
            </div>
            <!-- 面试评估 -->
            <div v-show="activeTab === 'interview'" class="tab-pane">
              <CandidateInterviewsPanel
                :interviews="candidateInterviews"
                :feedbacks="candidate.interviewFeedbacks || []"
                :evaluations-map="evaluationsMap"
                :can-manage="canManageInterview"
                :load-error="interviewsLoadError"
                @schedule="handleScheduleInterview"
                @view="handleViewInterview"
                @edit="handleEditInterview"
                @cancel="handleCancelInterview"
                @add-feedback="handleAddFeedback"
                @retry="fetchCandidateInterviews"
              />
            </div>
            <!-- 沟通记录 -->
            <div v-show="activeTab === 'comm'" class="tab-pane">
              <CandidateCommunicationsPanel
                :communications="candidateCommunications"
                :load-error="communicationsLoadError"
                @add="handleAddCommunication"
                @retry="fetchCandidateCommunications"
              />
            </div>
            <!-- Offer · 入职 -->
            <div v-show="activeTab === 'offer'" class="tab-pane">
              <CandidateOfferPanel
                :offer="candidate.offer"
                :candidate-name="candidate.name"
                :can-create-offer="canCreateOffer"
                :onboarding-tasks="onboardingTasks"
                :tasks-load-error="onboardingLoadError"
                @create-offer="handleCreateOffer"
                @view-offer="handleViewOffer"
                @generate-tasks="generateOnboardingTasks"
                @toggle-task="toggleTaskStatus"
                @retry-tasks="fetchOnboardingTasks"
              />
            </div>
          </div>
        </section>

        <!-- 右轨：招聘进展 + AI 匹配 -->
        <aside class="right-rail">
          <el-card shadow="never" class="rail-card">
            <template #header>
              <div class="rail-card-header">
                <span>招聘进展</span>
                <span class="stage-count">共 {{ pipelineProgress.length }} 个阶段</span>
              </div>
            </template>
            <el-alert v-if="pipelineLoadError" type="error" :closable="false" show-icon>
              <template #title>
                招聘流程加载失败
                <el-button link type="primary" @click="fetchPipelineStages(candidate.id)">重新加载</el-button>
              </template>
            </el-alert>
            <el-empty v-else-if="!pipelineProgress.length" description="暂无招聘流程" :image-size="60" />
            <el-timeline v-else>
              <el-timeline-item
                v-for="item in pipelineProgress"
                :key="item.stage"
                :type="item.record ? getTimelineType(item.record.status) : 'info'"
                :color="item.record ? getTimelineColor(item.record.status) : '#cbd7e6'"
                :timestamp="item.record ? formatDate(item.record.enteredAt) : '完成上一阶段后开放'"
                placement="top"
              >
                <div class="timeline-header">
                  <span class="stage-name" :class="{ 'future-stage': !item.record }">{{ item.stage }}</span>
                  <el-tag v-if="item.record" :type="getStatusType(item.record.status)" size="small">
                    {{ getStatusText(item.record.status) }}
                  </el-tag>
                  <el-tag v-else size="small" type="info">未开放</el-tag>
                </div>
                <div v-if="item.record?.assignee" class="timeline-sub">负责人：{{ item.record.assignee.name }}</div>
                <div v-if="item.record?.rejectReason" class="timeline-reject">
                  淘汰原因：{{ item.record.rejectReason }}
                </div>
                <div v-if="item.record?.note" class="timeline-sub">{{ item.record.note }}</div>
              </el-timeline-item>
            </el-timeline>
          </el-card>

          <MatchScoreCard :candidate-id="candidate.id" :candidate-jobs="candidate.jobs" />
        </aside>
      </div>
    </template>

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
          <el-select
            v-model="selectedTemplateId"
            placeholder="可选"
            clearable
            style="width: 100%"
            @change="handleTemplateChange"
          >
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
        <el-button type="primary" :loading="emailSubmitting" @click="handleSendEmail">发送</el-button>
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
        <el-form-item
          v-if="isInterviewStage(advanceForm.stage) && advanceForm.status !== 'rejected'"
          label="下一步"
        >
          <el-checkbox v-model="scheduleAfterAdvance">推进后立即安排面试</el-checkbox>
          <div class="form-tip">阶段保存成功后会打开已预填候选人的面试安排表单。</div>
        </el-form-item>
        <el-form-item v-if="advanceForm.status === 'rejected'" label="淘汰原因" prop="rejectReason">
          <el-input v-model="advanceForm.rejectReason" type="textarea" :rows="3" placeholder="请填写淘汰原因" />
        </el-form-item>
        <el-form-item label="备注" prop="note">
          <el-input v-model="advanceForm.note" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="advanceDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="advanceSubmitting" @click="handleAdvanceSubmit">确认推进</el-button>
      </template>
    </el-dialog>

    <!-- 补录历史面试反馈对话框 -->
    <el-dialog v-model="feedbackDialogVisible" title="补录历史面试反馈" width="500px">
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
          <el-date-picker
            v-model="feedbackForm.interviewTime"
            type="datetime"
            placeholder="选择面试时间"
            style="width: 100%"
          />
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
        <el-form-item v-if="feedbackForm.conclusion === 'reject'" label="淘汰原因" prop="rejectReason">
          <el-input v-model="feedbackForm.rejectReason" type="textarea" :rows="2" placeholder="请填写淘汰原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="feedbackDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="feedbackSubmitting" @click="handleFeedbackSubmit">确认添加</el-button>
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
        <el-button type="primary" :loading="commSubmitting" @click="handleCommSubmit">确认添加</el-button>
      </template>
    </el-dialog>

    <!-- 本页内嵌安排面试（预填当前候选人，不再跳列表页） -->
    <ScheduleInterviewDialog
      v-model="scheduleDialogVisible"
      :initial-candidate-id="candidateId"
      :initial-candidate-name="candidate?.name"
      :interview="editingInterview"
      @scheduled="fetchCandidateInterviews"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Document } from '@element-plus/icons-vue';
import {
  getCandidateById,
  advanceStage,
  addInterviewFeedback,
  deleteCandidate,
  logResumeView,
  type CandidateDetail,
  type AdvanceStageParams,
  type InterviewFeedbackParams,
  type ResumeParseResult,
} from '@/api/candidate';
import { getPipelineStages } from '@/api/pipeline-template';
import { getTags, setCandidateTags, type Tag } from '@/api/tag';
import { getEmailTemplates, sendEmail, type EmailTemplate } from '@/api/email';
import { getTasksByCandidate, updateTask, generateDefaultTasks, type OnboardingTask } from '@/api/onboarding-task';
import { getCandidateInterviews, cancelInterview, type InterviewItem } from '@/api/interview';
import { getCandidateCommunications, createCommunication, type CommunicationItem } from '@/api/communication';
import { getInterviewEvaluations, type InterviewEvaluationItem } from '@/api/evaluation';
import { useAuthStore } from '@/stores/auth';
import { resolveFileUrl } from '@/utils/file';
import { useResumeParserStore } from '@/stores/resumeParser';
import MatchScoreCard from '@/components/candidates/MatchScoreCard.vue';
import ScheduleInterviewDialog from '@/components/interviews/ScheduleInterviewDialog.vue';
import CandidateHeaderBand from '@/components/candidates/detail/CandidateHeaderBand.vue';
import NextActionBanner from '@/components/candidates/detail/NextActionBanner.vue';
import PipelineStepper from '@/components/candidates/detail/PipelineStepper.vue';
import CandidateProfilePanel from '@/components/candidates/detail/CandidateProfilePanel.vue';
import CandidateInterviewsPanel from '@/components/candidates/detail/CandidateInterviewsPanel.vue';
import CandidateCommunicationsPanel from '@/components/candidates/detail/CandidateCommunicationsPanel.vue';
import CandidateOfferPanel from '@/components/candidates/detail/CandidateOfferPanel.vue';
import { useCandidateNextAction } from '@/components/candidates/detail/useCandidateNextAction';
import ResumeUpload from './ResumeUpload.vue';

const route = useRoute();
const router = useRouter();
const candidateId = route.params.id as string;
const authStore = useAuthStore();
const resumeParserStore = useResumeParserStore();

const candidate = ref<CandidateDetail | null>(null);
const resumeDownloadUrl = computed(() =>
  candidate.value?.resumeUrl ? resolveFileUrl(candidate.value.resumeUrl) : ''
);
const loading = ref(false);
const notFound = ref(false);
const showResumeUpload = ref(false);
const showResumePreview = ref(false);
const tagOptions = ref<Tag[]>([]);
const onboardingTasks = ref<OnboardingTask[]>([]);
const pipelineLoadError = ref(false);
const onboardingLoadError = ref(false);
const interviewsLoadError = ref(false);
const communicationsLoadError = ref(false);
const tagSelectValue = ref('');

// 面试安排
const candidateInterviews = ref<InterviewItem[]>([]);
// 面试 ID → 该场所有面试官结构化评估（详情页聚合展示用）
const evaluationsMap = ref<Map<string, InterviewEvaluationItem[]>>(new Map());
const scheduleDialogVisible = ref(false);
const editingInterview = ref<InterviewItem | null>(null);

const canManageInterview = computed(() => {
  const raw = authStore.userInfo?.role;
  const role = raw === 'member' ? 'hr' : raw;
  return role === 'admin' || role === 'hr';
});

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

// 简历预览/下载：写入 resume_view 审计日志（发后即忘，不影响下载）
function handleResumeView() {
  logResumeView(candidateId).catch((e) => console.error('简历查看日志记录失败:', e));
}

// 计算是否可推进
const canAdvance = computed(() => {
  if (!candidate.value) return false;
  return candidate.value.stageStatus !== 'rejected' && candidate.value.currentStage !== '入职';
});

// 当前阶段为 Offer 且尚无 Offer 记录时可创建
const canCreateOffer = computed(() => {
  if (!candidate.value) return false;
  return candidate.value.currentStage.includes('Offer') && !candidate.value.offer;
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

// 通用格式化与状态映射（纯函数，提前定义供下方计算属性使用）
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function getStatusType(status: string): string {
  return { in_progress: 'warning', passed: 'success', rejected: 'danger' }[status] || 'info';
}

function getStatusText(status: string): string {
  return { in_progress: '进行中', passed: '已通过', rejected: '已淘汰' }[status] || status;
}

function getTimelineType(status: string): any {
  return { passed: 'success', rejected: 'danger', in_progress: 'primary' }[status] || '';
}

function getTimelineColor(status: string): string {
  return { passed: '#67c23a', rejected: '#f56c6c', in_progress: '#409eff' }[status] || '';
}

function handleEdit() {
  router.push(`/candidates/${candidateId}/edit`);
}

function goToList() {
  router.push('/candidates');
}

// ============ 「下一步行动」状态机 与 Tab 聚焦 ============
const { nextAction, defaultTab } = useCandidateNextAction(candidate, candidateInterviews, evaluationsMap);

const activeTab = ref('profile');
const tabInitialized = ref(false);
// Tab 定义：红点 = 与该候选人当前最紧迫事项相关
const tabDefs = computed(() => [
  { key: 'profile', label: '人才档案', dot: false },
  {
    key: 'interview',
    label: '面试评估',
    dot: ['schedule-interview', 'pending-evaluations'].includes(nextAction.value.kind),
  },
  { key: 'comm', label: '沟通记录', dot: false },
  { key: 'offer', label: 'Offer · 入职', dot: nextAction.value.kind.startsWith('offer') },
]);

// 推进流程
const advanceDialogVisible = ref(false);
const advanceSubmitting = ref(false);
const advanceFormRef = ref<FormInstance>();
const scheduleAfterAdvance = ref(false);
// 阶段选项不再硬编码：按候选人适用职位的 Pipeline 模板动态获取
const candidateStages = ref<string[]>([]);

const pipelineProgress = computed(() => {
  if (!candidate.value) return [];
  const records = candidate.value.stageRecords || [];
  const fallbackStages = [...records].reverse().map((record) => record.stage);
  const stages = candidateStages.value.length ? candidateStages.value : fallbackStages;
  return [...new Set(stages)].map((stage) => ({
    stage,
    record: records.find((record) => record.stage === stage),
    isCurrent: candidate.value?.currentStage === stage,
  }));
});

// 步骤条数据：阶段名 + 进入日期
const stepperSteps = computed(() =>
  pipelineProgress.value.map((item) => ({
    stage: item.stage,
    date: item.record ? formatDate(item.record.enteredAt) : '',
  }))
);

const currentStageIndex = computed(() => {
  const idx = candidateStages.value.indexOf(candidate.value?.currentStage || '');
  if (idx !== -1) return idx;
  const fallback = pipelineProgress.value.findIndex((item) => item.isCurrent);
  return fallback === -1 ? 0 : fallback;
});

// 点击步骤条跳转对应内容 Tab
function handleStepSelect(index: number) {
  const stage = stepperSteps.value[index]?.stage || '';
  if (stage.includes('面')) {
    activeTab.value = 'interview';
  } else if (stage.includes('Offer') || stage.includes('入职')) {
    activeTab.value = 'offer';
  } else {
    activeTab.value = 'profile';
  }
}

const availableStages = computed(() => {
  if (!candidate.value) return [];
  const currentIndex = candidateStages.value.indexOf(candidate.value.currentStage);
  if (authStore.isAdmin) {
    return candidateStages.value;
  }
  const stages: string[] = [];
  // 存量老阶段可能不在模板中（index=-1），此时仅提供模板第一个阶段作为推进目标
  const current = candidateStages.value[currentIndex];
  if (current) stages.push(current);
  const nextStage = candidateStages.value[currentIndex + 1];
  if (nextStage) stages.push(nextStage);
  return stages;
});

const advanceForm = reactive<AdvanceStageParams>({
  stage: '',
  status: 'passed',
  rejectReason: '',
  note: '',
});

const advanceRules: FormRules = {
  stage: [{ required: true, message: '请选择目标阶段', trigger: 'change' }],
  status: [{ required: true, message: '请选择阶段结果', trigger: 'change' }],
  rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }],
};

function isInterviewStage(stage: string): boolean {
  return stage.includes('面');
}

// ============ 数据获取 ============
async function fetchPipelineStages(targetCandidateId: string) {
  pipelineLoadError.value = false;
  try {
    const res = await getPipelineStages(targetCandidateId, { silentError: true });
    candidateStages.value = res.data;
  } catch {
    candidateStages.value = [];
    pipelineLoadError.value = true;
  }
}

// 并行拉取每场的结构化评估（单场失败不阻塞整体）
async function fetchInterviewEvaluations(interviews: InterviewItem[]) {
  const map = new Map<string, InterviewEvaluationItem[]>();
  await Promise.all(
    interviews.map(async (iv) => {
      try {
        const res = await getInterviewEvaluations(iv.id);
        map.set(iv.id, res.data || []);
      } catch {
        // 单场评估加载失败不阻塞整体
      }
    })
  );
  evaluationsMap.value = map;
}

async function fetchCandidateDetail() {
  loading.value = true;
  notFound.value = false;
  try {
    const res = await getCandidateById(candidateId);
    if (res.success) {
      candidate.value = res.data;
      fetchPipelineStages(res.data.id);
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

// 获取候选人的面试安排，并拉取每场的结构化评估
async function fetchCandidateInterviews() {
  if (!candidateId) return;
  interviewsLoadError.value = false;
  try {
    const res = await getCandidateInterviews(candidateId, { silentError: true }) as any;
    if (res.success) {
      candidateInterviews.value = res.data || [];
      fetchInterviewEvaluations(candidateInterviews.value);
    }
  } catch {
    interviewsLoadError.value = true;
  }
}

async function fetchOnboardingTasks() {
  onboardingLoadError.value = false;
  try {
    const res = await getTasksByCandidate(candidateId, { silentError: true });
    if (res.success) onboardingTasks.value = res.data;
  } catch {
    onboardingLoadError.value = true;
  }
}

// 获取候选人的沟通记录
async function fetchCandidateCommunications() {
  if (!candidateId) return;
  communicationsLoadError.value = false;
  try {
    const res = await getCandidateCommunications(candidateId, { silentError: true }) as any;
    if (res.success) {
      candidateCommunications.value = res.data || [];
    }
  } catch {
    communicationsLoadError.value = true;
  }
}

async function fetchTags() {
  try {
    const res = await getTags(undefined, { silentError: true });
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

// 安排面试：打开本页内嵌弹窗（预填当前候选人）
function handleScheduleInterview() {
  editingInterview.value = null;
  scheduleDialogVisible.value = true;
}

function handleViewInterview(iv: InterviewItem) {
  router.push(`/interviews/${iv.id}`);
}

function handleEditInterview(iv: InterviewItem) {
  editingInterview.value = iv;
  scheduleDialogVisible.value = true;
}

async function handleCancelInterview(iv: InterviewItem) {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入取消原因', '取消面试', {
      type: 'warning',
      inputPlaceholder: '取消原因（可选）',
      inputType: 'text',
    }) as { value: string };
    await cancelInterview(iv.id, reason || undefined);
    ElMessage.success('面试已取消');
    fetchCandidateInterviews();
  } catch {
    /* 用户关闭确认框 */
  }
}

function handleAdvance() {
  if (!candidate.value) return;
  advanceForm.stage = candidate.value.currentStage;
  advanceForm.status = 'passed';
  advanceForm.rejectReason = '';
  advanceForm.note = '';
  scheduleAfterAdvance.value = false;
  advanceDialogVisible.value = true;
  // 拉取该候选人适用的 Pipeline 模板阶段（按关联职位的模板/默认模板）
  fetchPipelineStages(candidate.value.id);
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
      if (scheduleAfterAdvance.value && isInterviewStage(advanceForm.stage)) {
        handleScheduleInterview();
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '推进失败');
  } finally {
    advanceSubmitting.value = false;
  }
}

// ============ 面试反馈（补录历史） ============
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

// ============ Offer ============
function handleCreateOffer() {
  router.push(`/offers/create?candidateId=${candidateId}`);
}

function handleViewOffer() {
  if (candidate.value?.offer) {
    router.push(`/offers/${candidateId}`);
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

// ============ 发送邮件 ============
const emailDialogVisible = ref(false);
const emailTemplates = ref<EmailTemplate[]>([]);
const selectedTemplateId = ref('');
const emailSubject = ref('');
const emailBody = ref('');
const emailSubmitting = ref(false);

async function fetchEmailTemplates() {
  try {
    const res = await getEmailTemplates();
    if (res.success) emailTemplates.value = res.data;
  } catch {
    // 静默失败
  }
}

function showSendEmail() {
  selectedTemplateId.value = '';
  emailSubject.value = '';
  emailBody.value = '';
  fetchEmailTemplates();
  emailDialogVisible.value = true;
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

// ============ 沟通记录 ============
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

// 下一步行动条主按钮 → 对应动作
function handleNextAction() {
  switch (nextAction.value.kind) {
    case 'schedule-interview':
      handleScheduleInterview();
      break;
    case 'pending-evaluations':
      activeTab.value = 'interview';
      break;
    case 'offer-draft':
    case 'offer-approve':
      handleViewOffer();
      break;
    case 'stage-overdue':
      handleAdvance();
      break;
    default:
      break;
  }
}

// 首次加载后按状态机结果聚焦 Tab（后续刷新不打扰用户手动切换）
watch(
  defaultTab,
  (tab) => {
    if (!tabInitialized.value && candidate.value) {
      activeTab.value = tab;
      tabInitialized.value = true;
    }
  },
  { immediate: true }
);

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
  padding: 4px 0 20px;
  max-width: 1440px;
  margin: 0 auto;
}

.main-grid {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 300px;
  gap: $ui-space-md;
  margin-top: $ui-space-md;
  align-items: start;

  @media (max-width: 1200px) {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.left-rail,
.right-rail {
  display: flex;
  flex-direction: column;
  gap: $ui-space-md;
  min-width: 0;
}

@media (max-width: 1200px) {
  .right-rail {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}

@media (max-width: 900px) {
  .right-rail {
    grid-template-columns: 1fr;
  }
}

.rail-card {
  :deep(.el-card__header) {
    padding: $ui-space-sm $ui-space-lg;
    font-weight: 600;
  }

  :deep(.el-card__body) {
    padding: $ui-space-md $ui-space-lg;
  }
}

.rail-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.rail-item {
  margin-bottom: $ui-space-md;

  &:last-child {
    margin-bottom: 0;
  }

  .k {
    font-size: $ui-font-sm;
    color: $ui-gray-500;
  }

  .v {
    font-size: $ui-font-base;
    margin-top: 1px;
    word-break: break-all;
  }

  .is-authorized {
    color: $ui-color-success;
  }

  .is-unauthorized {
    color: $ui-color-danger;
  }
}

.consent-note {
  color: $ui-gray-500;
  font-size: $ui-font-sm;
}

.stage-count {
  color: $ui-gray-500;
  font-size: $ui-font-sm;
  font-weight: 400;
}

.tag-editor {
  display: flex;
  flex-wrap: wrap;
  gap: $ui-space-sm;
  align-items: center;
}

.detail-tag {
  color: #fff;
  border: none;
}

.tag-select {
  width: 110px;
}

.skills-block {
  margin-top: $ui-space-md;

  .k {
    font-size: $ui-font-sm;
    color: $ui-gray-500;
    margin-bottom: $ui-space-xs;
  }
}

.skills-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: $ui-space-sm;
}

.resume-block {
  .resume-inline {
    display: flex;
    align-items: center;
    gap: $ui-space-sm;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: $ui-font-sm;
    background: #fff;
    border: $ui-border-width solid $ui-border-color;
    border-radius: $ui-radius-sm;
    padding: $ui-space-sm $ui-space-md;
    cursor: pointer;

    &:hover {
      border-color: $ui-color-primary;
    }
  }

  .resume-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resume-toggle {
    color: $ui-color-primary;
    flex-shrink: 0;
  }

  .resume-frame {
    margin-top: $ui-space-sm;
    width: 100%;
    height: 320px;
    border: $ui-border-width solid $ui-border-color-light;
    border-radius: $ui-radius-sm;
    background: $ui-gray-50;
  }

  .resume-links {
    margin-top: $ui-space-sm;
    display: flex;
    gap: $ui-space-md;
    align-items: center;
  }
}

.center-card {
  background: #fff;
  border-radius: $ui-radius-md;
  border: $ui-border-width solid $ui-border-color-light;
  padding: 0 $ui-space-xl $ui-space-lg;
  min-width: 0;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: $ui-border-width solid $ui-border-color-light;
}

.tab {
  padding: $ui-space-md 18px;
  font-family: inherit;
  font-size: $ui-font-md;
  color: $ui-gray-700;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  position: relative;
  cursor: pointer;

  &:hover {
    color: $ui-color-primary;
  }

  &.active {
    color: $ui-color-primary;
    font-weight: 600;
    border-bottom-color: $ui-color-primary;
  }
}

.tab-dot {
  position: absolute;
  top: 10px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: $ui-color-danger;
}

.tab-body {
  padding-top: $ui-space-lg;
}

.tab-pane {
  animation: fade-in 0.2s;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
  }
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: $ui-space-sm;

  .stage-name {
    font-weight: 500;
    font-size: $ui-font-md;
  }

  .future-stage {
    color: $ui-gray-500;
  }
}

.timeline-sub {
  margin-top: 6px;
  font-size: $ui-font-sm;
  color: $ui-gray-700;
  word-break: break-all;
}

.timeline-reject {
  margin-top: 6px;
  font-size: $ui-font-sm;
  color: $ui-color-danger;
  word-break: break-all;
}

.form-tip {
  margin-top: 6px;
  color: $ui-gray-500;
  font-size: $ui-font-sm;
  line-height: 1.5;
}
</style>
