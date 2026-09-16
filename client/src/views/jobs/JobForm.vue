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
                      <el-radio-button
                        v-for="item in dictionaryStore.jobTypeOptions"
                        :key="item.code"
                        :label="item.name"
                      >
                        {{ item.name }}
                      </el-radio-button>
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
                  <el-option
                    v-for="item in dictionaryStore.skillOptions"
                    :key="item.code"
                    :label="item.name"
                    :value="item.name"
                  />
                </el-select>
              </el-form-item>

              <el-form-item label="标签" prop="tagIds">
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

            <!-- 职位描述 -->
            <div class="form-section">
              <!-- UI-S5：新布局将 AI 入口收到标题行右端；关闭开关时恢复原独立整行 -->
              <div v-if="newLayout" class="jd-section-header">
                <span class="jd-section-title">职位描述</span>
                <!-- AI 辅助操作：interviewer 隐藏（服务端仍会兜底拦截） -->
                <el-form-item v-if="canAi" label-width="0" class="jd-ai-actions">
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    :disabled="jdIsEmpty"
                    @click="handlePolishClick"
                  >
                    <el-icon><MagicStick /></el-icon>AI 完善建议
                  </el-button>
                  <el-button size="small" type="success" plain @click="openDraftDialog">
                    <el-icon><MagicStick /></el-icon>AI 辅助生成
                  </el-button>
                </el-form-item>
              </div>
              <template v-else>
                <h3 class="section-title">职位描述</h3>
                <!-- AI 辅助操作：interviewer 隐藏（服务端仍会兜底拦截） -->
                <el-form-item v-if="canAi" label-width="0" class="jd-ai-actions">
                  <el-button
                    type="primary"
                    plain
                    :disabled="jdIsEmpty"
                    @click="handlePolishClick"
                  >
                    <el-icon><MagicStick /></el-icon>AI 完善建议
                  </el-button>
                  <el-button type="success" plain @click="openDraftDialog">
                    <el-icon><MagicStick /></el-icon>AI 辅助生成
                  </el-button>
                </el-form-item>
              </template>
              <el-form-item prop="description" label-width="0">
                <QuillEditor
                  :key="quillToolbarKey"
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
                  :key="quillToolbarKey + '-req'"
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

              <!-- UI-S5：发布前检查栏插在 status 之前；开关关闭不渲染 -->
              <JobPublishChecklist
                v-if="newLayout"
                :items="checklist"
                @locate="locateField"
              />

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

    <!-- AI JD 完善建议弹窗 -->
    <JdPolishDialog
      v-model="polishDialogVisible"
      :jd-text="formData.description"
      :meta="jdMeta"
      @apply="applyImprovedJd"
    />

    <!-- AI JD 辅助生成弹窗 -->
    <JdDraftDialog
      v-model="draftDialogVisible"
      :initial="jdMeta"
      @apply="applyDraftJd"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, MagicStick } from '@element-plus/icons-vue';
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
import { getTags, type Tag } from '@/api/tag';
import { useDictionaryStore } from '@/stores/dictionary';
import { useAuthStore } from '@/stores/auth';
import JdPolishDialog from '@/components/jobs/JdPolishDialog.vue';
import JdDraftDialog from '@/components/jobs/JdDraftDialog.vue';
import JobPublishChecklist from '@/components/jobs/JobPublishChecklist.vue';

const route = useRoute();
const router = useRouter();
const dictionaryStore = useDictionaryStore();
const authStore = useAuthStore();

// AI 入口可见性：interviewer 隐藏（服务端仍会兜底拦截）
const canAi = computed(() => {
  const role = authStore.userInfo?.role;
  return role === 'admin' || role === 'member' || role === 'hr' || role === 'hiring_manager';
});

const polishDialogVisible = ref(false);
const draftDialogVisible = ref(false);

// 判断是否为编辑模式
const isEdit = computed(() => !!route.params.id && route.path.includes('/edit'));
const jobId = computed(() => route.params.id as string);

// 加载状态
const loading = ref(false);
const submitting = ref(false);

// 表单引用
const formRef = ref();

// UI-S5：新布局开关，默认开启。回退：localStorage.setItem('ui:new-layout:UI-S5','false') 后刷新
const newLayout = ref(localStorage.getItem('ui:new-layout:UI-S5') !== 'false');
// Quill 仅在挂载时读 options，开关变化时用 key 重建编辑器（不改 v-model / 其他 props）
const quillToolbarKey = computed(() => (newLayout.value ? 'slim' : 'full'));

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
  tagIds: [],
});
const { markSaved } = useUnsavedChangesGuard(formData, submitting);

const tagOptions = ref<Tag[]>([]);

