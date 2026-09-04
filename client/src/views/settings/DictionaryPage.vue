<template>
  <div class="dictionary-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">字典管理</h2>
        <span class="page-subtitle">管理系统基础参数（部门、城市等）</span>
      </div>
      <div class="header-actions">
        <el-button @click="handleExport">导出</el-button>
        <el-button type="primary" plain @click="importDialogVisible = true">导入</el-button>
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>新增字典项
        </el-button>
      </div>
    </div>

    <!-- 分类标签 -->
    <el-card class="category-card" shadow="never">
      <el-radio-group v-model="currentCategory" @change="handleCategoryChange">
        <el-radio-button v-for="cat in categories" :key="cat" :label="cat">
          {{ categoryLabel(cat) }}
        </el-radio-button>
      </el-radio-group>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="table-card" shadow="never" v-loading="dictionaryStore.loading">
      <el-table :data="displayList" stripe style="width: 100%">
        <el-table-column type="index" label="序号" width="80" align="center" />
        <el-table-column prop="code" label="编码" min-width="120" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="sortOrder" label="排序" width="100" align="center" />
        <el-table-column prop="enabled" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="备注" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑字典项' : '新增字典项'"
      width="500px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="80px">
        <el-form-item label="分类">
          <el-input :model-value="categoryText" disabled />
        </el-form-item>
        <el-form-item v-if="isEdit" label="编码" prop="code">
          <el-input v-model="formData.code" disabled />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入显示名称" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="formData.sortOrder" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态" prop="enabled">
          <el-radio-group v-model="formData.enabled">
            <el-radio :label="true">启用</el-radio>
            <el-radio :label="false">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <DictionaryImportDialog
      v-model="importDialogVisible"
      :category="currentCategory"
      @imported="handleImported"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useDictionaryStore } from '@/stores/dictionary';
import {
  createDictionary,
  updateDictionary,
  deleteDictionary,
  getCategories,
  exportDictionaryCategory,
  type DictionaryItem,
} from '@/api/dictionary';
import DictionaryImportDialog from '@/components/settings/DictionaryImportDialog.vue';

const dictionaryStore = useDictionaryStore();

const currentCategory = ref('department');
const categories = ref<string[]>([]);
const importDialogVisible = ref(false);

/** 已知分类中文名；清单以外的分类直接显示 code（服务端为分类事实源） */
const CATEGORY_LABELS: Record<string, string> = {
  department: '所属部门',
  location: '工作城市',
  education: '学历',
  source: '来源渠道',
  job_type: '招聘类型',
  skills: '技能要求',
  evaluation_dimension: '评估维度',
  matching_dimension: '匹配维度',
  interview_focus_type: '考察方向',
  hr_score_rule: '积分规则',
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

const categoryText = computed(() => categoryLabel(currentCategory.value));

const displayList = computed(() => {
  return dictionaryStore.byCategory(currentCategory.value, true);
});

function handleCategoryChange() {
  dictionaryStore.fetchDictionaries(currentCategory.value);
}

function handleExport() {
  const items = dictionaryStore.items.filter((i) => i.category === currentCategory.value);
  if (!items.length) {
    ElMessage.warning('当前分类无数据');
    return;
  }
  exportDictionaryCategory(currentCategory.value, items);
}

async function handleImported() {
  // 弹窗内保留结果明细；此处只刷新当前分类数据
  await dictionaryStore.refreshCategory(currentCategory.value);
}

// 弹窗相关
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const formData = reactive({
  id: '',
  category: 'department',
  code: '',
  name: '',
  sortOrder: 0,
  enabled: true,
  description: '',
});

const formRules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
};

function resetForm() {
  formData.id = '';
  formData.category = currentCategory.value;
  formData.code = '';
  formData.name = '';
  formData.sortOrder = 0;
  formData.enabled = true;
  formData.description = '';
}

function handleAdd() {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
}

function handleEdit(row: DictionaryItem) {
  isEdit.value = true;
  formData.id = row.id;
  formData.category = row.category;
  formData.code = row.code;
  formData.name = row.name;
  formData.sortOrder = row.sortOrder;
  formData.enabled = row.enabled;
  formData.description = row.description || '';
  dialogVisible.value = true;
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit.value) {
      const res = await updateDictionary(formData.id, {
        code: formData.code,
        name: formData.name,
        sortOrder: formData.sortOrder,
        enabled: formData.enabled,
        description: formData.description,
      });
      if (res.success) {
        ElMessage.success('更新成功');
        dialogVisible.value = false;
        await dictionaryStore.refreshCategory(formData.category);
      }
    } else {
      const res = await createDictionary({
        category: formData.category,
        name: formData.name,
        sortOrder: formData.sortOrder,
        enabled: formData.enabled,
        description: formData.description,
      });
      if (res.success) {
        ElMessage.success('创建成功');
        dialogVisible.value = false;
        await dictionaryStore.refreshCategory(formData.category);
      }
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: DictionaryItem) {
  try {
    await ElMessageBox.confirm(`确定要删除 "${row.name}" 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    const res = await deleteDictionary(row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      await dictionaryStore.refreshCategory(row.category);
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.error || error.message || '删除失败');
    }
  }
}

onMounted(async () => {
  try {
    const res = await getCategories();
    const list = res.data ?? [];
    categories.value = list;
    // department 在清单则保留；否则 fallback 第一个
    if (list.length && !list.includes(currentCategory.value)) {
      [currentCategory.value] = list;
    }
  } catch {
    // 拦截器已提示；分类为空时 radio 不渲染
  }
  dictionaryStore.fetchDictionaries('department');
  dictionaryStore.fetchDictionaries('location');
  if (currentCategory.value !== 'department' && currentCategory.value !== 'location') {
    dictionaryStore.fetchDictionaries(currentCategory.value);
  }
});
</script>

<style scoped lang="scss">
.dictionary-page {
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
      font-size: 20px;
      font-weight: 500;
    }
    .page-subtitle {
      color: #909399;
      font-size: 14px;
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }
}

.category-card {
  margin-bottom: 20px;
}

.table-card {
  :deep(.el-card__body) {
    padding: 0;
  }
}
</style>
