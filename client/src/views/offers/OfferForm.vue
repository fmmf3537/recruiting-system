<template>
  <div class="offer-form-page">
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回
      </el-button>
    </div>

    <el-card class="form-card" v-loading="loading">
      <template #header>
        <div class="card-header">
          <h2>创建 Offer</h2>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        class="offer-form"
        size="large"
      >
        <el-row :gutter="40">
          <el-col :span="14">
            <!-- 候选人信息 -->
            <div class="form-section">
              <h3 class="section-title">候选人信息</h3>
              
              <el-form-item label="选择候选人" prop="candidateId">
                <el-select
                  v-model="formData.candidateId"
                  placeholder="请选择候选人"
                  style="width: 100%"
                  filterable
                  remote
                  :remote-method="searchCandidates"
                  :loading="candidateLoading"
                  @change="handleCandidateChange"
                >
                  <el-option
                    v-for="item in candidateOptions"
                    :key="item.id"
                    :label="`${item.name} - ${item.phone}`"
                    :value="item.id"
                  >
                    <div class="candidate-option">
                      <span class="name">{{ item.name }}</span>
                      <span class="phone">{{ item.phone }}</span>
                      <el-tag size="small" :type="getStageType(item.currentStage)">
                        {{ item.currentStage }}
                      </el-tag>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <!-- 候选人详情展示 -->
              <div v-if="selectedCandidate" class="candidate-preview">
                <el-descriptions :column="2" border>
                  <el-descriptions-item label="姓名">{{ selectedCandidate.name }}</el-descriptions-item>
                  <el-descriptions-item label="性别">{{ selectedCandidate.gender }}</el-descriptions-item>
                  <el-descriptions-item label="手机号">{{ selectedCandidate.phone }}</el-descriptions-item>
                  <el-descriptions-item label="邮箱">{{ selectedCandidate.email }}</el-descriptions-item>
                  <el-descriptions-item label="学历">{{ selectedCandidate.education || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="工作年限">{{ selectedCandidate.workYears ? selectedCandidate.workYears + '年' : '-' }}</el-descriptions-item>
                  <el-descriptions-item label="当前公司" :span="2">{{ selectedCandidate.currentCompany || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="当前职位" :span="2">{{ selectedCandidate.currentPosition || '-' }}</el-descriptions-item>
                </el-descriptions>
              </div>
            </div>

            <!-- Offer 信息 -->
            <div class="form-section">
              <h3 class="section-title">Offer 信息</h3>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="薪资" prop="salary">
                    <el-input v-model="formData.salary" placeholder="如：30k、40k-50k">
                      <template #suffix>税前</template>
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="股票/期权" prop="stock">
                    <el-input v-model="formData.stock" placeholder="选填，如：1000股">
                    </el-input>
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="Offer日期" prop="offerDate">
                    <el-date-picker
                      v-model="formData.offerDate"
                      type="date"
                      placeholder="选择Offer发放日期"
                      style="width: 100%"
                      value-format="YYYY-MM-DD"
                    />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="预计入职" prop="expectedJoinDate">
                    <el-date-picker
                      v-model="formData.expectedJoinDate"
                      type="date"
                      placeholder="选择预计入职日期"
                      style="width: 100%"
                      value-format="YYYY-MM-DD"
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="试用期" prop="probation">
                    <el-select v-model="formData.probation" placeholder="请选择试用期" style="width: 100%">
                      <el-option label="无试用期" :value="0" />
                      <el-option label="1个月" :value="1" />
                      <el-option label="2个月" :value="2" />
                      <el-option label="3个月" :value="3" />
                      <el-option label="6个月" :value="6" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="工作年限" prop="workYears">
                    <el-input-number v-model="formData.workYears" :min="0" :max="50" style="width: 100%" placeholder="年" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="汇报对象" prop="reportTo">
                <el-input v-model="formData.reportTo" placeholder="选填，如：技术总监" />
              </el-form-item>

              <el-form-item label="工作地点" prop="workLocation">
                <el-input v-model="formData.workLocation" placeholder="选填，如：北京总部" />
              </el-form-item>
            </div>
          </el-col>

          <el-col :span="10">
            <!-- 职位信息 -->
            <div class="form-section">
              <h3 class="section-title">职位信息</h3>
              <el-form-item label="关联职位" prop="jobId">
                <el-select v-model="formData.jobId" placeholder="请选择关联职位" style="width: 100%">
                  <el-option
                    v-for="job in jobList"
                    :key="job.id"
                    :label="job.title"
                    :value="job.id"
                  />
                </el-select>
              </el-form-item>
            </div>

            <!-- 其他福利 -->
            <div class="form-section">
              <h3 class="section-title">福利待遇</h3>
              <el-form-item label="五险一金" prop="insurance">
                <el-radio-group v-model="formData.insurance">
                  <el-radio label="全额缴纳">全额缴纳</el-radio>
                  <el-radio label="按基数缴纳">按基数缴纳</el-radio>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="其他福利" prop="benefits">
                <el-checkbox-group v-model="formData.benefits">
                  <el-checkbox label="餐补">餐补</el-checkbox>
                  <el-checkbox label="交通补">交通补</el-checkbox>
                  <el-checkbox label="通讯补">通讯补</el-checkbox>
                  <el-checkbox label="补充医疗">补充医疗</el-checkbox>
                  <el-checkbox label="年度体检">年度体检</el-checkbox>
                  <el-checkbox label="带薪年假">带薪年假</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
            </div>

            <!-- 备注说明 -->
            <div class="form-section">
              <h3 class="section-title">备注说明</h3>
              <el-form-item prop="note" label-width="0">
                <el-input
                  v-model="formData.note"
                  type="textarea"
                  :rows="6"
                  placeholder="请填写Offer的特殊说明、注意事项等..."
                  maxlength="1000"
                  show-word-limit
                />
              </el-form-item>
            </div>

            <!-- 操作按钮 -->
            <div class="form-actions">
              <el-button type="primary" size="large" @click="handleSubmit" :loading="submitting" style="width: 100%">
                创建 Offer
              </el-button>
              <el-button size="large" @click="$router.back()" style="width: 100%; margin-top: 10px; margin-left: 0">
                取消
              </el-button>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft } from '@element-plus/icons-vue';
import { createOffer, type CreateOfferParams } from '@/api/offer';
import { getCandidateList, type CandidateItem } from '@/api/candidate';
import { getJobList, type JobItem } from '@/api/job';

const route = useRoute();
const router = useRouter();

// 从URL参数获取候选人ID
const initialCandidateId = route.query.candidateId as string;

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const candidateOptions = ref<CandidateItem[]>([]);
const selectedCandidate = ref<CandidateItem | null>(null);
const candidateLoading = ref(false);
const jobList = ref<JobItem[]>([]);

const formData = reactive<CreateOfferParams & { 
  stock: string;
  probation: number;
  reportTo: string;
  workLocation: string;
  insurance: string;
  benefits: string[];
  jobId: string;
}>({
  candidateId: initialCandidateId || '',
  salary: '',
  stock: '',
  offerDate: new Date().toISOString().split('T')[0],
  expectedJoinDate: '',
  probation: 3,
  reportTo: '',
  workLocation: '',
  workYears: 0,
  insurance: '全额缴纳',
  benefits: [],
  jobId: '',
  note: '',
});

const formRules: FormRules = {
  candidateId: [{ required: true, message: '请选择候选人', trigger: 'change' }],
  salary: [{ required: true, message: '请输入薪资', trigger: 'blur' }],
  offerDate: [{ required: true, message: '请选择Offer日期', trigger: 'change' }],
  expectedJoinDate: [{ required: true, message: '请选择预计入职日期', trigger: 'change' }],
};

// 搜索候选人
async function searchCandidates(keyword: string) {
  if (!keyword) return;
  candidateLoading.value = true;
  try {
    const res = await getCandidateList({
      page: 1,
      pageSize: 20,
      keyword,
    });
    if (res.success) {
      candidateOptions.value = res.data;
    }
  } catch (error) {
    console.error('搜索候选人失败:', error);
  } finally {
    candidateLoading.value = false;
  }
}

// 获取候选人详情
async function fetchCandidateDetail(candidateId: string) {
  try {
    const res = await getCandidateList({ page: 1, pageSize: 1 });
    if (res.success) {
      const candidate = res.data.find(c => c.id === candidateId);
      if (candidate) {
        selectedCandidate.value = candidate;
        formData.workYears = candidate.workYears || 0;
      }
    }
  } catch (error) {
    console.error('获取候选人详情失败:', error);
  }
}

// 处理候选人选择
function handleCandidateChange(candidateId: string) {
  const candidate = candidateOptions.value.find(c => c.id === candidateId);
  if (candidate) {
    selectedCandidate.value = candidate;
    formData.workYears = candidate.workYears || 0;
  }
}

// 获取职位列表
async function fetchJobList() {
  try {
    const res = await getJobList({ page: 1, pageSize: 100 });
    if (res.success) {
      jobList.value = res.data;
    }
  } catch (error) {
    console.error('获取职位列表失败:', error);
  }
}

function getStageType(stage: string): string {
  const map: Record<string, string> = {
    '入库': 'info', '初筛': '', '复试': 'warning', '终面': 'warning', '拟录用': 'success', 'Offer': 'success', '入职': 'danger'
  };
  return map[stage] || '';
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const res = await createOffer({
      candidateId: formData.candidateId,
      salary: formData.salary + (formData.stock ? ` + ${formData.stock}` : ''),
      offerDate: formData.offerDate,
      expectedJoinDate: formData.expectedJoinDate || undefined,
      note: formData.note,
    });
    if (res.success) {
      ElMessage.success('Offer创建成功');
      router.push('/offers');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '创建失败');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  fetchJobList();
  if (initialCandidateId) {
    fetchCandidateDetail(initialCandidateId);
  }
});
</script>

<style scoped lang="scss">
.offer-form-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  .back-nav {
    margin-bottom: 20px;
  }

  .form-card {
    :deep(.el-card__header) {
      border-bottom: none;
      padding-bottom: 0;
    }

    .card-header {
      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
      }
    }
  }

  .form-section {
    margin-bottom: 30px;

    .section-title {
      font-size: 16px;
      font-weight: 500;
      color: #303133;
      margin: 0 0 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #ebeef5;
    }
  }

  .candidate-option {
    display: flex;
    align-items: center;
    gap: 12px;

    .name {
      font-weight: 500;
    }

    .phone {
      color: #909399;
      font-size: 13px;
    }
  }

  .candidate-preview {
    margin-top: 20px;
    padding: 16px;
    background-color: #f5f7fa;
    border-radius: 8px;
  }

  .form-actions {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #ebeef5;
  }
}
</style>
