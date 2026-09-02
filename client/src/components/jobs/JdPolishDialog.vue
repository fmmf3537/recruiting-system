<template>
  <el-dialog
    :model-value="modelValue"
    title="AI JD 完善建议"
    width="900px"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-loading="loading" :element-loading-text="loadingText" class="jd-polish-dialog">
      <!-- 未诊断前：操作面板 -->
      <div v-if="!result" class="pre-state">
        <p class="hint">
          将对当前职位描述（长度 {{ jdText?.length || 0 }} 字）进行 AI 诊断，给出问题清单与优化稿。
          <br />诊断可能需要 1 分钟，请耐心等待。
        </p>
        <div class="actions">
          <el-button type="primary" :loading="loading" @click="handleDiagnose">
            开始诊断
          </el-button>
          <el-button @click="handleClose">取消</el-button>
        </div>
      </div>

      <!-- 诊断完成：左右对照 -->
      <div v-else class="result-state">
        <div class="columns">
          <!-- 左：原 JD -->
          <div class="col col-original">
            <div class="col-title">原 JD</div>
            <pre class="jd-preview readonly">{{ result.originalText }}</pre>
          </div>

          <!-- 右：问题 + 优化稿 -->
          <div class="col col-improved">
            <div class="section">
              <div class="section-title">
                问题清单
                <el-tag size="small" type="info">{{ result.issues.length }} 条</el-tag>
              </div>
              <div v-if="result.issues.length === 0" class="empty">暂无问题，JD 已经很棒了 🎉</div>
              <ul v-else class="issue-list">
                <li v-for="(it, idx) in result.issues" :key="idx" class="issue-item">
                  <div class="issue-head">
                    <el-tag :type="severityTagType(it.severity)" size="small" effect="dark">
                      {{ it.severity }}
                    </el-tag>
                    <span class="issue-title">{{ it.title }}</span>
                  </div>
                  <div v-if="it.detail" class="issue-detail">{{ it.detail }}</div>
                </li>
              </ul>
            </div>

            <div class="section">
              <div class="section-title">优化稿预览</div>
              <pre class="jd-preview">{{ result.improvedJd }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div v-if="result" class="dialog-footer">
        <el-button :disabled="loading" @click="handleRegenerate">重新生成</el-button>
        <el-button type="primary" :disabled="loading" @click="handleApply">
          采用优化稿
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { polishJd, type JdIssue, type JdIssueSeverity } from '@/api/jd-assist';

interface PolishMeta {
  title?: string;
  level?: string;
  departments?: string[];
  type?: string;
}

const props = defineProps<{
  modelValue: boolean;
  jdText: string;
  meta?: PolishMeta;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'apply', improvedJd: string): void;
}>();

const loading = ref(false);
const loadingText = 'AI 诊断中，可能需要 1 分钟，请耐心等待...';

interface ResultState {
  originalText: string;
  issues: JdIssue[];
  improvedJd: string;
}
const result = ref<ResultState | null>(null);

// 打开时重置（destroy-on-close 也会卸载，但显式重置更稳妥）
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      result.value = null;
      loading.value = false;
    }
  }
);

function severityTagType(sev: JdIssueSeverity): 'danger' | 'warning' | 'info' {
  if (sev === '高') return 'danger';
  if (sev === '中') return 'warning';
  return 'info';
}

async function handleDiagnose() {
  if (!props.jdText || !props.jdText.trim()) {
    return;
  }
  loading.value = true;
  try {
    const res = await polishJd({ jdText: props.jdText, meta: props.meta });
    if (res.success) {
      result.value = {
        originalText: props.jdText,
        issues: res.data.issues || [],
        improvedJd: res.data.improvedJd || '',
      };
    }
  } catch {
    // request 层已统一 ElMessage 提示
  } finally {
    loading.value = false;
  }
}

function handleRegenerate() {
  result.value = null;
  handleDiagnose();
}

function handleApply() {
  if (!result.value) return;
  emit('apply', result.value.improvedJd);
  emit('update:modelValue', false);
}

function handleClose() {
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.jd-polish-dialog {
  min-height: 360px;
}

.pre-state {
  padding: 16px 4px;

  .hint {
    color: #606266;
    line-height: 1.8;
    margin-bottom: 20px;
  }

  .actions {
    display: flex;
    gap: 12px;
  }
}

.columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.col-title {
  font-weight: 500;
  color: #303133;
  font-size: 14px;
}

.section {
  background-color: #f5f7fa;
  border-radius: 8px;
  padding: 12px;

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    color: #303133;
    margin-bottom: 10px;
    font-size: 14px;
  }
}

.issue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 260px;
  overflow-y: auto;
}

.issue-item {
  background-color: #fff;
  border-radius: 6px;
  padding: 10px 12px;

  .issue-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .issue-title {
    color: #303133;
    font-size: 14px;
    font-weight: 500;
  }

  .issue-detail {
    margin-top: 6px;
    color: #606266;
    font-size: 13px;
    line-height: 1.6;
  }
}

.empty {
  color: #909399;
  font-size: 13px;
  padding: 10px 4px;
}

.jd-preview {
  margin: 0;
  padding: 12px;
  background-color: #fff;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  max-height: 320px;
  overflow-y: auto;

  &.readonly {
    background-color: #fafafa;
    color: #606266;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
