<template>
  <div class="hr-score-page">
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">团队考核</h2>
        <span class="page-subtitle">排名全员可见；他人具体分数仅 admin 可见</span>
      </div>
      <div class="header-actions">
        <el-radio-group v-model="period" @change="fetchTeam">
          <el-radio-button v-for="opt in PERIOD_OPTIONS" :key="opt.value" :label="opt.value">
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
        <el-button :loading="exporting" @click="handleExport">导出 CSV</el-button>
        <el-button @click="goReport">查看报表</el-button>
        <el-button @click="goRules">查看规则</el-button>
      </div>
    </div>

    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">总人数</div>
          <div class="stat-value">{{ members.length }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">综合总分</div>
          <div class="stat-value">{{ formatScore(teamTotal) }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-loading="loading" shadow="never">
      <el-empty v-if="!loading && members.length === 0" description="暂无考核数据" />
      <el-table
        v-else
        :data="members"
        stripe
        style="width: 100%"
        :row-class-name="rowClassName"
      >
        <el-table-column prop="rank" label="排名" width="80" />
        <el-table-column prop="userName" label="姓名" min-width="140">
          <template #default="{ row }">
            {{ row.userName || '—' }}
            <el-tag v-if="row.isSelf" type="primary" size="small" style="margin-left: 8px">我</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="综合分" width="120">
          <template #default="{ row }">{{ formatScore(row.totalScore) }}</template>
        </el-table-column>
        <el-table-column label="业务分" width="120">
          <template #default="{ row }">{{ formatScore(row.businessPts) }}</template>
        </el-table-column>
        <el-table-column label="过程分" width="120">
          <template #default="{ row }">{{ formatScore(row.processPts) }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="160">
          <template #default="{ row }">
            <span v-if="row.isSelf">本人</span>
            <span v-else-if="row.totalScore === null">仅 admin 可见分数</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  PERIOD_OPTIONS,
  exportHrScoreCsv,
  formatScore,
  getTeamRanking,
  type ScorePeriod,
  type TeamMember,
} from '@/api/hr-score';

const router = useRouter();
const period = ref<ScorePeriod>('week');
const loading = ref(false);
const exporting = ref(false);
const members = ref<TeamMember[]>([]);

const teamTotal = computed(() => {
  const nums = members.value
    .map((m) => m.totalScore)
    .filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0);
});

function rowClassName({ row }: { row: TeamMember }): string {
  return row.isSelf ? 'is-self' : '';
}

async function fetchTeam() {
  loading.value = true;
  try {
    const res = await getTeamRanking({ period: period.value });
    members.value = res.data ?? [];
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '加载团队排名失败');
  } finally {
    loading.value = false;
  }
}

async function handleExport() {
  exporting.value = true;
  try {
    await exportHrScoreCsv(period.value);
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

function goReport() {
  router.push('/hr-score/report');
}

function goRules() {
  router.push('/settings/hr-score-rules');
}

onMounted(() => {
  fetchTeam();
});
</script>

<style scoped lang="scss">
.hr-score-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  color: #303133;
}

.page-subtitle {
  margin-left: 12px;
  color: #909399;
  font-size: 13px;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  .stat-label {
    font-size: 13px;
    color: #909399;
    margin-bottom: 8px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: #303133;
  }
}

:deep(.is-self) {
  background: #ecf5ff !important;
  font-weight: 600;
}
</style>
