<!--
  F5-C 猎头机构管理页
  HR / Admin 可见：机构 CRUD + 链接生成 + 转化漏斗
-->
<template>
  <div class="agencies-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">猎头机构</h2>
        <el-tag type="info" size="small">共 {{ agencyList.length }} 个机构</el-tag>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="showCreateDialog">
          <el-icon><Plus /></el-icon>新增机构
        </el-button>
      </div>
    </div>

    <el-card v-loading="loading" shadow="never">
      <el-empty v-if="!agencyList.length && !loading" description="暂无猎头机构" />
      <el-table v-else :data="agencyList" stripe style="width: 100%">
        <el-table-column prop="name" label="机构名称" min-width="160" />
        <el-table-column prop="contact" label="联系人" min-width="120">
          <template #default="{ row }">{{ row?.contact || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" min-width="130">
          <template #default="{ row }">{{ row?.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row?.enabled" type="success" size="small">启用</el-tag>
            <el-tag v-else type="info" size="small">停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="linkCount" label="链接数" width="90" align="center" />
        <el-table-column prop="referralCount" label="推荐数" width="90" align="center" />
        <el-table-column prop="remark" label="备注" min-width="140">
          <template #default="{ row }">{{ row?.remark || '-' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button type="success" link size="small" @click="showCreateLinkDialog(row)">生成链接</el-button>
            <el-button type="warning" link size="small" @click="showStatsDialog(row)">转化漏斗</el-button>
            <el-button
              :type="row?.enabled ? 'danger' : 'primary'"
              link
              size="small"
              @click="handleToggleEnabled(row)"
            >
              {{ row?.enabled ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑机构对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑机构' : '新增机构'"
      width="500px"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="机构名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入机构名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="联系人" prop="contact">
          <el-input v-model="formData.contact" placeholder="选填" maxlength="50" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="formData.phone" placeholder="选填" maxlength="30" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="formData.remark"
            type="textarea"
            :rows="3"
            placeholder="选填"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 生成链接对话框 -->
    <el-dialog v-model="linkDialogVisible" title="生成推荐链接" width="520px">
      <el-form ref="linkFormRef" :model="linkFormData" label-width="100px">
        <el-form-item label="关联职位">
          <el-select
            v-model="linkFormData.jobId"
            placeholder="不限职位（通用推荐）"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="job in jobOptions"
              :key="job.id"
              :label="job.title"
              :value="job.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="有效期">
          <el-radio-group v-model="linkFormData.expiresMode">
            <el-radio-button label="default">90 天（默认）</el-radio-button>
            <el-radio-button label="never">长期有效</el-radio-button>
            <el-radio-button label="custom">自定义</el-radio-button>
          </el-radio-group>
          <el-date-picker
            v-if="linkFormData.expiresMode === 'custom'"
            v-model="linkFormData.customExpiresAt"
            type="datetime"
            placeholder="选择到期时间"
            value-format="YYYY-MM-DDTHH:mm:ss[Z]"
            style="width: 100%; margin-top: 8px"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="linkSubmitting" @click="handleCreateLink">生成</el-button>
      </template>
    </el-dialog>

    <!-- 链接结果对话框（token 仅此一次返回，强制警示） -->
    <el-dialog
      v-model="resultDialogVisible"
      title="推荐链接已生成"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="链接仅本次显示，关闭后无法再次查看。请立即复制并妥善保存！"
      />
      <div class="result-url-row">
        <el-input v-model="resultUrl" readonly>
          <template #append>
            <el-button @click="handleCopyUrl">复制链接</el-button>
          </template>
        </el-input>
      </div>
      <template #footer>
        <el-button type="primary" @click="resultDialogVisible = false">我已保存，关闭</el-button>
      </template>
    </el-dialog>

    <!-- 转化漏斗对话框 -->
    <el-dialog v-model="statsDialogVisible" title="转化漏斗" width="640px">
      <div v-loading="statsLoading" class="stats-body">
        <div class="stats-metrics">
          <div class="metric-item">
            <div class="metric-label">推荐总数</div>
            <div class="metric-value">{{ currentStats?.total ?? 0 }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Offer 数</div>
            <div class="metric-value">{{ currentStats?.offers ?? 0 }}</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">入职数</div>
            <div class="metric-value">{{ currentStats?.joined ?? 0 }}</div>
          </div>
        </div>
        <div v-if="!currentStats?.stages?.length" class="stats-empty">
          <el-empty description="暂无转化数据" />
        </div>
        <v-chart v-else class="funnel-chart" :option="funnelOption" autoresize />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { FunnelChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import {
  getAgencyList,
  createAgency,
  updateAgency,
  createAgencyLink,
  getAgencyStats,
  type AgencyListItem,
  type AgencyStats,
} from '@/api/agency';
import { getJobList, type JobItem } from '@/api/job';

// 注册 ECharts 漏斗图所需组件（参照 stats/index.vue 范式，最小集）
use([CanvasRenderer, FunnelChart, TooltipComponent, LegendComponent, TitleComponent]);

// ============ 数据 ============
const loading = ref(false);
const agencyList = ref<AgencyListItem[]>([]);

// ============ 机构 CRUD 弹窗 ============
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref('');
const submitting = ref(false);
const formRef = ref<FormInstance>();
const formData = reactive({ name: '', contact: '', phone: '', remark: '' });

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入机构名称', trigger: 'blur' },
    { min: 1, max: 50, message: '机构名称长度为 1-50 个字符', trigger: 'blur' },
  ],
};

// ============ 列表加载 ============
async function fetchAgencyList() {
  loading.value = true;
  try {
    const res = await getAgencyList();
    if (res.success) agencyList.value = res.data;
  } catch {
    // 错误提示已在 request 拦截器统一处理
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  formData.name = '';
  formData.contact = '';
  formData.phone = '';
  formData.remark = '';
}

function showCreateDialog() {
  isEdit.value = false;
  editingId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function showEditDialog(row: AgencyListItem) {
  isEdit.value = true;
  editingId.value = row.id;
  formData.name = row.name;
  formData.contact = row.contact || '';
  formData.phone = row.phone || '';
  formData.remark = row.remark || '';
  dialogVisible.value = true;
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    if (isEdit.value) {
      const res = await updateAgency(editingId.value, {
        name: formData.name,
        contact: formData.contact || undefined,
        phone: formData.phone || undefined,
        remark: formData.remark || undefined,
      });
      if (res.success) {
        ElMessage.success('机构更新成功');
        dialogVisible.value = false;
        fetchAgencyList();
      }
    } else {
      const res = await createAgency({
        name: formData.name,
        contact: formData.contact || undefined,
        phone: formData.phone || undefined,
        remark: formData.remark || undefined,
      });
      if (res.success) {
        ElMessage.success('机构创建成功');
        dialogVisible.value = false;
        fetchAgencyList();
      }
    }
  } catch {
    // 错误提示已在 request 拦截器统一处理
  } finally {
    submitting.value = false;
  }
}

async function handleToggleEnabled(row: AgencyListItem) {
  if (row.enabled) {
    // 停用前确认警示（停用将级联失效该机构下全部链接）
    try {
      await ElMessageBox.confirm(
        `停用机构「${row.name}」后，该机构的所有推荐链接将立即失效。是否继续？`,
        '停用确认',
        { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' }
      );
    } catch {
      return; // 用户取消
    }
  }
  try {
    const res = await updateAgency(row.id, { enabled: !row.enabled });
    if (res.success) {
      ElMessage.success(row.enabled ? '机构已停用' : '机构已启用');
      fetchAgencyList();
    }
  } catch {
    // 错误提示已在 request 拦截器统一处理
  }
}

// ============ 链接生成 ============
const linkDialogVisible = ref(false);
const linkSubmitting = ref(false);
const linkFormRef = ref<FormInstance>();
const linkAgencyId = ref('');
const jobOptions = ref<JobItem[]>([]);

// 三态映射：default=缺省(不传 expiresAt)；never=显式 null=长期有效；custom=ISO 字符串
type ExpiresMode = 'default' | 'never' | 'custom';
const linkFormData = reactive({
  jobId: '',
  expiresMode: 'default' as ExpiresMode,
  customExpiresAt: '',
});

async function loadJobOptions() {
  try {
    const res = await getJobList({ page: 1, pageSize: 200 });
    if (res.success) jobOptions.value = res.data;
  } catch {
    // 静默失败，下拉为空
  }
}

function showCreateLinkDialog(row: AgencyListItem) {
  linkAgencyId.value = row.id;
  linkFormData.jobId = '';
  linkFormData.expiresMode = 'default';
  linkFormData.customExpiresAt = '';
  linkDialogVisible.value = true;
  loadJobOptions();
}

// ============ 链接结果弹窗 ============
const resultDialogVisible = ref(false);
const resultUrl = ref('');

async function handleCreateLink() {
  linkSubmitting.value = true;
  try {
    let expiresAt: string | null | undefined;
    if (linkFormData.expiresMode === 'default') {
      expiresAt = undefined; // 缺省 = 服务端默认 90 天
    } else if (linkFormData.expiresMode === 'never') {
      expiresAt = null; // 长期有效
    } else {
      expiresAt = linkFormData.customExpiresAt || undefined;
    }
    const res = await createAgencyLink(linkAgencyId.value, {
      jobId: linkFormData.jobId || undefined,
      expiresAt,
    });
    if (res.success) {
      const fullUrl = window.location.origin + res.data.referralUrl;
      resultUrl.value = fullUrl;
      linkDialogVisible.value = false;
      resultDialogVisible.value = true;
      fetchAgencyList(); // 刷新链接数
    }
  } catch {
    // 错误提示已在 request 拦截器统一处理
  } finally {
    linkSubmitting.value = false;
  }
}

async function handleCopyUrl() {
  try {
    await navigator.clipboard.writeText(resultUrl.value);
    ElMessage.success('链接已复制到剪贴板');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

// ============ 转化漏斗弹窗 ============
const statsDialogVisible = ref(false);
const statsLoading = ref(false);
const currentStats = ref<AgencyStats | null>(null);

async function showStatsDialog(row: AgencyListItem) {
  statsDialogVisible.value = true;
  statsLoading.value = true;
  currentStats.value = null;
  try {
    const res = await getAgencyStats(row.id);
    if (res.success) {
      currentStats.value = res.data;
    }
  } catch {
    // 错误提示已在 request 拦截器统一处理
  } finally {
    statsLoading.value = false;
  }
}

const funnelOption = computed(() => {
  const stages = currentStats.value?.stages || [];
  return {
    title: { text: '推荐转化漏斗', left: 'center' },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}人 ({d}%)',
    },
    series: [
      {
        name: '转化漏斗',
        type: 'funnel',
        left: '10%',
        top: 50,
        bottom: 30,
        width: '80%',
        min: 0,
        minSize: '0%',
        maxSize: '100%',
        sort: 'descending',
        gap: 2,
        label: {
          show: true,
          position: 'inside',
          formatter: '{b}\n{c}人',
        },
        labelLine: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        data: stages.map((s) => ({ name: s.stage, value: s.count })),
      },
    ],
  };
});

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

onMounted(() => {
  fetchAgencyList();
});
</script>

<style scoped lang="scss">
.agencies-page {
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

  .result-url-row {
    margin-top: 16px;

    :deep(.el-input__inner) {
      font-family: monospace;
      color: #303133;
    }
  }

  .stats-body {
    min-height: 360px;

    .stats-metrics {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;

      .metric-item {
        flex: 1;
        background-color: #f0f9ff;
        border-radius: 8px;
        padding: 16px;
        text-align: center;

        .metric-label {
          color: #909399;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .metric-value {
          color: #303133;
          font-size: 24px;
          font-weight: 600;
        }
      }
    }

    .funnel-chart {
      width: 100%;
      height: 360px;
    }

    .stats-empty {
      padding: 40px 0;
    }
  }
}
</style>