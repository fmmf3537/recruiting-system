<template>
  <el-card v-loading="loading" shadow="never" class="match-score-card" :element-loading-text="loadingText">
    <template #header>
      <div class="card-header">
        <span>AI 匹配分</span>
        <div class="header-actions">
          <!-- 手动补打：interviewer 隐藏 -->
          <template v-if="canManual">
            <el-select
              v-model="manualJobId"
              placeholder="选择职位补打"
              size="small"
              style="width: 180px"
              :disabled="triggering"
            >
              <el-option
                v-for="job in candidateJobs"
                :key="job.id"
                :label="job.title || '未命名职位'"
                :value="job.id"
              />
            </el-select>
            <el-button
              type="primary"
              size="small"
              :disabled="!manualJobId"
              :loading="triggering && manualTriggerJobId === manualJobId"
              @click="handleTrigger(manualJobId, true)"
            >
              <el-icon><MagicStick /></el-icon>手动补打
            </el-button>
          </template>
        </div>
      </div>
    </template>

    <!-- 空态：未打分 -->
    <el-empty
      v-if="!loading && scores.length === 0"
      :image-size="60"
      description="暂无 AI 匹配分，点击右上角选择职位后可手动补打"
    />

    <!-- 打分列表 -->
    <div v-else class="score-list">
      <div v-for="s in scores" :key="s.id" class="score-item">
        <div class="score-header">
          <div class="score-title">
            <span class="job-title">{{ s.jobTitle || '未知职位' }}</span>
            <el-tag :type="getGradeTagType(s.grade)" size="small" effect="dark">
              {{ getGradeText(s.grade) }}
            </el-tag>
            <el-tag v-if="s.stale" type="info" size="small">JD 已更新，分数可能过期</el-tag>
          </div>
          <div class="score-summary">
            <span class="overall-score">{{ s.overallScore }}</span>
            <span class="score-unit">/ 100</span>
          </div>
        </div>

        <p v-if="s.summary" class="summary">{{ s.summary }}</p>

        <!-- 维度明细 -->
        <div v-if="s.dimensions?.length" class="dimensions">
          <div v-for="d in s.dimensions" :key="d.code || d.name" class="dimension-row">
            <div class="dim-header">
              <span class="dim-name">{{ d.name }}</span>
              <span v-if="typeof d.weight === 'number'" class="dim-weight">权重 {{ d.weight }}%</span>
              <span class="dim-score">{{ d.score }}</span>
            </div>
            <el-progress
              :percentage="d.score"
              :stroke-width="8"
              :show-text="false"
              :color="getDimensionColor(d.score)"
            />
            <div v-if="d.comment" class="dim-comment">{{ d.comment }}</div>
          </div>
        </div>

        <!-- 亮点 / 风险 -->
        <div v-if="s.highlights?.length || s.risks?.length" class="meta-section">
          <el-collapse>
            <el-collapse-item v-if="s.highlights?.length" title="亮点" name="hl">
              <ul class="meta-list">
                <li v-for="(h, idx) in s.highlights" :key="`hl-${idx}`">{{ h }}</li>
              </ul>
            </el-collapse-item>
            <el-collapse-item v-if="s.risks?.length" title="风险" name="rk">
              <ul class="meta-list meta-risk">
                <li v-for="(r, idx) in s.risks" :key="`rk-${idx}`">{{ r }}</li>
              </ul>
            </el-collapse-item>
          </el-collapse>
        </div>

        <div class="score-footer">
          <span class="update-time">更新于 {{ formatDateTime(s.updatedAt) }}</span>
          <el-button
            v-if="canManual"
            type="primary"
            link
            size="small"
            :loading="triggering && manualTriggerJobId === s.jobId"
            @click="handleTrigger(s.jobId, true)"
          >
            <el-icon><Refresh /></el-icon>重新打分
          </el-button>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { MagicStick, Refresh } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import {
  getCandidateMatchScores,
  triggerMatchScore,
  type CandidateMatchScore,
} from '@/api/match-score';

// ============ Props ============

interface JobOption {
  id: string;
  title?: string;
}

const props = defineProps<{
  candidateId: string;
  candidateJobs?: JobOption[];
}>();

