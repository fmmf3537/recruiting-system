<template>
  <el-card v-loading="loadingList" shadow="never" class="question-outline-card">
    <template #header>
      <div class="card-header">
        <span class="card-title">AI 面试大纲</span>
        <div class="header-actions">
          <!-- 版本切换：已有版本时可切换查看 -->
          <el-select
            v-if="versions.length"
            v-model="selectedVersion"
            size="small"
            class="version-select"
            @change="handleVersionChange"
          >
            <el-option
              v-for="v in versionOptions"
              :key="v.value"
              :label="v.label"
              :value="v.value"
            />
          </el-select>
          <el-button
            type="primary"
            size="small"
            :loading="generating"
            :element-loading-text="generating ? 'AI 生成中，请稍候…' : undefined"
            @click="openGenerateDialog()"
          >
            <el-icon><MagicStick /></el-icon>
            {{ versions.length ? '再生成' : '生成大纲' }}
          </el-button>
        </div>
      </div>
    </template>

    <!-- 空态 -->
    <el-empty
      v-if="!loadingList && versions.length === 0"
      description="暂无大纲，点击右上角生成"
      :image-size="80"
    />

    <!-- 大纲展示 -->
    <div v-else class="outline-body">
      <div class="outline-meta">
        <el-tag size="small" type="info">
          考察方向：{{ focusTypeName(currentVersion?.focusType) }}
        </el-tag>
        <el-tag size="small" effect="plain">v{{ currentVersion?.version }}</el-tag>
        <span class="create-time">创建于 {{ formatDateTime(currentVersion?.createdAt) }}</span>
        <span v-if="currentVersion?.adjustNote" class="adjust-note">
          调整要求：{{ currentVersion.adjustNote }}
        </span>
      </div>

      <el-alert
        v-if="currentVersion?.outline?.durationAdvice"
        :title="currentVersion.outline.durationAdvice"
        type="info"
        :closable="false"
        show-icon
        class="duration-alert"
      />

      <!-- 只读模式 -->
      <template v-if="!editing">
        <div
          v-for="(sec, sIdx) in currentVersion?.outline?.sections || []"
          :key="`s-${sIdx}`"
          class="outline-section"
        >
          <div class="section-theme">{{ sIdx + 1 }}. {{ sec.theme }}</div>
          <div
            v-for="(q, qIdx) in sec.questions"
            :key="`q-${sIdx}-${qIdx}`"
            class="outline-question"
          >
            <div class="question-line">
              <span class="question-label">Q{{ qIdx + 1 }}</span>
              <span class="question-text">{{ q.question }}</span>
            </div>
            <div v-if="q.intent" class="question-intent">考察意图：{{ q.intent }}</div>
            <div v-if="q.followUp" class="question-followup">追问：{{ q.followUp }}</div>
            <el-collapse class="answer-collapse">
              <el-collapse-item title="展开参考答案" name="ans">
                <div class="reference-answer">{{ q.referenceAnswer || '—' }}</div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>

        <div class="outline-actions">
          <el-button
            type="primary"
            size="small"
            @click="enterEditMode"
          >
            <el-icon><Edit /></el-icon>手动微调
          </el-button>
        </div>
      </template>

      <!-- 编辑模式：可改文本，不允许增删题 -->
      <template v-else>
        <el-form label-position="top" class="edit-form">
          <div
            v-for="(sec, sIdx) in editSections"
            :key="`es-${sIdx}`"
            class="edit-section"
          >
            <el-form-item :label="`模块 ${sIdx + 1} 主题`">
              <el-input v-model="sec.theme" placeholder="主题" />
            </el-form-item>
            <div
              v-for="(q, qIdx) in sec.questions"
              :key="`eq-${sIdx}-${qIdx}`"
              class="edit-question"
            >
              <div class="edit-q-title">题 {{ qIdx + 1 }}</div>
              <el-form-item label="问题">
                <el-input v-model="q.question" type="textarea" :rows="2" />
              </el-form-item>
              <el-form-item label="考察意图">
                <el-input v-model="q.intent" type="textarea" :rows="2" />
              </el-form-item>
              <el-form-item label="参考答案">
                <el-input v-model="q.referenceAnswer" type="textarea" :rows="3" />
              </el-form-item>
              <el-form-item label="追问（可选）">
                <el-input v-model="q.followUp" type="textarea" :rows="2" />
              </el-form-item>
            </div>
          </div>
        </el-form>
        <div class="outline-actions">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveEdit">
            保存定稿
          </el-button>
        </div>
      </template>
    </div>

    <!-- 生成 / 再生成 弹窗 -->
    <el-dialog
      v-model="generateDialogVisible"
      :title="versions.length ? '再生成面试大纲' : '生成面试大纲'"
      width="520px"
      :close-on-click-modal="!generating"
      :close-on-press-escape="!generating"
      :show-close="!generating"
      destroy-on-close
    >
      <el-form :model="generateForm" :rules="generateRules" label-width="92px">
        <el-form-item label="考察方向" prop="focusType">
          <el-select
            v-model="generateForm.focusType"
            placeholder="请选择考察方向"
            style="width: 100%"
          >
            <el-option
              v-for="opt in focusTypeOptions"
              :key="opt.code"
              :label="opt.name"
              :value="opt.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="versions.length" label="调整要求">
          <el-input
            v-model="generateForm.adjustNote"
            type="textarea"
            :rows="3"
            placeholder="如：多考察质量体系经验（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="generating" @click="generateDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="generating"
          @click="handleGenerate"
        >
          {{ generating ? 'AI 生成中…' : '开始生成' }}
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { MagicStick, Edit } from '@element-plus/icons-vue';
import {
  generateQuestionOutline,
  getQuestionOutlines,
  finalizeQuestionOutline,
  type QuestionOutlineVersion,
  type QuestionOutline,
  type OutlineSection,
} from '@/api/interview';
import { getDictionaries, type DictionaryItem } from '@/api/dictionary';

