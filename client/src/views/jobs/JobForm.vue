<template>
  <div class="job-form-page">
    <!-- 返回按钮 -->
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回
      </el-button>
    </div>

    <el-card class="form-card" v-loading="loading">
      <template #header>
        <div class="card-header">
          <h2>{{ isEdit ? '编辑职位' : '发布职位' }}</h2>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
        class="job-form"
        size="large"
      >
        <el-row :gutter="30">
          <el-col :span="16">
            <!-- 基本信息 -->
            <div class="form-section">
              <h3 class="section-title">基本信息</h3>

              <el-form-item label="职位名称" prop="title">
                <el-input
                  v-model="formData.title"
                  placeholder="请输入职位名称，如：高级前端工程师"
                  maxlength="100"
                  show-word-limit
                />
              </el-form-item>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="所属部门" prop="departments">
                    <el-select
                      v-model="formData.departments"
                      multiple
                      placeholder="请选择所属部门"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="item in dictionaryStore.departmentOptions"
                        :key="item.code"
                        :label="item.name"
                        :value="item.name"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="职级" prop="level">
                    <el-input
                      v-model="formData.level"
                      placeholder="如：P6、T3-2"
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="地域" prop="location">
                    <el-select
                      v-model="formData.location"
                      placeholder="请选择工作城市"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="item in dictionaryStore.locationOptions"
                        :key="item.code"
                        :label="item.name"
                        :value="item.name"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="招聘类型" prop="type">
                    <el-radio-group v-model="formData.type">
                      <el-radio-button label="社招">社招</el-radio-button>
                      <el-radio-button label="校招">校招</el-radio-button>
                      <el-radio-button label="实习生">实习生</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="技能要求" prop="skills">
                <el-select
                  v-model="formData.skills"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="请选择或输入技能要求"
                  style="width: 100%"
                >
                  <el-option label="JavaScript" value="JavaScript" />
                  <el-option label="TypeScript" value="TypeScript" />
                  <el-option label="Vue.js" value="Vue.js" />
                  <el-option label="React" value="React" />
                  <el-option label="Node.js" value="Node.js" />
                  <el-option label="Python" value="Python" />
                  <el-option label="Java" value="Java" />
                  <el-option label="Go" value="Go" />
                  <el-option label="MySQL" value="MySQL" />
                  <el-option label="Redis" value="Redis" />
                  <el-option label="Docker" value="Docker" />
                  <el-option label="Kubernetes" value="Kubernetes" />
                </el-select>
              </el-form-item>
            </div>

            <!-- 职位描述 -->
            <div class="form-section">
              <h3 class="section-title">职位描述</h3>
              <el-form-item prop="description" label-width="0">
                <QuillEditor
                  v-model:content="formData.description"
                  contentType="html"
                  theme="snow"
                  placeholder="请详细描述职位的工作内容、团队介绍等..."
                  :options="editorOptions"
                  class="job-quill-editor"
                  style="height: 250px"
                />
              </el-form-item>
            </div>

            <!-- 任职要求 -->
            <div class="form-section">
              <h3 class="section-title">任职要求</h3>
              <el-form-item prop="requirements" label-width="0">
                <QuillEditor
                  v-model:content="formData.requirements"
                  contentType="html"
                  theme="snow"
                  placeholder="请描述候选人的学历、经验、技能等要求..."
                  :options="editorOptions"
                  class="job-quill-editor"
                  style="height: 250px"
                />
              </el-form-item>
            </div>
          </el-col>

          <el-col :span="8">
            <!-- 其他设置 -->
            <div class="form-section settings-section">
              <h3 class="section-title">其他设置</h3>

              <el-form-item label="职位状态" prop="status">
                <el-radio-group v-model="formData.status">
                  <el-radio label="open">
                    <el-tag type="success" size="small">开放</el-tag>
                    <span class="radio-text">立即开放</span>
                  </el-radio>
                  <el-radio label="paused">
                    <el-tag type="warning" size="small">暂停</el-tag>
                    <span class="radio-text">暂不开放</span>
                  </el-radio>
                </el-radio-group>
              </el-form-item>

              <el-divider />

              <div class="form-actions">
                <el-button
                  type="primary"
                  size="large"
                  @click="handleSubmit"
                  :loading="submitting"
                  style="width: 100%"
                >
                  {{ isEdit ? '保存修改' : '立即发布' }}
                </el-button>
                <el-button
                  size="large"
                  @click="$router.back()"
                  style="width: 100%; margin-top: 10px; margin-left: 0"
                >
                  取消
                </el-button>
              </div>
            </div>

            <!-- 预览提示 -->
            <div class="preview-tip">
              <el-alert
                title="提示"
                type="info"
                :closable="false"
                show-icon
              >
                <template #default>
                  职位发布后，候选人可以在招聘门户查看并投递简历。
                </template>
              </el-alert>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft } from '@element-plus/icons-vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import {
  createJob,
  updateJob,
  getJobById,
  type CreateJobParams,
  type UpdateJobParams,
  type JobStatus,
  type JobType,
} from '@/api/job';
import { useDictionaryStore } from '@/stores/dictionary';

