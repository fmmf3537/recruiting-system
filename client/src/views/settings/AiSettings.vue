<template>
  <div class="ai-settings-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">AI 设置</h2>
        <span class="page-subtitle">管理 AI 提供方与密钥；保存后立即生效，无需重启后端</span>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="改动保存后立即对简历解析、AI 匹配、打分、JD 助手、面试出题生效。密钥仅以掩码展示，留空保存不会覆盖已有 Key。"
      style="margin-bottom: 16px"
    />

    <div v-loading="loading" class="provider-grid">
      <el-empty v-if="!loading && !providers.length" description="暂无提供方" />
      <el-card
        v-for="row in providers"
        :key="row.provider"
        shadow="never"
        class="provider-card"
      >
        <template #header>
          <div class="card-header">
            <span class="provider-name">{{ row.name }}</span>
            <el-tag :type="statusTagType(row)" size="small">{{ statusLabel(row) }}</el-tag>
          </div>
        </template>

        <el-form label-width="90px" @submit.prevent>
          <el-form-item label="Base URL">
            <el-input v-model="forms[row.provider].baseUrl" placeholder="https://" />
          </el-form-item>
          <el-form-item label="模型">
            <el-input v-model="forms[row.provider].model" placeholder="模型名" maxlength="100" />
          </el-form-item>
          <el-form-item label="API Key">
            <el-input
              v-model="forms[row.provider].apiKey"
              type="password"
              show-password
              :placeholder="row.apiKeyMask || '未配置，留空 = 不修改'"
              autocomplete="new-password"
            />
            <div class="form-tip">留空 = 不修改已保存的密钥</div>
          </el-form-item>
          <el-form-item>
            <el-button
              type="success"
              :disabled="row.isActive"
              :loading="activating[row.provider]"
              @click="handleActivate(row)"
            >
              启用此提供方
            </el-button>
            <el-button
              type="primary"
              :loading="saving[row.provider]"
              @click="handleSave(row)"
            >
              保存
            </el-button>
            <el-button :loading="testing[row.provider]" @click="handleTest(row)">
              测试连接
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getAiProviders,
  updateAiProvider,
  testAiProvider,
  type AiProviderId,
  type AiProviderItem,
} from '@/api/aiSettings';

interface ProviderForm {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const loading = ref(false);
const providers = ref<AiProviderItem[]>([]);
const forms = reactive<Record<AiProviderId, ProviderForm>>({
  deepseek: { baseUrl: '', model: '', apiKey: '' },
  zhipu: { baseUrl: '', model: '', apiKey: '' },
  kimi: { baseUrl: '', model: '', apiKey: '' },
  minimax: { baseUrl: '', model: '', apiKey: '' },
});
const saving = reactive<Record<string, boolean>>({});
const activating = reactive<Record<string, boolean>>({});
const testing = reactive<Record<string, boolean>>({});

function statusLabel(row: AiProviderItem): string {
  if (row.isActive) return '启用中';
  if (row.enabled) return '已启用';
  return '停用';
}

function statusTagType(row: AiProviderItem): 'success' | 'warning' | 'info' {
  if (row.isActive) return 'success';
  if (row.enabled) return 'warning';
  return 'info';
}

function syncForms(list: AiProviderItem[]) {
  list.forEach((row) => {
    forms[row.provider].baseUrl = row.baseUrl;
    forms[row.provider].model = row.model;
    forms[row.provider].apiKey = '';
  });
}

async function fetchList() {
  loading.value = true;
  try {
    const res = await getAiProviders();
    providers.value = res.data ?? [];
    syncForms(providers.value);
  } finally {
    loading.value = false;
  }
}

async function handleSave(row: AiProviderItem) {
  const form = forms[row.provider];
  saving[row.provider] = true;
  try {
    const res = await updateAiProvider(row.provider, {
      baseUrl: form.baseUrl,
      model: form.model,
      apiKey: form.apiKey || undefined,
    });
    if (res.success) {
      ElMessage.success('保存成功，已立即生效');
      form.apiKey = '';
      await fetchList();
    }
  } catch (error) {
    // 后端错误已由 request 拦截器提示；此处兜底展示并避免未处理的 Promise rejection
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving[row.provider] = false;
  }
}

async function handleActivate(row: AiProviderItem) {
  const form = forms[row.provider];
  activating[row.provider] = true;
  try {
    const res = await updateAiProvider(row.provider, {
      isActive: true,
      apiKey: form.apiKey || undefined,
    });
    if (res.success) {
      ElMessage.success(`已启用 ${row.name}`);
      form.apiKey = '';
      await fetchList();
    }
  } catch (error) {
    // 无 Key 激活等业务错误由拦截器提示；此处兜底并避免未处理的 Promise rejection
    ElMessage.error(error instanceof Error ? error.message : '启用失败');
  } finally {
    activating[row.provider] = false;
  }
}

async function handleTest(row: AiProviderItem) {
  const form = forms[row.provider];
  testing[row.provider] = true;
  try {
    const res = await testAiProvider({
      provider: row.provider,
      apiKey: form.apiKey || undefined,
    });
    if (res.data?.ok) {
      ElMessage.success('连接成功');
    } else {
      ElMessage.error(res.data?.error || '连接测试失败');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '连接测试失败');
  } finally {
    testing[row.provider] = false;
  }
}

onMounted(() => {
  fetchList();
});
</script>

<style scoped lang="scss">
.ai-settings-page {
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
      display: block;
    }
  }
}
.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}
.provider-card {
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .provider-name {
    font-size: 16px;
    font-weight: 500;
  }
  .form-tip {
    margin-top: 4px;
    font-size: 12px;
    color: #909399;
  }
}
</style>
