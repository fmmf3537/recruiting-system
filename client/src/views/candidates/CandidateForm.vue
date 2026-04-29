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
                      <el-option
                        v-for="item in dictionaryStore.educationOptions"
                        :key="item.code"
                        :label="item.name"
                        :value="item.name"
                      />
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

            <!-- 工作经历 -->
            <div class="form-section">
              <h3 class="section-title">
                工作经历
                <el-button type="primary" link size="small" @click="addWorkHistory">
                  <el-icon><Plus /></el-icon>添加经历
                </el-button>
              </h3>
              
              <div v-if="formData.workHistory?.length" class="work-history-list">
                <div
                  v-for="(item, index) in formData.workHistory"
                  :key="index"
                  class="work-history-item"
                >
                  <el-row :gutter="12">
                    <el-col :span="10">
                      <el-input v-model="item.company" placeholder="公司名称" size="small" />
                    </el-col>
                    <el-col :span="10">
                      <el-input v-model="item.position" placeholder="职位" size="small" />
                    </el-col>
                    <el-col :span="4" style="text-align: right">
                      <el-button type="danger" link size="small" @click="removeWorkHistory(index)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </el-col>
                  </el-row>
                  <el-row :gutter="12" style="margin-top: 8px">
                    <el-col :span="10">
                      <el-date-picker
                        v-model="item.startDate"
                        type="month"
                        placeholder="开始时间"
                        size="small"
                        style="width: 100%"
                        value-format="YYYY-MM"
                      />
                    </el-col>
                    <el-col :span="10">
                      <el-date-picker
                        v-model="item.endDate"
                        type="month"
                        placeholder="结束时间（未选表示至今）"
                        size="small"
                        style="width: 100%"
                        value-format="YYYY-MM"
                      />
                    </el-col>
                  </el-row>
                  <el-row style="margin-top: 8px">
                    <el-col :span="24">
                      <el-input
                        v-model="item.description"
                        type="textarea"
                        :rows="2"
                        placeholder="工作描述"
                        size="small"
                      />
                    </el-col>
                  </el-row>
                </div>
              </div>
              <el-empty v-else description="暂无工作经历" :image-size="60" />
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
                  <el-option
                    v-for="item in dictionaryStore.sourceOptions"
                    :key="item.code"
                    :label="item.name"
                    :value="item.name"
                  />
                </el-select>
              </el-form-item>

              <el-form-item label="来源备注" prop="sourceNote">
                <el-input v-model="formData.sourceNote" type="textarea" :rows="2" placeholder="选填，如内推人姓名等" />
              </el-form-item>

              <el-form-item label="推荐人" prop="referrer">
                <el-input v-model="formData.referrer" placeholder="选填，内部推荐时填写推荐人姓名/工号" />
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

            <!-- 技能标签 -->
            <div class="form-section">
              <h3 class="section-title">技能标签</h3>
              <el-form-item prop="skills" label-width="0">
                <el-select
                  v-model="formData.skills"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="请选择或输入技能"
                  style="width: 100%"
                >
                  <el-option
                    v-for="skill in dictionaryStore.skillOptions"
                    :key="skill.code"
                    :label="skill.name"
                    :value="skill.name"
                  />
                </el-select>
              </el-form-item>
            </div>

            <!-- 标签 -->
            <div class="form-section">
              <h3 class="section-title">标签</h3>
              <el-form-item prop="tagIds" label-width="0">
                <el-select
                  v-model="formData.tagIds"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="请选择或输入标签"
                  style="width: 100%"
                >
                  <el-option
                    v-for="tag in tagOptions"
                    :key="tag.id"
                    :label="tag.name"
                    :value="tag.id"
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
import { ref, reactive, onActivated, onMounted, nextTick, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Upload, Document, Delete, Plus } from '@element-plus/icons-vue';
import {
  createCandidate,
  updateCandidate,
  getCandidateById,
  type CreateCandidateParams,
  type UpdateCandidateParams,
  type WorkHistory,
} from '@/api/candidate';
import { getJobList, type JobItem } from '@/api/job';
import { getTags, type Tag } from '@/api/tag';
import { uploadFile } from '@/utils/request';
import { useDictionaryStore } from '@/stores/dictionary';
import { useResumeParserStore } from '@/stores/resumeParser';

