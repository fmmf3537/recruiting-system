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
              <el-tag :type="getResultType(offer.result)" size="large" effect="dark">
                {{ getResultText(offer.result) }}
              </el-tag>
              <el-tag v-if="offer.joined" type="success" size="large" effect="dark">
                已入职
              </el-tag>
            </div>
          </div>
          <div class="action-buttons">
            <el-button
              v-if="offer.result === 'pending'"
              type="success"
              @click="handleAccept"
            >
              <el-icon><Check /></el-icon>接受 Offer
            </el-button>
            <el-button
              v-if="offer.result === 'pending'"
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
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Check, Close, CircleCheck, Edit, UserFilled } from '@element-plus/icons-vue';
import {
  getOfferByCandidateId,
  updateOffer,
  updateOfferResult,
  markAsJoined,
  type OfferDetail,
  type OfferResult,
  type UpdateOfferParams,
} from '@/api/offer';

const route = useRoute();
const router = useRouter();
const candidateId = route.params.id as string;

const loading = ref(false);
const offer = ref<OfferDetail | null>(null);
const noOffer = ref(false);

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