// JD 描述是否为空（HTML 形态需剥标签判断；依赖 formData，须置于其后）
const jdIsEmpty = computed(() => {
  const html = formData.description || '';
  return !html || html.replace(/<[^>]+>/g, '').trim() === '' || html === '<p><br></p>';
});

// 透传给 AI 弹窗的职位 meta（来自表单已填字段）
const jdMeta = computed(() => ({
  title: formData.title || undefined,
  level: formData.level || undefined,
  departments: formData.departments?.length ? formData.departments : undefined,
  type: formData.type || undefined,
}));

// UI-S5：原完整工具栏（回退用，勿删）
const EDITOR_TOOLBAR_FULL = [
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
];

// UI-S5：精简工具栏（加粗 / 标题 / 列表 / 清除格式）
const EDITOR_TOOLBAR_SLIM = [
  ['bold', 'italic'],
  [{ header: [1, 2, 3, false] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

// 编辑器配置（开关关闭时恢复原工具栏）
const editorOptions = computed(() => ({
  modules: {
    toolbar: newLayout.value ? EDITOR_TOOLBAR_SLIM : EDITOR_TOOLBAR_FULL,
  },
  placeholder: '请输入内容...',
}));

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

type FormRuleItem = { required?: boolean; message?: string };

// UI-S5：空值判断（空串 / undefined / null / 空数组为空；数字 0 视为已填）
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number') return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return true;
    // Quill 空文档占位，与 handleSubmit 既有判断对齐，不新增校验规则
    if (trimmed === '<p><br></p>') return true;
    return trimmed.replace(/<[^>]+>/g, '').trim() === '';
  }
  return false;
}

// UI-S5：基于现有 formRules 推导必填项，不新增/修改任何校验规则
const checklist = computed(() =>
  Object.entries(formRules)
    .filter(([, rules]) => (rules as FormRuleItem[]).some((r) => r?.required))
    .map(([prop, rules]) => {
      const r = (rules as FormRuleItem[]).find((x) => x?.required);
      return {
        prop,
        label: r?.message ?? prop,
        done: !isEmpty(formData[prop as keyof typeof formData]),
      };
    }),
);

function locateField(prop: string) {
  formRef.value?.scrollToField(prop);
}

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
    tagIds: [],
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
      formData.tagIds = data.tags?.map((t: Tag) => t.id) || [];
    }
  } catch (error) {
    console.error('获取职位详情失败:', error);
    ElMessage.error('获取职位详情失败');
  } finally {
    loading.value = false;
  }
}

async function fetchTagOptions() {
  try {
    const res = await getTags('job');
    if (res.success) tagOptions.value = res.data;
  } catch {
    // 静默失败
  }
}

function init() {
  dictionaryStore.fetchDictionaries('department');
  dictionaryStore.fetchDictionaries('location');
  dictionaryStore.fetchDictionaries('job_type');
  dictionaryStore.fetchDictionaries('skills');
  fetchTagOptions();
  if (isEdit.value) {
    fetchJobDetail();
  } else {
    resetForm();
  }
}

// 纯文本 → HTML（QuillEditor contentType=html）
// 策略：按空行分段包 <p>...</p>，段内单换行转 <br>
function plainTextToHtml(text: string): string {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function handlePolishClick() {
  if (jdIsEmpty.value) {
    ElMessage.warning('请先输入职位描述');
    return;
  }
  polishDialogVisible.value = true;
}

function openDraftDialog() {
  draftDialogVisible.value = true;
}

async function applyImprovedJd(improvedText: string) {
  // 完善场景：覆盖前确认（非空）
  const hasContent =
    formData.description &&
    formData.description.replace(/<[^>]+>/g, '').trim() !== '' &&
    formData.description !== '<p><br></p>';
  if (hasContent) {
    try {
      await ElMessageBox.confirm('将覆盖当前 JD 内容，是否继续？', '提示', {
        type: 'warning',
        confirmButtonText: '覆盖',
        cancelButtonText: '取消',
      });
    } catch {
      // 用户取消
      return;
    }
  }
  formData.description = plainTextToHtml(improvedText);
  ElMessage.success('已填入优化稿，请检查后再保存');
}

async function applyDraftJd(draftText: string) {
  formData.description = plainTextToHtml(draftText);
  ElMessage.success('已填入 AI 草稿，请检查后再保存');
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
        markSaved();
        router.push('/jobs');
      }
    } else {
      // 新建
      const res = await createJob(formData);
      if (res.success) {
        ElMessage.success('职位发布成功');
        markSaved();
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

// UI-S5：职位描述标题行 + 右侧 AI 按钮
.jd-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid $ui-gray-200;

  .jd-section-title {
    font-size: 16px;
    font-weight: 500;
    color: $ui-gray-900;
  }

  .jd-ai-actions {
    margin-bottom: 0;
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
