<template>
  <div class="candidate-form-page">
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回
      </el-button>
    </div>

    <el-card class="form-card" v-loading="loading">
      <template #header>
        <div class="card-header">
          <h2>{{ isEdit ? '编辑候选人' : '新增候选人' }}</h2>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
        class="candidate-form"
        size="large"
      >
        <el-row :gutter="40">
          <el-col :span="14">
            <!-- 基本信息 -->
            <div class="form-section">
              <h3 class="section-title">基本信息</h3>
              
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="姓名" prop="name">
                    <el-input v-model="formData.name" placeholder="请输入姓名" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="性别" prop="gender">
                    <el-radio-group v-model="formData.gender">
                      <el-radio-button label="男">男</el-radio-button>
                      <el-radio-button label="女">女</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="手机号" prop="phone">
                    <el-input v-model="formData.phone" placeholder="请输入手机号" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="邮箱" prop="email">
                    <el-input v-model="formData.email" placeholder="请输入邮箱" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="年龄" prop="age">
                    <el-input-number v-model="formData.age" :min="18" :max="70" style="width: 100%" placeholder="岁" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="工作年限" prop="workYears">
                    <el-input-number v-model="formData.workYears" :min="0" :max="50" style="width: 100%" placeholder="年" />
                  </el-form-item>
                </el-col>
              </el-row>
            </div>

            <!-- 教育背景 -->
            <div class="form-section">
              <h3 class="section-title">教育背景</h3>
              
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="最高学历" prop="education">
                    <el-select v-model="formData.education" placeholder="请选择学历" style="width: 100%">
                      <el-option label="博士" value="博士" />
                      <el-option label="硕士" value="硕士" />
                      <el-option label="本科" value="本科" />
                      <el-option label="大专" value="大专" />
                      <el-option label="高中及以下" value="高中及以下" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="毕业院校" prop="school">
                    <el-input v-model="formData.school" placeholder="请输入毕业院校" />
                  </el-form-item>
                </el-col>
              </el-row>
            </div>

            <!-- 工作背景 -->
            <div class="form-section">
              <h3 class="section-title">工作背景</h3>
              
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="当前公司" prop="currentCompany">
                    <el-input v-model="formData.currentCompany" placeholder="选填" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="当前职位" prop="currentPosition">
                    <el-input v-model="formData.currentPosition" placeholder="选填" />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="期望薪资" prop="expectedSalary">
                <el-input v-model="formData.expectedSalary" placeholder="如：20k-30k" />
              </el-form-item>
            </div>
          </el-col>

          <el-col :span="10">
            <!-- 简历信息 -->
            <div class="form-section">
              <h3 class="section-title">简历信息</h3>
              
              <el-form-item label="简历附件" prop="resumeUrl">
                <el-upload
                  class="resume-uploader"
                  :http-request="handleCustomUpload"
                  :before-upload="beforeUpload"
                  accept=".pdf,.doc,.docx"
                  :limit="1"
                >
                  <el-button type="primary" plain>
                    <el-icon><Upload /></el-icon>上传简历
                  </el-button>
                  <template #tip>
                    <div class="el-upload__tip">支持 PDF、Word 格式，大小不超过 10MB</div>
                  </template>
                </el-upload>
                <div v-if="formData.resumeUrl" class="file-preview">
                  <el-icon><Document /></el-icon>
                  <span class="file-name">{{ resumeFileName }}</span>
                  <el-icon class="delete-icon" @click="removeResume"><Delete /></el-icon>
                </div>
              </el-form-item>

              <el-form-item label="来源渠道" prop="source">
                <el-select v-model="formData.source" placeholder="请选择来源渠道" style="width: 100%">
                  <el-option label="BOSS直聘" value="BOSS直聘" />
                  <el-option label="猎聘" value="猎聘" />
                  <el-option label="智联招聘" value="智联招聘" />
                  <el-option label="前程无忧" value="前程无忧" />
                  <el-option label="内推" value="内推" />
                  <el-option label="官网投递" value="官网投递" />
                  <el-option label="其他" value="其他" />
                </el-select>
              </el-form-item>

              <el-form-item label="来源备注" prop="sourceNote">
                <el-input v-model="formData.sourceNote" type="textarea" :rows="2" placeholder="选填，如内推人姓名等" />
              </el-form-item>
            </div>

            <!-- 关联职位 -->
            <div class="form-section">
              <h3 class="section-title">关联职位</h3>
              <el-form-item prop="jobIds" label-width="0">
                <el-select
                  v-model="formData.jobIds"
                  multiple
                  placeholder="请选择应聘职位"
                  style="width: 100%"
                >
                  <el-option
                    v-for="job in jobList"
                    :key="job.id"
                    :label="job.title"
                    :value="job.id"
                  />
                </el-select>
              </el-form-item>
            </div>

            <!-- 候选人说明 -->
            <div class="form-section">
              <h3 class="section-title">候选人说明</h3>
              <el-form-item prop="intro" label-width="0">
                <el-input
                  v-model="formData.intro"
                  type="textarea"
                  :rows="4"
                  placeholder="选填，可填写面试评价、特殊说明等"
                  maxlength="500"
                  show-word-limit
                />
              </el-form-item>
            </div>

            <!-- 操作按钮 -->
            <div class="form-actions">
              <el-button type="primary" size="large" @click="handleSubmit" :loading="submitting" style="width: 100%">
                {{ isEdit ? '保存修改' : '立即创建' }}
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
import { ref, reactive, onActivated, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Upload, Document, Delete } from '@element-plus/icons-vue';
import {
  createCandidate,
  updateCandidate,
  getCandidateById,
  type CreateCandidateParams,
  type UpdateCandidateParams,
} from '@/api/candidate';
import { getJobList, type JobItem } from '@/api/job';
import { uploadFile } from '@/utils/request';

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => !!route.params.id);
const candidateId = computed(() => route.params.id as string);

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const jobList = ref<JobItem[]>([]);

