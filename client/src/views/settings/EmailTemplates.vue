<template>
  <div class="email-templates-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">邮件模板</h2>
        <el-tag v-if="mailConfigured" type="success" size="small">邮件服务已配置</el-tag>
        <el-tag v-else type="warning" size="small">邮件服务未配置</el-tag>
      </div>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>新建模板
      </el-button>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-empty v-if="!templateList.length" description="暂无邮件模板" />
      <el-table v-else :data="templateList" stripe style="width: 100%">
        <el-table-column prop="name" label="模板名称" min-width="150" />
        <el-table-column prop="subject" label="邮件主题" min-width="200" />
        <el-table-column prop="variables" label="变量" min-width="180">
          <template #default="{ row }">
            <el-tag v-for="v in row.variables" :key="v" size="small" class="var-tag">
              {{ v }}
            </el-tag>
            <span v-if="!row.variables?.length">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button type="primary" link size="small" @click="previewTemplate(row)">预览</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 邮件日志 -->
    <el-card class="log-card" shadow="never" v-loading="logsLoading">
      <template #header>
        <div class="card-header">邮件发送记录</div>
      </template>
      <el-empty v-if="!logList.length" description="暂无发送记录" />
      <el-table v-else :data="logList" stripe style="width: 100%" size="small">
        <el-table-column prop="toEmail" label="收件人" width="180" />
        <el-table-column prop="subject" label="主题" min-width="200" />
        <el-table-column prop="template" label="使用模板" width="120">
          <template #default="{ row }">
            {{ row.template?.name || '直接发送' }}
          </template>
        </el-table-column>
        <el-table-column prop="candidate" label="关联候选人" width="120">
          <template #default="{ row }">
            {{ row.candidate?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'sent' ? 'success' : 'danger'" size="small">
              {{ row.status === 'sent' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sentAt" label="发送时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.sentAt) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper" v-if="logPagination.total > 0">
        <el-pagination
          v-model:current-page="logPagination.page"
          v-model:page-size="logPagination.pageSize"
          :total="logPagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, prev, pager, next"
          @current-change="fetchLogs"
          @size-change="fetchLogs"
        />
      </div>
    </el-card>

    <!-- 模板编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑模板' : '新建模板'" width="700px">
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="formData.name" placeholder="如：面试邀请" />
        </el-form-item>
        <el-form-item label="邮件主题" prop="subject">
          <el-input v-model="formData.subject" placeholder="支持 {{变量名}} 语法" />
        </el-form-item>
        <el-form-item label="邮件正文" prop="body">
          <el-input
            v-model="formData.body"
            type="textarea"
            :rows="10"
            placeholder="支持 HTML 和 {{变量名}} 语法"
          />
        </el-form-item>
        <el-form-item label="预设变量">
          <el-select
            v-model="formData.variables"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入变量名，如 candidateName"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览对话框 -->
    <el-dialog v-model="previewVisible" title="模板预览" width="600px">
      <div class="preview-subject"><strong>主题：</strong>{{ previewData.subject }}</div>
      <div class="preview-body" v-html="previewData.body" />
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import {
  getEmailTemplates,
  getEmailLogs,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  getMailStatus,
  type EmailTemplate,
  type EmailLog,
} from '@/api/email';

const loading = ref(false);
const logsLoading = ref(false);
const templateList = ref<EmailTemplate[]>([]);
const logList = ref<EmailLog[]>([]);
const mailConfigured = ref(false);

const logPagination = reactive({ page: 1, pageSize: 10, total: 0 });

const dialogVisible = ref(false);
const isEdit = ref(false);
const currentId = ref('');
const formRef = ref<FormInstance>();
const submitting = ref(false);
const formData = reactive({
  name: '',
  subject: '',
  body: '',
  variables: [] as string[],
});

const formRules: FormRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  subject: [{ required: true, message: '请输入邮件主题', trigger: 'blur' }],
  body: [{ required: true, message: '请输入邮件正文', trigger: 'blur' }],
};

const previewVisible = ref(false);
const previewData = reactive({ subject: '', body: '' });

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function fetchTemplates() {
  loading.value = true;
  try {
    const res = await getEmailTemplates();
    if (res.success) templateList.value = res.data;
  } catch (error: any) {
    ElMessage.error(error.message || '获取模板失败');
  } finally {
    loading.value = false;
  }
}

async function fetchLogs() {
  logsLoading.value = true;
  try {
    const res = await getEmailLogs({ page: logPagination.page, pageSize: logPagination.pageSize });
    if (res.success) {
      logList.value = res.data;
      logPagination.total = res.pagination.total;
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取日志失败');
  } finally {
    logsLoading.value = false;
  }
}

async function checkMailStatus() {
  try {
    const res = await getMailStatus();
    if (res.success) mailConfigured.value = res.data.configured;
  } catch {
    // 静默失败
  }
}

function resetForm() {
  formData.name = '';
  formData.subject = '';
  formData.body = '';
  formData.variables = [];
}

function showCreateDialog() {
  isEdit.value = false;
  currentId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function showEditDialog(row: EmailTemplate) {
  isEdit.value = true;
  currentId.value = row.id;
  formData.name = row.name;
  formData.subject = row.subject;
  formData.body = row.body;
  formData.variables = row.variables || [];
  dialogVisible.value = true;
}

function previewTemplate(row: EmailTemplate) {
  previewData.subject = row.subject;
  previewData.body = row.body;
  previewVisible.value = true;
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit.value) {
      const res = await updateEmailTemplate(currentId.value, { ...formData });
      if (res.success) {
        ElMessage.success('模板更新成功');
        dialogVisible.value = false;
        fetchTemplates();
      }
    } else {
      const res = await createEmailTemplate({ ...formData });
      if (res.success) {
        ElMessage.success('模板创建成功');
        dialogVisible.value = false;
        fetchTemplates();
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: EmailTemplate) {
  try {
    await ElMessageBox.confirm(`确定要删除模板「${row.name}」吗？`, '删除确认', { type: 'warning' });
    const res = await deleteEmailTemplate(row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      fetchTemplates();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

onMounted(() => {
  fetchTemplates();
  fetchLogs();
  checkMailStatus();
});
</script>

<style scoped lang="scss">
.email-templates-page {
  padding: 20px;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .title-section {
      display: flex;
      align-items: center;
      gap: 12px;

      .page-title {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
        color: #303133;
      }
    }
  }

  .var-tag {
    margin-right: 6px;
    margin-bottom: 4px;
  }

  .log-card {
    margin-top: 20px;

    .card-header {
      font-weight: 500;
    }
  }

  .pagination-wrapper {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .preview-subject {
    margin-bottom: 16px;
    padding: 12px;
    background-color: #f5f7fa;
    border-radius: 4px;
  }

  .preview-body {
    padding: 16px;
    background-color: #f5f7fa;
    border-radius: 4px;
    line-height: 1.8;
    max-height: 400px;
    overflow-y: auto;

    :deep(p) {
      margin: 0 0 12px;
    }
  }
}
</style>
