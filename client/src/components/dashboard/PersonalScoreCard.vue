<template>
  <el-card shadow="hover" class="stat-card" @click="goToMyScore">
    <div class="stat-content">
      <div class="stat-icon blue">
        <el-icon :size="40"><Trophy /></el-icon>
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ dayDisplay }}</div>
        <div class="stat-title">我的今日积分</div>
        <div class="stat-desc">本周 {{ weekDisplay }} · 排名 {{ rankDisplay }}</div>
        <div v-if="trend !== null" class="stat-trend">
          <el-tag :type="trend > 0 ? 'success' : trend < 0 ? 'danger' : 'info'" size="small">
            {{ trend > 0 ? '+' : '' }}{{ formatScore(trend) }}
          </el-tag>
          <span>较本周均值</span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Trophy } from '@element-plus/icons-vue';
import { formatScore, getMyScores } from '@/api/hr-score';

const router = useRouter();
const dayScore = ref<number | null>(null);
const weekScore = ref<number | null>(null);
const weekRank = ref<number | null>(null);

const dayDisplay = computed(() => {
  if (dayScore.value === null || dayScore.value === 0) return '暂无积分';
  return formatScore(dayScore.value);
});

const weekDisplay = computed(() => formatScore(weekScore.value ?? 0));
const rankDisplay = computed(() => (weekRank.value === null ? '—' : `第 ${weekRank.value}`));

/** 今日 vs 本周日均（接口无「昨日」快照，用本周日均近似趋势） */
const trend = computed(() => {
  if (dayScore.value === null || weekScore.value === null) return null;
  const dailyAvg = weekScore.value / 7;
  return Math.round((dayScore.value - dailyAvg) * 10) / 10;
});

async function loadScores() {
  try {
    const [dayRes, weekRes] = await Promise.all([
      getMyScores({ period: 'day', page: 1, pageSize: 1 }),
      getMyScores({ period: 'week', page: 1, pageSize: 1 }),
    ]);
    dayScore.value = dayRes.data.aggregate?.totalScore ?? 0;
    weekScore.value = weekRes.data.aggregate?.totalScore ?? 0;
    weekRank.value = weekRes.data.aggregate?.rank ?? weekRes.data.rank ?? null;
  } catch {
    // 拦截器已提示；卡片保持空态
    dayScore.value = 0;
    weekScore.value = 0;
  }
}

function goToMyScore() {
  router.push('/hr-score/my');
}

onMounted(() => {
  loadScores();
});
</script>

<style scoped lang="scss">
.stat-card {
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  &.blue {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
  margin-bottom: 4px;
}

.stat-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 4px;
}

.stat-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
