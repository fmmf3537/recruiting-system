<template>
  <el-dialog
    :model-value="modelValue"
    title="AI 辅助生成 JD"
    width="720px"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-loading="loading" :element-loading-text="loadingText" class="jd-draft-dialog">
      <!-- 表单区（生成后仍可改） -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="90px"
        class="draft-form"
      >
        <el-form-item label="职位名称" prop="title">
          <el-input v-model="form.title" placeholder="如：高级前端工程师" maxlength="100" />
        </el-form-item>

        <el-form-item label="所属部门" prop="departments">
          <el-select
            v-model="form.departments"
            multiple
            placeholder="请选择所属部门"
            style="width: 100%"
          >
            <el-option
              v-for="item in departmentOptions"
              :key="item.code"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="职级" prop="level">
              <el-input v-model="form.level" placeholder="如：P6、T3-2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="招聘类型" prop="type">
              <el-select v-model="form.type" placeholder="请选择" style="width: 100%">
                <el-option
                  v-for="item in jobTypeOptions"
                  :key="item.code"
                  :label="item.name"
                  :value="item.name"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="自由描述" prop="freeText">
          <el-input
            v-model="form.freeText"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="用大白话描述用人需求，如：要一个能独立带无人机项目的结构工程师，需要 5 年以上经验…"
          />
        </el-form-item>
      </el-form>

      <!-- 草稿预览区 -->
      <div v-if="draftText" class="draft-preview">
        <div class="preview-title">
          <span>草稿预览</span>
          <el-button link size="small" :disabled="loading" @click="draftText = ''">
            清空
          </el-button>
        </div>
        <pre class="jd-preview">{{ draftText }}</pre>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="loading" @click="handleClose">取消</el-button>
        <el-button :disabled="loading" @click="handleRegenerate">
          {{ draftText ? '重新生成' : '生成草稿' }}
        </el-button>
        <el-button type="primary" :disabled="loading || !draftText" @click="handleApply">
          填入编辑器
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { draftJd as requestDraftJd } from '@/api/jd-assist';
import { useDictionaryStore } from '@/stores/dictionary';

interface InitialValues {
  title?: string;
  departments?: string[];
  level?: string;
  type?: string;
}

const props = defineProps<{
  modelValue: boolean;
  initial?: InitialValues;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'apply', draftJd: string): void;
}>();

const dictionaryStore = useDictionaryStore();

// store getter 类型推断为 never[]（与 JobForm 存量 TS2339 同源），此处显式收窄供模板遍历
interface DictOption {
  code: string;
  name: string;
}
const departmentOptions = computed<DictOption[]>(
  () => (dictionaryStore.departmentOptions as unknown as DictOption[]) ?? []
);
const jobTypeOptions = computed<DictOption[]>(
  () => (dictionaryStore.jobTypeOptions as unknown as DictOption[]) ?? []
);

const loading = ref(false);
const loadingText = 'AI 生成中，可能需要 1 分钟，请耐心等待...';
const draftText = ref<string>('');

// 表单状态（独立于 JobForm 的 formData，避免污染）
const form = reactive({
  title: '',
  departments: [] as string[],
  level: '',
  type: '',
  freeText: '',
});

const formRef = ref();

const formRules = {
  title: [{ required: true, message: '请输入职位名称', trigger: 'blur' }],
  departments: [
    { required: true, message: '请选择所属部门', trigger: 'change', type: 'array' },
  ],
  level: [{ required: true, message: '请输入职级', trigger: 'blur' }],
  type: [{ required: true, message: '请选择招聘类型', trigger: 'change' }],
};

// 打开时按 initial 预填，并保证字典已加载
watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      // 兜底拉字典（JobForm 一般已拉过，这里双保险）
      if (dictionaryStore.departmentOptions.length === 0) {
        await dictionaryStore.fetchDictionaries('department');
      }
      if (dictionaryStore.jobTypeOptions.length === 0) {
        await dictionaryStore.fetchDictionaries('job_type');
      }

      form.title = props.initial?.title || '';
      form.departments = props.initial?.departments
        ? [...props.initial.departments]
        : [];
      form.level = props.initial?.level || '';
      form.type = props.initial?.type || '';
      form.freeText = '';
      draftText.value = '';
      loading.value = false;
    }
  },
  { immediate: false }
);

onMounted(() => {
  // 兜底：组件挂载时若字典尚未拉取，触发一次
  if (dictionaryStore.departmentOptions.length === 0) {
    dictionaryStore.fetchDictionaries('department');
  }
  if (dictionaryStore.jobTypeOptions.length === 0) {
    dictionaryStore.fetchDictionaries('job_type');
  }
});

async function doGenerate() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    ElMessage.warning('请完善表单必填项');
    return;
  }

  loading.value = true;
  try {
    const res = await requestDraftJd({
      title: form.title,
      departments: form.departments,
      level: form.level,
      type: form.type,
      freeText: form.freeText || undefined,
    });
    if (res.success) {
      draftText.value = res.data.draftJd || '';
    }
  } catch {
    // request 层已统一 ElMessage 提示
  } finally {
    loading.value = false;
  }
}

function handleRegenerate() {
  doGenerate();
}

function handleApply() {
  if (!draftText.value) return;
  emit('apply', draftText.value);
  emit('update:modelValue', false);
}

function handleClose() {
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.jd-draft-dialog {
  min-height: 320px;
}

.draft-form {
  margin-bottom: 16px;
}

.draft-preview {
  background-color: #f5f7fa;
  border-radius: 8px;
  padding: 12px;

  .preview-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
    color: #303133;
    margin-bottom: 10px;
    font-size: 14px;
  }
}

.jd-preview {
  margin: 0;
  padding: 12px;
  background-color: #fff;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  max-height: 280px;
  overflow-y: auto;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