const route = useRoute();
const dictionaryStore = useDictionaryStore();
const router = useRouter();
const resumeParserStore = useResumeParserStore();

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
  referrer: '',
  intro: '',
  jobIds: [],
  tagIds: [],
  skills: [] as string[],
  workHistory: [],
});

const tagOptions = ref<Tag[]>([]);

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

async function fetchTags() {
  try {
    const res = await getTags('candidate');
    if (res.success) {
      tagOptions.value = res.data;
    }
  } catch {
    // 静默失败
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
        referrer: data.referrer || '',
        intro: data.intro || '',
        jobIds: data.candidateJobs?.map((j) => j.jobId) || [],
        tagIds: data.tags?.map((t: Tag) => t.id) || [],
        skills: data.skills || [],
        workHistory: data.workHistories?.map((w: any) => ({
          id: w.id,
          company: w.company,
          position: w.position,
          startDate: w.startDate ? w.startDate.substring(0, 7) : undefined,
          endDate: w.endDate ? w.endDate.substring(0, 7) : undefined,
          description: w.description || '',
        })) || [],
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
      const res = await createCandidate({ ...formData });
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
        // 清理简历解析临时数据
        resumeParserStore.clearParsedData();
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
    referrer: '',
    intro: '',
    jobIds: [],
    tagIds: [],
    skills: [],
    workHistory: [],
  });
}

function fillFromParsedResume() {
  const data = resumeParserStore.parsedData;
  if (data) {
    // 使用 splice 逐字段写入，确保 Vue 响应式系统正确追踪
    formData.name = data.name || '';
    formData.phone = data.phone || '';
    formData.email = data.email || '';
    formData.gender = (data.gender === '男' || data.gender === '女') ? data.gender : '男';
    formData.age = data.age || undefined;
    formData.education = data.education || '';
    formData.school = data.school || '';
    formData.workYears = data.workYears || undefined;
    formData.currentCompany = data.currentCompany || '';
    formData.currentPosition = data.currentPosition || '';
    formData.expectedSalary = data.expectedSalary || '';
    formData.skills = data.skills ? [...data.skills] : [];
    formData.resumeUrl = data.resumeUrl || '';
    // 深拷贝工作经历，确保响应式追踪
    formData.workHistory = data.workHistory?.map((w: WorkHistory) => ({
      company: w.company || '',
      position: w.position || '',
      startDate: w.startDate,
      endDate: w.endDate,
      description: w.description || '',
    })) || [];
    ElMessage.success('简历信息已填充，请确认并补充其他信息');
  }
}

function addWorkHistory() {
  if (!formData.workHistory) {
    formData.workHistory = [];
  }
  formData.workHistory.push({
    company: '',
    position: '',
    startDate: undefined,
    endDate: undefined,
    description: '',
  });
}

function removeWorkHistory(index: number) {
  formData.workHistory?.splice(index, 1);
}

async function init() {
  dictionaryStore.fetchDictionaries('education');
  dictionaryStore.fetchDictionaries('source');
  fetchJobList();
  fetchTags();
  if (isEdit.value) {
    fetchCandidateDetail();
  } else {
    resetForm();
    // 等待 DOM 更新后再从 store 读取简历解析数据，确保 resetForm 的响应式变更已完成
    await nextTick();
    fillFromParsedResume();
  }
}

onMounted(init);
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

  .work-history-list {
    .work-history-item {
      padding: 16px;
      background-color: #f5f7fa;
      border-radius: 8px;
      margin-bottom: 12px;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}
</style>