// ============ Auth & 角色门禁 ============

const authStore = useAuthStore();
// 手动补打按钮可见性：interviewer 隐藏（服务端仍会兜底拦截）
const canManual = computed(() => {
  const role = authStore.userInfo?.role;
  return role === 'admin' || role === 'member' || role === 'hr' || role === 'hiring_manager';
});

// ============ 状态 ============

const scores = ref<CandidateMatchScore[]>([]);
const loading = ref(false);
const triggering = ref(false);
const manualTriggerJobId = ref<string | null>(null);
const manualJobId = ref<string>('');
// 60s 可能耗时的 loading 文案
const loadingText = 'AI 打分中，可能需要 1 分钟，请耐心等待...';

// ============ 数据加载 ============

async function loadScores() {
  loading.value = true;
  try {
    const res = await getCandidateMatchScores(props.candidateId);
    if (res.success) {
      scores.value = res.data || [];
    }
  } catch {
    // request 层已统一 ElMessage 提示
    scores.value = [];
  } finally {
    loading.value = false;
  }
}

// ============ 触发打分 ============

async function handleTrigger(jobId: string, isManual: boolean) {
  if (!jobId) return;
  manualTriggerJobId.value = jobId;
  triggering.value = true;
  try {
    const res = await triggerMatchScore(props.candidateId, jobId);
    if (res.success) {
      ElMessage.success(isManual ? '打分完成' : '打分完成');
      // 重新拉列表（保留已有其他职位的打分）
      await loadScores();
    }
  } catch {
    // request 层已统一错误提示；失败保留原列表不动
  } finally {
    triggering.value = false;
    manualTriggerJobId.value = null;
    if (isManual) manualJobId.value = '';
  }
}

// ============ 辅助 ============

function getGradeText(grade: string): string {
  return (
    {
      strong_recommend: '强烈推荐',
      recommend: '推荐',
      consider: '待定',
      not_recommend: '不推荐',
    } as Record<string, string>
  )[grade] || grade;
}

function getGradeTagType(grade: string): string {
  return (
    {
      strong_recommend: 'success',
      recommend: 'primary',
      consider: 'warning',
      not_recommend: 'danger',
    } as Record<string, string>
  )[grade] || 'info';
}

// 维度分：>=85 绿 / >=70 蓝 / >=50 黄 / <50 红
function getDimensionColor(score: number): string {
  if (score >= 85) return '#67c23a';
  if (score >= 70) return '#409eff';
  if (score >= 50) return '#e6a23c';
  return '#f56c6c';
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

onMounted(loadScores);
</script>

<style scoped lang="scss">
.match-score-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;

    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  }

  .score-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .score-item {
    padding: 16px;
    background-color: #f5f7fa;
    border-radius: 8px;

    .score-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .score-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;

        .job-title {
          font-weight: 500;
          font-size: 15px;
          color: #303133;
        }
      }

      .score-summary {
        .overall-score {
          font-size: 28px;
          font-weight: 600;
          color: #409eff;
          line-height: 1;
        }

        .score-unit {
          font-size: 13px;
          color: #909399;
          margin-left: 4px;
        }
      }
    }

    .summary {
      margin: 8px 0 12px;
      font-size: 13px;
      color: #606266;
      line-height: 1.6;
    }

    .dimensions {
      display: flex;
      flex-direction: column;
      gap: 10px;

      .dimension-row {
        .dim-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 13px;

          .dim-name {
            color: #303133;
            font-weight: 500;
          }

          .dim-weight {
            color: #909399;
            font-size: 12px;
          }

          .dim-score {
            margin-left: auto;
            color: #606266;
            font-weight: 500;
          }
        }

        .dim-comment {
          margin-top: 4px;
          font-size: 12px;
          color: #909399;
          line-height: 1.5;
        }
      }
    }

    .meta-section {
      margin-top: 12px;

      .meta-list {
        margin: 0;
        padding-left: 18px;
        font-size: 13px;
        color: #606266;
        line-height: 1.8;

        &.meta-risk li {
          color: #f56c6c;
        }
      }
    }

    .score-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px dashed #dcdfe6;

      .update-time {
        font-size: 12px;
        color: #909399;
      }
    }
  }
}
</style>