const formData = reactive<CreateCandidateParams>({
  name: '',
  phone: '',
  email: '',
  gender: '男',
  age: undefined,
  education: '',
  school: '',
  workYears: undefined,
  currentCompany: '',
  currentPosition: '',
  expectedSalary: '',
  resumeUrl: '',
  source: '',
  sourceNote: '',
  intro: '',
  jobIds: [],
});

const resumeFileName = computed(() => {
  if (!formData.resumeUrl) return '';
  const parts = formData.resumeUrl.split('/');
  return parts[parts.length - 1];
});

const formRules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [
    { validator: (_rule: any, value: string, callback: any) => {
      if (!value && !formData.email) {
        callback(new Error('手机号和邮箱至少填写一项'));
      } else if (value && !/^1[3-9]\d{9}$/.test(value)) {
        callback(new Error('手机号格式不正确'));
      } else {
        callback();
      }
    }, trigger: 'blur' },
  ],
  email: [
    { validator: (_rule: any, value: string, callback: any) => {
      if (!value && !formData.phone) {
        callback(new Error('手机号和邮箱至少填写一项'));
      } else if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        callback(new Error('邮箱格式不正确'));
      } else {
        callback();
      }
    }, trigger: 'blur' },
  ],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  education: [{ required: true, message: '请选择学历', trigger: 'change' }],
  source: [{ required: true, message: '请选择来源渠道', trigger: 'change' }],
};

async function fetchJobList() {
  try {
    const res = await getJobList({ page: 1, pageSize: 100 });
    if (res.success) jobList.value = res.data;
  } catch (error) {
    console.error('获取职位列表失败:', error);
  }
}

async function fetchCandidateDetail() {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const res = await getCandidateById(candidateId.value);
    if (res.success) {
      const data = res.data;
      Object.assign(formData, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        gender: data.gender,
        age: data.age || undefined,
        education: data.education,
        school: data.school || '',
        workYears: data.workYears || undefined,
        currentCompany: data.currentCompany || '',
        currentPosition: data.currentPosition || '',
        expectedSalary: data.expectedSalary || '',
        resumeUrl: data.resumeUrl || '',
        source: data.source,
        sourceNote: data.sourceNote || '',
        intro: data.intro || '',
        jobIds: data.candidateJobs?.map((j) => j.jobId) || [],
      });
    }
  } catch (error) {
    ElMessage.error('获取候选人详情失败');
  } finally {
    loading.value = false;
  }
}

function handleUploadSuccess(response: any) {
  formData.resumeUrl = response.url;
  ElMessage.success('简历上传成功');
}

async function handleCustomUpload(options: any) {
  const { file, onSuccess, onError } = options;
  try {
    const res = await uploadFile(file as File);
    if (res.success && res.data) {
      formData.resumeUrl = res.data.url;
      ElMessage.success('简历上传成功');
      onSuccess();
    } else {
      ElMessage.error(res.message || '上传失败');
      onError(new Error(res.message));
    }
  } catch (error: any) {
    ElMessage.error(error.message || '上传失败');
    onError(error);
  }
}

