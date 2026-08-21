<template>
  <div class="pipeline-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">招聘流程模板</h2>
        <span class="page-subtitle">按职位类型自定义招聘阶段流程（候选人推进选项按模板校验）</span>
      </div>
      <el-button type="primary" @click="handleAdd">新增模板</el-button>
    </div>

    <!-- 模板列表 -->
    <el-card v-loading="loading" shadow="never">
      <el-table :data="list" stripe>
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="name" label="模板名称" min-width="140" />
        <el-table-column prop="type" label="职位类型" width="100" />
        <el-table-column label="阶段流程" min-width="320">
          <template #default="{ row }">
            <el-tag
              v-for="(stage, index) in row.stages"
              :key="index"
              size="small"
              class="stage-tag"
            >
              {{ index + 1 }}. {{ stage }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="默认" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.isDefault" type="success" size="small">默认</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link :type="row.enabled ? 'warning' : 'success'" @click="handleToggle(row)">
              {{ row.enabled ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无模板" />
    </el-card>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑模板' : '新增模板'"
      width="600px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="formData.name" placeholder="如：校招标准流程" maxlength="50" />
        </el-form-item>
        <el-form-item label="职位类型" prop="type">
          <el-select v-model="formData.type" placeholder="请选择职位类型" style="width: 100%">
            <el-option v-for="t in jobTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶段流程" prop="stages">
          <div class="stages-editor">
            <div v-for="(stage, index) in formData.stages" :key="index" class="stage-row">
              <span class="stage-index">{{ index + 1 }}</span>
              <el-input v-model="formData.stages[index]" placeholder="阶段名称" maxlength="20" />
              <el-button link type="primary" :disabled="index === 0" @click="moveStage(index, -1)">
                上移
              </el-button>
              <el-button
                link
                type="primary"
                :disabled="index === formData.stages.length - 1"
                @click="moveStage(index, 1)"
              >
                下移
              </el-button>
              <el-button
                link
                type="danger"
                :disabled="formData.stages.length <= 1"
                @click="removeStage(index)"
              >
                删除
              </el-button>
            </div>
            <el-button link type="primary" @click="addStage">+ 添加阶段</el-button>
          </div>
        </el-form-item>
        <el-form-item label="默认模板">
          <el-switch v-model="formData.isDefault" />
          <span class="form-tip">该职位类型下未指定模板的职位使用此流程</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="formData.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  getPipelineTemplates,
  createPipelineTemplate,
  updatePipelineTemplate,
  type PipelineTemplate,
} from '@/api/pipeline-template';

// 与后端 JOB_TYPES 常量保持一致
const jobTypes = ['社招', '校招', '实习生'];

const loading = ref(false);
const list = ref<PipelineTemplate[]>([]);

const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const formData = reactive({
  id: '',
  name: '',
  type: '社招',
  stages: ['入库'] as string[],
  enabled: true,
  isDefault: false,
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择职位类型', trigger: 'change' }],
};

async function fetchList() {
  loading.value = true;
  try {
    const res = await getPipelineTemplates();
    list.value = res.data;
  } finally {
    loading.value = false;
  }
}

function handleAdd() {
  isEdit.value = false;
  formData.id = '';
  formData.name = '';
  formData.type = '社招';
  formData.stages = ['入库'];
  formData.enabled = true;
  formData.isDefault = false;
  dialogVisible.value = true;
}

function handleEdit(row: PipelineTemplate) {
  isEdit.value = true;
  formData.id = row.id;
  formData.name = row.name;
  formData.type = row.type;
  formData.stages = [...row.stages];
  formData.enabled = row.enabled;
  formData.isDefault = row.isDefault;
  dialogVisible.value = true;
}

// 启停用切换
async function handleToggle(row: PipelineTemplate) {
  const res = await updatePipelineTemplate(row.id, { enabled: !row.enabled });
  if (res.success) {
    ElMessage.success(row.enabled ? '已禁用' : '已启用');
    fetchList();
  }
}

// 阶段上移/下移排序
function moveStage(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= formData.stages.length) return;
  const [item] = formData.stages.splice(index, 1);
  formData.stages.splice(target, 0, item);
}

function addStage() {
  formData.stages.push('');
}

function removeStage(index: number) {
  formData.stages.splice(index, 1);
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  // 过滤空白阶段
  const stages = formData.stages.map((s) => s.trim()).filter((s) => s.length > 0);
  if (stages.length === 0) {
    ElMessage.warning('请至少填写一个阶段');
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      name: formData.name,
      type: formData.type,
      stages,
      enabled: formData.enabled,
      isDefault: formData.isDefault,
    };
    const res = isEdit.value
      ? await updatePipelineTemplate(formData.id, payload)
      : await createPipelineTemplate(payload);
    if (res.success) {
      ElMessage.success(isEdit.value ? '模板更新成功' : '模板创建成功');
      dialogVisible.value = false;
      fetchList();
    }
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  fetchList();
});
</script>

<style scoped lang="scss">
.pipeline-page {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  .title-section {
    .page-title {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }
    .page-subtitle {
      margin-top: 8px;
      font-size: 14px;
      color: #909399;
    }
  }
}
.stage-tag {
  margin: 2px 4px 2px 0;
}
.stages-editor {
  width: 100%;
  .stage-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    .stage-index {
      width: 20px;
      text-align: center;
      color: #909399;
      flex-shrink: 0;
    }
  }
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
