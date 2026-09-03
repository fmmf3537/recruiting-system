<template>
  <div class="hr-score-rules-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">积分规则</h2>
      </div>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="历史不回溯——调整分值只影响新事件，已记分明细保持原值"
      style="margin-bottom: 16px"
    />

    <el-card v-loading="loading" shadow="never">
      <el-empty v-if="!loading && rules.length === 0" description="暂无积分规则" />
      <el-table v-else :data="rules" stripe style="width: 100%">
        <el-table-column prop="code" label="编码" min-width="160" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="描述（分值）" min-width="120">
          <template #default="{ row }">{{ row.description ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.enabled" type="success" size="small">启用</el-tag>
            <el-tag v-else type="info" size="small">停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="编辑积分规则" width="480px">
      <el-form label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="form.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="分值">
          <el-input v-model="form.description" type="number" placeholder="如 2 或 -10" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { listRules, updateRule, type RuleViewItem } from '@/api/hr-score';

const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const rules = ref<RuleViewItem[]>([]);
const editingCode = ref('');
const form = reactive({
  name: '',
  description: '',
  enabled: true,
});

async function fetchRules() {
  loading.value = true;
  try {
    const res = await listRules();
    rules.value = res.data ?? [];
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '加载规则失败');
  } finally {
    loading.value = false;
  }
}

function openEdit(row: RuleViewItem) {
  editingCode.value = row.code;
  form.name = row.name;
  form.description = row.description ?? '';
  form.enabled = row.enabled;
  dialogVisible.value = true;
}

async function handleSave() {
  saving.value = true;
  try {
    await updateRule(editingCode.value, {
      name: form.name,
      description: form.description,
      enabled: form.enabled,
    });
    ElMessage.success('规则已更新（仅影响后续新事件）');
    dialogVisible.value = false;
    await fetchRules();
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  fetchRules();
});
</script>

<style scoped lang="scss">
.hr-score-rules-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  color: #303133;
}
</style>
