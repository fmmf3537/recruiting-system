<template>
  <div class="tag-management-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">标签管理</h2>
        <el-tag type="info" size="small">共 {{ tagList.length }} 个标签</el-tag>
      </div>
      <div class="header-actions">
        <el-button type="success" @click="handleInitPresets" :loading="initLoading">
          <el-icon><Refresh /></el-icon>初始化预设标签
        </el-button>
        <el-button type="primary" @click="showCreateDialog">
          <el-icon><Plus /></el-icon>新建标签
        </el-button>
      </div>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-empty v-if="!tagList.length" description="暂无标签" />
      <el-table v-else :data="tagList" stripe style="width: 100%">
        <el-table-column prop="name" label="标签名称" min-width="150">
          <template #default="{ row }">
            <el-tag :color="row.color" effect="dark" size="large">
              {{ row.name }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="color" label="颜色" width="120">
          <template #default="{ row }">
            <div class="color-preview">
              <div class="color-block" :style="{ backgroundColor: row.color }" />
              <span class="color-value">{{ row.color }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.category === 'preset'" type="success" size="small">预设</el-tag>
            <el-tag v-else type="info" size="small">自定义</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建/编辑标签对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑标签' : '新建标签'" width="500px">
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="80px">
        <el-form-item label="标签名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入标签名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="标签颜色" prop="color">
          <div class="color-picker-row">
            <el-color-picker v-model="formData.color" show-alpha :predefine="predefineColors" />
            <span class="color-text">{{ formData.color }}</span>
          </div>
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-radio-group v-model="formData.category">
            <el-radio-button label="preset">预设</el-radio-button>
            <el-radio-button label="custom">自定义</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  initPresetTags,
  type Tag,
} from '@/api/tag';

const loading = ref(false);
const initLoading = ref(false);
const tagList = ref<Tag[]>([]);

const dialogVisible = ref(false);
const isEdit = ref(false);
const currentId = ref('');
const formRef = ref<FormInstance>();
const submitting = ref(false);

const formData = reactive({
  name: '',
  color: '#409EFF',
  category: 'custom' as 'preset' | 'custom',
});

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入标签名称', trigger: 'blur' },
    { min: 1, max: 50, message: '标签名称长度为1-50个字符', trigger: 'blur' },
  ],
  color: [{ required: true, message: '请选择标签颜色', trigger: 'change' }],
};

// 预设颜色
const predefineColors = [
  '#67C23A',
  '#E6A23C',
  '#F56C6C',
  '#909399',
  '#409EFF',
  '#9254DE',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#FF9F43',
  '#10AC84',
  '#EE5A24',
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchTags() {
  loading.value = true;
  try {
    const res = await getTags();
    if (res.success) tagList.value = res.data;
  } catch (error: any) {
    ElMessage.error(error.message || '获取标签失败');
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  formData.name = '';
  formData.color = '#409EFF';
  formData.category = 'custom';
}

function showCreateDialog() {
  isEdit.value = false;
  currentId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function showEditDialog(row: Tag) {
  isEdit.value = true;
  currentId.value = row.id;
  formData.name = row.name;
  formData.color = row.color;
  formData.category = (row.category as 'preset' | 'custom') || 'custom';
  dialogVisible.value = true;
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit.value) {
      const res = await updateTag(currentId.value, { ...formData });
      if (res.success) {
        ElMessage.success('标签更新成功');
        dialogVisible.value = false;
        fetchTags();
      }
    } else {
      const res = await createTag({ ...formData });
      if (res.success) {
        ElMessage.success('标签创建成功');
        dialogVisible.value = false;
        fetchTags();
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: Tag) {
  try {
    await ElMessageBox.confirm(
      `确定要删除标签「${row.name}」吗？关联的候选人和职位将不再显示此标签。`,
      '删除确认',
      { type: 'warning' }
    );
    const res = await deleteTag(row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      fetchTags();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

async function handleInitPresets() {
  try {
    await ElMessageBox.confirm('确定要初始化预设标签吗？已存在的预设标签不会被重复创建。', '提示', {
      type: 'info',
    });
    initLoading.value = true;
    const res = await initPresetTags();
    if (res.success) {
      ElMessage.success(res.message || '预设标签初始化完成');
      fetchTags();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '初始化失败');
    }
  } finally {
    initLoading.value = false;
  }
}

onMounted(() => {
  fetchTags();
});
</script>

<style scoped lang="scss">
.tag-management-page {
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

    .header-actions {
      display: flex;
      gap: 12px;
    }
  }

  .color-preview {
    display: flex;
    align-items: center;
    gap: 8px;

    .color-block {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid #dcdfe6;
    }

    .color-value {
      font-size: 12px;
      color: #909399;
      font-family: monospace;
    }
  }

  .color-picker-row {
    display: flex;
    align-items: center;
    gap: 12px;

    .color-text {
      font-size: 13px;
      color: #606266;
      font-family: monospace;
    }
  }
}
</style>