const route = useRoute();
const router = useRouter();
const dictionaryStore = useDictionaryStore();

// 判断是否为编辑模式
const isEdit = computed(() => !!route.params.id && route.path.includes('/edit'));
const jobId = computed(() => route.params.id as string);

// 加载状态
const loading = ref(false);
const submitting = ref(false);

// 表单引用
const formRef = ref();

// 表单数据
const formData = reactive<CreateJobParams>({
  title: '',
  departments: [],
  level: '',
  skills: [],
  location: '',
  type: '社招' as JobType,
  description: '',
  requirements: '',
  status: 'open' as JobStatus,
});

// 编辑器配置
const editorOptions = {
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ header: 1 }, { header: 2 }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ direction: 'rtl' }],
      [{ size: ['small', false, 'large', 'huge'] }],
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ color: [] }, { background: [] }],
      [{ font: [] }],
      [{ align: [] }],
      ['clean'],
    ],
  },
  placeholder: '请输入内容...',
};

// 表单验证规则
const formRules = {
  title: [
    { required: true, message: '请输入职位名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' },
  ],
  departments: [
    { required: true, message: '请选择所属部门', trigger: 'change', type: 'array' },
  ],
  level: [
    { required: true, message: '请输入职级', trigger: 'blur' },
  ],
  location: [
    { required: true, message: '请选择工作城市', trigger: 'change' },
  ],
  type: [
    { required: true, message: '请选择招聘类型', trigger: 'change' },
  ],
  description: [
    { required: true, message: '请输入职位描述', trigger: 'blur' },
  ],
  requirements: [
    { required: true, message: '请输入任职要求', trigger: 'blur' },
  ],
};

function resetForm() {
  Object.assign(formData, {
    title: '',
    departments: [],
    level: '',
    skills: [],
    location: '',
    type: '社招' as JobType,
    description: '',
    requirements: '',
    status: 'open' as JobStatus,
  });
}

// 获取职位详情
async function fetchJobDetail() {
  if (!isEdit.value) return;

  loading.value = true;
  try {
    const res = await getJobById(jobId.value);
    if (res.success) {
      const data = res.data;
      formData.title = data.title;
      formData.departments = data.departments || [];
      formData.level = data.level;
      formData.skills = data.skills || [];
      formData.location = data.location;
      formData.type = data.type;
      formData.description = data.description;
      formData.requirements = data.requirements;
      formData.status = data.status;
    }
  } catch (error) {
    console.error('获取职位详情失败:', error);
    ElMessage.error('获取职位详情失败');
  } finally {
    loading.value = false;
  }
}

function init() {
  dictionaryStore.fetchDictionaries('department');
  dictionaryStore.fetchDictionaries('location');
  if (isEdit.value) {
    fetchJobDetail();
  } else {
    resetForm();
  }
}

// 提交表单
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    ElMessage.warning('请完善表单信息');
    return;
  }

  // 检查富文本内容
  if (!formData.description || formData.description === '<p><br></p>') {
    ElMessage.warning('请输入职位描述');
    return;
  }
  if (!formData.requirements || formData.requirements === '<p><br></p>') {
    ElMessage.warning('请输入任职要求');
    return;
  }

  submitting.value = true;
  try {
    if (isEdit.value) {
      // 编辑
      const updateData: UpdateJobParams = {
        title: formData.title,
        departments: formData.departments,
        level: formData.level,
        skills: formData.skills,
        location: formData.location,
        type: formData.type,
        description: formData.description,
        requirements: formData.requirements,
        status: formData.status,
      };
      const res = await updateJob(jobId.value, updateData);
      if (res.success) {
        ElMessage.success('职位修改成功');
        router.push('/jobs');
      }
    } else {
      // 新建
      const res = await createJob(formData);
      if (res.success) {
        ElMessage.success('职位发布成功');
        router.push('/jobs');
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

// 初始化
onMounted(init);
onActivated(init);
</script>

<style scoped lang="scss">
.job-form-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

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

.settings-section {
  background-color: #f5f7fa;
  padding: 20px;
  border-radius: 8px;

  .radio-text {
    margin-left: 8px;
    color: #606266;
  }

  .form-actions {
    margin-top: 30px;
  }
}

.preview-tip {
  margin-top: 20px;
}

// 富文本编辑器样式调整
.job-quill-editor {
  width: 100%;
  display: block;
}

:deep(.ql-container) {
  width: 100%;
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}

:deep(.ql-toolbar) {
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}

:deep(.ql-editor) {
  min-height: 200px;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
</style>