function beforeUpload(file: File) {
  const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const isValid = validTypes.includes(file.type);
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isValid) {
    ElMessage.error('只支持 PDF、Word 格式的文件');
    return false;
  }
  if (!isLt10M) {
    ElMessage.error('文件大小不能超过 10MB');
    return false;
  }
  return true;
}

function removeResume() {
  formData.resumeUrl = '';
}

import { ElMessageBox } from 'element-plus';

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit.value) {
      const updateData: UpdateCandidateParams = { ...formData };
      const res = await updateCandidate(candidateId.value, updateData);
      if (res.success) {
        ElMessage.success('修改成功');
        router.back();
      }
    } else {
      // 合并表单数据和工作经历
      const submitData = { ...formData };
      const workHistoryStr = sessionStorage.getItem('parsedWorkHistory');
      if (workHistoryStr) {
        try {
          submitData.workHistory = JSON.parse(workHistoryStr);
        } catch (e) {
          console.error('解析工作经历数据失败:', e);
        }
      }
      const res = await createCandidate(submitData);
      if (res.success) {
        // 有查重警告时显示确认弹窗
        if (res.warning && res.duplicates && res.duplicates.length > 0) {
          const duplicateInfo = res.duplicates.map(d => 
            `• ${d.name} (${d.phone}, ${d.email}) - 当前阶段: ${d.currentStage}`
          ).join('\n');
          
          try {
            await ElMessageBox.confirm(
              `发现 ${res.duplicates.length} 位相似候选人：\n\n${duplicateInfo}\n\n是否继续创建？`,
              '查重警告',
              {
                confirmButtonText: '继续创建',
                cancelButtonText: '取消',
                type: 'warning',
                dangerouslyUseHTMLString: false,
              }
            );
            // 用户确认后继续创建
            ElMessage.success('创建成功');
            router.back();
          } catch {
            // 用户取消，不执行任何操作
            submitting.value = false;
            return;
          }
        }
        // 清理工作经历数据
        sessionStorage.removeItem('parsedWorkHistory');
        ElMessage.success('创建成功');
        router.back();
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  Object.assign(formData, {
    name: '',
    phone: '',
    email: '',
    gender: '男',
    age: undefined,
    education: '',
    school: '',
    workYears: undefined,
    currentCompany: '',
    currentPosition: '',
    expectedSalary: '',
    resumeUrl: '',
    source: '',
    sourceNote: '',
    intro: '',
    jobIds: [],
  });
}

function fillFromParsedResume() {
  const parsedData = sessionStorage.getItem('parsedResume');
  if (parsedData) {
    try {
      const data = JSON.parse(parsedData);
      Object.assign(formData, {
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        gender: data.gender === '男' || data.gender === '女' ? data.gender : '男',
        age: data.age || undefined,
        education: data.education || '',
        school: data.school || '',
        workYears: data.workYears || undefined,
        currentCompany: data.currentCompany || '',
        currentPosition: data.currentPosition || '',
        expectedSalary: data.expectedSalary || '',
        intro: data.skills?.length ? `技能：${data.skills.join(', ')}` : '',
        resumeUrl: data.resumeUrl || '',
      });
      // 将工作经历也存储到 sessionStorage，供后续保存时使用
      if (data.workHistory?.length) {
        sessionStorage.setItem('parsedWorkHistory', JSON.stringify(data.workHistory));
      }
      sessionStorage.removeItem('parsedResume');
      ElMessage.success('简历信息已填充，请确认并补充其他信息');
    } catch (e) {
      console.error('解析预填充数据失败:', e);
    }
  }
}

function init() {
  fetchJobList();
  if (isEdit.value) {
    fetchCandidateDetail();
  } else {
    resetForm();
    fillFromParsedResume();
  }
}

onActivated(init);
</script>

<style scoped lang="scss">
.candidate-form-page {
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

  .resume-uploader {
    .file-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding: 8px 12px;
      background-color: #f5f7fa;
      border-radius: 4px;

      .file-name {
        flex: 1;
        font-size: 14px;
        color: #606266;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .delete-icon {
        cursor: pointer;
        color: #f56c6c;

        &:hover {
          opacity: 0.8;
        }
      }
    }
  }

  .form-actions {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #ebeef5;
  }
}
</style>