interface Props {
  interviewId: string;
  interviewFocusType?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  interviewFocusType: null,
});

// ============ 状态 ============
const versions = ref<QuestionOutlineVersion[]>([]);
const selectedVersion = ref<number | null>(null);
const loadingList = ref(false);
const generating = ref(false);
const saving = ref(false);
const editing = ref(false);
const editSections = ref<OutlineSection[]>([]);

// 字典：考察方向（interview_focus_type）
const focusTypeOptions = ref<DictionaryItem[]>([]);
// code → name 映射
const focusTypeMap = computed(() => {
  const m: Record<string, string> = {};
  focusTypeOptions.value.forEach((d) => {
    if (d.enabled) m[d.code] = d.name;
  });
  return m;
});

const currentVersion = computed<QuestionOutlineVersion | null>(() => {
  if (!versions.value.length) return null;
  if (selectedVersion.value == null) return versions.value[0];
  return versions.value.find((v) => v.version === selectedVersion.value) || versions.value[0];
});

// ============ 辅助 ============
function focusTypeName(code?: string | null): string {
  if (!code) return '—';
  return focusTypeMap.value[code] || code;
}

function formatShortDateTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

// 版本下拉项：v3（最新）/ v2 / v1
const versionOptions = computed(() =>
  versions.value.map((v) => ({
    value: v.version,
    label: `v${v.version}${v.version === versions.value[0].version ? '（最新）' : ''} · ${focusTypeName(v.focusType)} · ${formatShortDateTime(v.createdAt)}`,
  }))
);

// 弹窗表单
const generateDialogVisible = ref(false);
const generateForm = reactive({ focusType: '', adjustNote: '' });
const generateRules = {
  focusType: [{ required: true, message: '请选择考察方向', trigger: 'change' }],
};

// ============ 数据加载 ============
async function loadVersions() {
  loadingList.value = true;
  try {
    const res = await getQuestionOutlines(props.interviewId);
    if (res.success) {
      versions.value = (res.data || []) as QuestionOutlineVersion[];
      // 默认展示最新版本
      if (versions.value.length) {
        selectedVersion.value = versions.value[0].version;
      } else {
        selectedVersion.value = null;
      }
    }
  } catch {
    // 错误提示已在 request 拦截器统一处理
    versions.value = [];
  } finally {
    loadingList.value = false;
  }
}

