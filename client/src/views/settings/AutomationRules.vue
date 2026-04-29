<template>
  <div class="automation-rules-page">
    <div class="page-header">
      <h2 class="page-title">自动化邮件规则</h2>
      <span class="page-subtitle">配置阶段流转时自动发送的邮件规则</span>
    </div>

    <el-card class="table-card" shadow="never" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>规则列表</span>
          <el-button type="primary" @click="showCreateDialog">新建规则</el-button>
        </div>
      </template>

      <el-table :data="rules" stripe>
        <el-table-column prop="triggerStage" label="触发阶段" width="120" align="center">
          <template #default="{ row }">
            <el-tag>{{ row.triggerStage }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="triggerStatus" label="触发状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="success">{{ row.triggerStatus === 'passed' ? '通过' : row.triggerStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="template" label="关联模板" min-width="150">
          <template #default="{ row }">
            {{ row.template?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
        <el-table-column prop="enabled" label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              @change="(val: boolean) => handleToggle(row.id, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && !rules.length" description="暂无规则" />
    </el-card>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑规则' : '新建规则'"
      width="500px"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="触发阶段" prop="triggerStage">
          <el-select v-model="formData.triggerStage" style="width: 100%">
            <el-option label="初筛" value="初筛" />
            <el-option label="Offer" value="Offer" />
            <el-option label="入职" value="入职" />
          </el-select>
        </el-form-item>
        <el-form-item label="触发状态" prop="triggerStatus">
          <el-input :model-value="'通过 (passed)'" disabled />
        </el-form-item>
        <el-form-item label="邮件模板" prop="templateId">
          <el-select v-model="formData.templateId" style="width: 100%">
            <el-option
              v-for="tpl in templates"
              :key="tpl.id"
              :label="tpl.name"
              :value="tpl.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="启用" prop="enabled">
          <el-switch v-model="formData.enabled" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="formData.description" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  type AutomationRule,
} from '@/api/automation-rule';
import { getEmailTemplates, type EmailTemplate } from '@/api/email';

const loading = ref(false);
const rules = ref<AutomationRule[]>([]);
const templates = ref<EmailTemplate[]>([]);

const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref('');
const submitting = ref(false);
const formRef = ref<FormInstance>();

const formData = reactive({
  triggerStage: '初筛',
  triggerStatus: 'passed',
  templateId: '',
  enabled: true,
  description: '',
});

const formRules: FormRules = {
  triggerStage: [{ required: true, message: '请选择触发阶段', trigger: 'change' }],
  templateId: [{ required: true, message: '请选择邮件模板', trigger: 'change' }],
};

async function fetchRules() {
  loading.value = true;
  try {
    const res = await getAutomationRules();
    if (res.success) rules.value = res.data;
  } finally {
    loading.value = false;
  }
}

async function fetchTemplates() {
  try {
    const res = await getEmailTemplates();
    if (res.success) templates.value = res.data as EmailTemplate[];
  } catch { /* */ }
}

function showCreateDialog() {
  isEdit.value = false;
  editingId.value = '';
  formData.triggerStage = '初筛';
  formData.triggerStatus = 'passed';
  formData.templateId = '';
  formData.enabled = true;
  formData.description = '';
  dialogVisible.value = true;
}

function handleEdit(row: AutomationRule) {
  isEdit.value = true;
  editingId.value = row.id;
  formData.triggerStage = row.triggerStage;
  formData.triggerStatus = row.triggerStatus;
  formData.templateId = row.templateId;
  formData.enabled = row.enabled;
  formData.description = row.description || '';
  dialogVisible.value = true;
}

async function handleToggle(id: string, enabled: boolean) {
  try {
    await updateAutomationRule(id, { enabled });
    ElMessage.success(enabled ? '已启用' : '已禁用');
    fetchRules();
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败');
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateAutomationRule(editingId.value, {
        triggerStage: formData.triggerStage,
        triggerStatus: formData.triggerStatus,
        templateId: formData.templateId,
        enabled: formData.enabled,
        description: formData.description || undefined,
      });
      ElMessage.success('规则已更新');
    } else {
      await createAutomationRule({
        triggerStage: formData.triggerStage,
        triggerStatus: formData.triggerStatus,
        templateId: formData.templateId,
        enabled: formData.enabled,
        description: formData.description || undefined,
      });
      ElMessage.success('规则已创建');
    }
    dialogVisible.value = false;
    fetchRules();
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: AutomationRule) {
  try {
    await ElMessageBox.confirm('确定删除该规则？', '删除确认', { type: 'warning' });
    await deleteAutomationRule(row.id);
    ElMessage.success('规则已删除');
    fetchRules();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败');
  }
}

onMounted(() => {
  fetchRules();
  fetchTemplates();
});
</script>

<style scoped lang="scss">
.automation-rules-page { padding: 20px; }
.page-header { margin-bottom: 20px;
  .page-title { margin: 0 0 8px; font-size: 24px; font-weight: 500; }
  .page-subtitle { font-size: 14px; color: #909399; }
}
.table-card {
  .card-header { display: flex; justify-content: space-between; align-items: center; }
}
</style>
