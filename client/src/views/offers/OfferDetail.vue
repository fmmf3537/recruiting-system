<template>
  <div class="offer-detail-page">
    <!-- 返回按钮 -->
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回列表
      </el-button>
    </div>

    <!-- Offer 信息卡片 -->
    <el-card class="offer-card" v-loading="loading" v-if="offer">
      <template #header>
        <div class="header-content">
          <div class="title-section">
            <h1 class="offer-title">Offer 详情</h1>
            <div class="status-tags">
              <el-tag :type="getStatusType(offer.status)" size="large" effect="dark">
                {{ getStatusText(offer.status) }}
              </el-tag>
              <el-tag :type="getResultType(offer.result)" size="large">
                {{ getResultText(offer.result) }}
              </el-tag>
              <el-tag v-if="offer.joined" type="success" size="large" effect="dark">
                已入职
              </el-tag>
            </div>
          </div>
          <div class="action-buttons">
            <!-- 审批流操作（参照 HCRequest 交互模式） -->
            <el-button
              v-if="offer.status === 'draft' || offer.status === 'rejected'"
              type="primary"
              @click="handleSubmitApproval"
            >
              <el-icon><Promotion /></el-icon>提交审批
            </el-button>
            <template v-if="offer.status === 'pending_approval' && canApprove">
              <el-button type="success" @click="handleApprove">
                <el-icon><Check /></el-icon>审批通过
              </el-button>
              <el-button type="danger" plain @click="handleRejectApproval">
                <el-icon><Close /></el-icon>驳回
              </el-button>
            </template>
            <el-button
              v-if="offer.status === 'approved'"
              type="primary"
              @click="handleMarkSent"
            >
              <el-icon><Position /></el-icon>标记已发送
            </el-button>
            <!-- 录入候选人答复：审批通过（含已发送）后才允许 -->
            <el-button
              v-if="offer.result === 'pending' && (offer.status === 'approved' || offer.status === 'sent')"
              type="success"
              @click="handleAccept"
            >
              <el-icon><Check /></el-icon>接受 Offer
            </el-button>
            <el-button
              v-if="offer.result === 'pending' && (offer.status === 'approved' || offer.status === 'sent')"
              type="danger"
              plain
              @click="handleReject"
            >
              <el-icon><Close /></el-icon>拒绝 Offer
            </el-button>
            <el-button
              v-if="offer.result === 'accepted' && !offer.joined"
              type="primary"
              @click="handleMarkJoined"
            >
              <el-icon><CircleCheck /></el-icon>标记入职
            </el-button>
            <el-button @click="handleEdit">
              <el-icon><Edit /></el-icon>编辑
            </el-button>
          </div>
        </div>
      </template>

      <div class="offer-content">
        <!-- 候选人信息 -->
        <div class="info-section">
          <h3 class="section-title">候选人信息</h3>
          <div class="candidate-profile">
            <el-avatar :size="64" :icon="UserFilled" />
            <div class="profile-info">
              <h4>{{ offer.candidate?.name }}</h4>
              <p>{{ offer.candidate?.phone }} | {{ offer.candidate?.email }}</p>
              <p>{{ offer.candidate?.education }} · {{ offer.candidate?.workYears ? offer.candidate?.workYears + '年经验' : '应届生' }}</p>
            </div>
          </div>
        </div>

        <el-divider />

        <!-- Offer 详情 -->
        <div class="info-section">
          <h3 class="section-title">Offer 详情</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="薪资" :span="2">
              <span class="salary-highlight">{{ offer.salary }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="Offer发放日期">
              {{ formatDate(offer.offerDate) }}
            </el-descriptions-item>
            <el-descriptions-item label="预计入职日期">
              {{ offer.expectedJoinDate ? formatDate(offer.expectedJoinDate) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="实际入职日期" v-if="offer.joined">
              {{ offer.actualJoinDate ? formatDate(offer.actualJoinDate) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="关联职位" :span="2">
              {{ offer.candidate?.candidateJobs?.[0]?.job?.title || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="审批状态">
              {{ getStatusText(offer.status) }}
            </el-descriptions-item>
            <el-descriptions-item label="审批时间" v-if="offer.approvedAt || offer.rejectedAt">
              {{ formatDateTime((offer.approvedAt || offer.rejectedAt) as string) }}
            </el-descriptions-item>
            <el-descriptions-item label="审批意见" :span="2" v-if="offer.approveNote">
              {{ offer.approveNote }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <el-divider />

        <!-- 备注 -->
        <div v-if="offer.note" class="info-section">
          <h3 class="section-title">备注说明</h3>
          <p class="note-content">{{ offer.note }}</p>
        </div>

        <!-- 操作记录 -->
        <div class="info-section">
          <h3 class="section-title">操作记录</h3>
          <el-timeline>
            <el-timeline-item
              :type="offer.joined ? 'success' : 'primary'"
              :timestamp="formatDateTime(offer.updatedAt)"
            >
              {{ offer.joined ? '已入职' : 'Offer ' + getResultText(offer.result) }}
            </el-timeline-item>
            <el-timeline-item
              type="primary"
              :timestamp="formatDateTime(offer.createdAt)"
            >
              Offer 创建
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-card>

    <el-empty v-else-if="noOffer" description="该候选人暂无 Offer">
      <el-button type="primary" @click="handleCreateOffer">创建 Offer</el-button>
    </el-empty>
    <el-empty v-else description="Offer 不存在或已被删除" />

    <!-- 提交审批对话框 -->
    <el-dialog v-model="submitDialogVisible" title="提交审批" width="500px">
      <el-form ref="submitFormRef" :model="submitForm" :rules="submitRules" label-width="100px">
        <el-form-item label="审批人" prop="approverId">
          <el-select v-model="submitForm.approverId" placeholder="请选择审批人" style="width: 100%">
            <el-option
              v-for="item in approverOptions"
              :key="item.id"
              :label="`${item.name}（${item.email}）`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="submitDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmitApprovalConfirm" :loading="submitting">提交</el-button>
      </template>
    </el-dialog>

    <!-- 审批对话框（通过/驳回共用，参照 HCRequest 审批交互） -->
    <el-dialog
      v-model="approvalDialogVisible"
      :title="approvalAction === 'approve' ? '审批通过' : '驳回 Offer'"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item :label="approvalAction === 'approve' ? '审批意见' : '驳回意见'" required>
          <el-input
            v-model="approvalNote"
            type="textarea"
            :rows="3"
            :placeholder="approvalAction === 'approve' ? '选填' : '必填'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approvalDialogVisible = false">取消</el-button>
        <el-button
          :type="approvalAction === 'approve' ? 'success' : 'danger'"
          @click="handleApprovalConfirm"
          :loading="approving"
        >
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑 Offer" width="500px">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="100px">
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
          <el-input v-model="editForm.note" type="textarea" :rows="3" />
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
        <el-form-item label="实际入职日期" prop="actualJoinDate">
          <el-date-picker v-model="joinForm.actualJoinDate" type="date" placeholder="请选择实际入职日期" style="width: 100%" />
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
import { ref, reactive, computed, onMounted, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Check, Close, CircleCheck, Edit, Position, Promotion, UserFilled } from '@element-plus/icons-vue';
import {
  getOfferByCandidateId,
  updateOffer,
  updateOfferResult,
  markAsJoined,
  submitOfferApproval,
  approveOffer,
  rejectOffer,
  markOfferSent,
  type OfferDetail,
  type OfferResult,
  type OfferStatus,
  type UpdateOfferParams,
} from '@/api/offer';
import { getApproverOptions, type ApproverOption } from '@/api/user';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const candidateId = route.params.id as string;

const loading = ref(false);
const offer = ref<OfferDetail | null>(null);
const noOffer = ref(false);

// 当前用户是否为审批人（admin 或被指定审批人可审批）
const canApprove = computed(
  () => authStore.isAdmin || authStore.userInfo?.id === offer.value?.approverId
);

// 提交审批对话框
const submitDialogVisible = ref(false);
const submitting = ref(false);
const submitFormRef = ref<FormInstance>();
const approverOptions = ref<ApproverOption[]>([]);
const submitForm = reactive({ approverId: '' });
const submitRules: FormRules = {
  approverId: [{ required: true, message: '请选择审批人', trigger: 'change' }],
};

// 审批对话框（通过/驳回共用）
const approvalDialogVisible = ref(false);
const approving = ref(false);
const approvalAction = ref<'approve' | 'reject'>('approve');
const approvalNote = ref('');

// 编辑对话框
const editDialogVisible = ref(false);
const editSubmitting = ref(false);
const editFormRef = ref<FormInstance>();
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

// 标记入职对话框
const joinDialogVisible = ref(false);
const joinSubmitting = ref(false);
const joinFormRef = ref<FormInstance>();
const joinForm = reactive({ actualJoinDate: '' });
const joinRules: FormRules = {
  actualJoinDate: [{ required: true, message: '请选择实际入职日期', trigger: 'change' }],
};

// 获取 Offer 详情
async function fetchOfferDetail() {
  loading.value = true;
  noOffer.value = false;
  try {
    const res = await getOfferByCandidateId(candidateId);
    if (res.success) {
      offer.value = res.data;
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    if (errorMsg.includes('暂无 Offer') || errorMsg.includes('暂无offer')) {
      noOffer.value = true;
    } else {
      console.error('获取Offer详情失败:', error);
      ElMessage.error('获取Offer详情失败');
    }
  } finally {
    loading.value = false;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN');
}

function getStatusType(status: OfferStatus): string {
  const map: Record<OfferStatus, string> = {
    draft: 'info',
    pending_approval: 'warning',
    approved: 'success',
    rejected: 'danger',
    sent: '',
  };
  return map[status] || 'info';
}

function getStatusText(status: OfferStatus): string {
  const map: Record<OfferStatus, string> = {
    draft: '草稿',
    pending_approval: '审批中',
    approved: '已通过',
    rejected: '已驳回',
    sent: '已发送',
  };
  return map[status] || status;
}

function getResultType(result: OfferResult): string {
  return { 'pending': 'warning', 'accepted': 'success', 'rejected': 'danger' }[result] || 'info';
}

function getResultText(result: OfferResult): string {
  return { 'pending': '待确认', 'accepted': '已接受', 'rejected': '已拒绝' }[result] || result;
}

function handleCreateOffer() {
  router.push(`/offers/create?candidateId=${candidateId}`);
}

function handleEdit() {
  if (!offer.value) return;
  editForm.salary = offer.value.salary;
  editForm.offerDate = offer.value.offerDate;
  editForm.expectedJoinDate = offer.value.expectedJoinDate || '';
  editForm.note = offer.value.note || '';
  editDialogVisible.value = true;
}

async function handleEditSubmit() {
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  editSubmitting.value = true;
  try {
    const res = await updateOffer(candidateId, { ...editForm });
    if (res.success) {
      ElMessage.success('Offer更新成功');
      editDialogVisible.value = false;
      fetchOfferDetail();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败');
  } finally {
    editSubmitting.value = false;
  }
}

// 打开提交审批对话框，并加载可选审批人
async function handleSubmitApproval() {
  submitForm.approverId = '';
  submitDialogVisible.value = true;
  try {
    const res = await getApproverOptions();
    if (res.success) {
      approverOptions.value = res.data;
    }
  } catch (error) {
    console.error('获取审批人列表失败:', error);
  }
}

async function handleSubmitApprovalConfirm() {
  const valid = await submitFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    const res = await submitOfferApproval(candidateId, submitForm.approverId);
    if (res.success) {
      ElMessage.success('已提交审批');
      submitDialogVisible.value = false;
      fetchOfferDetail();
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || error.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}

function handleApprove() {
  approvalAction.value = 'approve';
  approvalNote.value = '';
  approvalDialogVisible.value = true;
}

function handleRejectApproval() {
  approvalAction.value = 'reject';
  approvalNote.value = '';
  approvalDialogVisible.value = true;
}

async function handleApprovalConfirm() {
  // 驳回必须填写审批意见（与后端校验一致）
  if (approvalAction.value === 'reject' && !approvalNote.value.trim()) {
    ElMessage.warning('驳回必须填写审批意见');
    return;
  }
  approving.value = true;
  try {
    const res =
      approvalAction.value === 'approve'
        ? await approveOffer(candidateId, approvalNote.value || undefined)
        : await rejectOffer(candidateId, approvalNote.value);
    if (res.success) {
      ElMessage.success(approvalAction.value === 'approve' ? '审批通过' : '已驳回');
      approvalDialogVisible.value = false;
      fetchOfferDetail();
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || error.message || '操作失败');
  } finally {
    approving.value = false;
  }
}

async function handleMarkSent() {
  try {
    await ElMessageBox.confirm('确定已将 Offer 发送给候选人吗？', '标记已发送', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info',
    });
    const res = await markOfferSent(candidateId);
    if (res.success) {
      ElMessage.success('已标记为已发送');
      fetchOfferDetail();
    }
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.error || error.message || '操作失败');
  }
}

async function handleAccept() {
  try {
    await ElMessageBox.confirm('确定要接受此 Offer 吗？', '确认接受', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'success',
    });
    const res = await updateOfferResult(candidateId, { result: 'accepted' });
    if (res.success) {
      ElMessage.success('Offer已接受');
      fetchOfferDetail();
    }
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error.message || '操作失败');
  }
}

async function handleReject() {
  try {
    await ElMessageBox.confirm('确定要拒绝此 Offer 吗？', '确认拒绝', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    const res = await updateOfferResult(candidateId, { result: 'rejected' });
    if (res.success) {
      ElMessage.success('Offer已拒绝');
      fetchOfferDetail();
    }
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(error.message || '操作失败');
  }
}

function handleMarkJoined() {
  joinForm.actualJoinDate = new Date().toISOString().split('T')[0];
  joinDialogVisible.value = true;
}

async function handleJoinSubmit() {
  const valid = await joinFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  joinSubmitting.value = true;
  try {
    const res = await markAsJoined(candidateId, { actualJoinDate: joinForm.actualJoinDate });
    if (res.success) {
      ElMessage.success('入职标记成功');
      joinDialogVisible.value = false;
      fetchOfferDetail();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '标记失败');
  } finally {
    joinSubmitting.value = false;
  }
}

onMounted(() => {
  fetchOfferDetail();
});

onActivated(() => {
  fetchOfferDetail();
});
</script>

<style scoped lang="scss">
.offer-detail-page {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;

  .back-nav {
    margin-bottom: 20px;
  }

  .offer-card {
    :deep(.el-card__header) {
      background-color: #f5f7fa;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;

      .title-section {
        .offer-title {
          margin: 0 0 12px;
          font-size: 24px;
          font-weight: 600;
        }

        .status-tags {
          display: flex;
          gap: 10px;
        }
      }

      .action-buttons {
        display: flex;
        gap: 10px;
      }
    }
  }

  .offer-content {
    .info-section {
      margin-bottom: 30px;

      .section-title {
        font-size: 16px;
        font-weight: 500;
        color: #303133;
        margin: 0 0 20px;
      }

      .candidate-profile {
        display: flex;
        align-items: center;
        gap: 20px;

        .profile-info {
          h4 {
            margin: 0 0 8px;
            font-size: 18px;
          }

          p {
            margin: 0 0 4px;
            color: #606266;
            font-size: 14px;
          }
        }
      }

      .salary-highlight {
        font-size: 24px;
        font-weight: 600;
        color: #f56c6c;
      }

      .note-content {
        color: #606266;
        line-height: 1.8;
        padding: 16px;
        background-color: #f5f7fa;
        border-radius: 8px;
      }
    }
  }
}
</style>