async function loadFocusTypeDict() {
  try {
    const res = await getDictionaries({ category: 'interview_focus_type' });
    if (res.success) {
      focusTypeOptions.value = (res.data || []).filter((d: DictionaryItem) => d.enabled);
    }
  } catch {
    focusTypeOptions.value = [];
  }
}

// ============ 操作 ============
function openGenerateDialog() {
  // 默认值：优先用面试本身的 focusType，否则留空
  generateForm.focusType = props.interviewFocusType || '';
  generateForm.adjustNote = '';
  generateDialogVisible.value = true;
}

async function handleGenerate() {
  if (!generateForm.focusType) {
    ElMessage.error('请选择考察方向');
    return;
  }
  generating.value = true;
  try {
    const payload: { focusType: string; adjustNote?: string } = {
      focusType: generateForm.focusType,
    };
    if (generateForm.adjustNote && generateForm.adjustNote.trim()) {
      payload.adjustNote = generateForm.adjustNote.trim();
    }
    const res = await generateQuestionOutline(props.interviewId, payload);
    if (res.success) {
      ElMessage.success('大纲生成成功');
      generateDialogVisible.value = false;
      await loadVersions();
    }
  } catch {
    // 拦截器已提示
  } finally {
    generating.value = false;
  }
}

function handleVersionChange(v: number) {
  selectedVersion.value = v;
}

// ============ 手动微调（编辑模式） ============
function enterEditMode() {
  if (!currentVersion.value) return;
  // 深拷贝当前展示版本
  editSections.value = JSON.parse(JSON.stringify(currentVersion.value.outline?.sections || []));
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  editSections.value = [];
}

async function saveEdit() {
  if (!currentVersion.value) return;
  saving.value = true;
  try {
    const newOutline: QuestionOutline = {
      sections: editSections.value,
    };
    if (currentVersion.value.outline?.durationAdvice) {
      newOutline.durationAdvice = currentVersion.value.outline.durationAdvice;
    }
    const res = await finalizeQuestionOutline(
      props.interviewId,
      currentVersion.value.version,
      newOutline
    );
    if (res.success) {
      ElMessage.success('定稿已保存');
      editing.value = false;
      await loadVersions();
    }
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadFocusTypeDict();
  await loadVersions();
});
</script>

<style scoped lang="scss">
.question-outline-card {
  margin-bottom: 20px;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .card-title {
      font-weight: 500;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;

      .version-select {
        width: 260px;
      }
    }
  }

  .outline-body {
    .outline-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 13px;

      .create-time {
        color: #909399;
      }

      .adjust-note {
        color: #606266;
        flex-basis: 100%;
        font-size: 13px;
        background: #f5f7fa;
        padding: 6px 10px;
        border-radius: 4px;
      }
    }

    .duration-alert {
      margin-bottom: 16px;
    }

    .outline-section {
      margin-bottom: 18px;
      padding: 12px 14px;
      background-color: #f5f7fa;
      border-radius: 8px;

      .section-theme {
        font-weight: 500;
        color: #303133;
        font-size: 15px;
        margin-bottom: 10px;
      }

      .outline-question {
        background: #fff;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 10px;

        &:last-child {
          margin-bottom: 0;
        }

        .question-line {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 6px;

          .question-label {
            color: #409eff;
            font-weight: 600;
            font-size: 13px;
          }

          .question-text {
            color: #303133;
            font-weight: 500;
            font-size: 14px;
            line-height: 1.6;
          }
        }

        .question-intent {
          color: #909399;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .question-followup {
          color: #e6a23c;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .answer-collapse {
          margin-top: 4px;

          :deep(.el-collapse-item__header) {
            font-size: 12px;
            color: #409eff;
            padding-left: 0;
          }

          .reference-answer {
            font-size: 13px;
            color: #606266;
            line-height: 1.7;
            white-space: pre-wrap;
          }
        }
      }
    }

    .outline-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .edit-form {
      .edit-section {
        margin-bottom: 16px;
        padding: 12px 14px;
        background-color: #f5f7fa;
        border-radius: 8px;

        .edit-q-title {
          font-weight: 500;
          color: #409eff;
          margin-bottom: 6px;
        }

        .edit-question {
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px dashed #ebeef5;

          &:last-child {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 0;
          }
        }
      }
    }
  }
}
</style>
