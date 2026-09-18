<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '修改面试安排' : '安排面试'"
    width="560px"
    destroy-on-close
  >
    <el-form ref="scheduleFormRef" :model="scheduleForm" :rules="scheduleRules" label-width="100px">
      <el-form-item label="候选人" prop="candidateId">
        <el-select
          v-model="scheduleForm.candidateId"
          filterable
          remote
          reserve-keyword
          placeholder="搜索候选人姓名/手机号"
          :remote-method="searchCandidates"
          :loading="candidateSearching"
          :disabled="candidateLocked"
          style="width: 100%"
        >
          <el-option
            v-for="c in candidateOptions"
            :key="c.id"
            :label="c.phone ? `${c.name} — ${c.phone}` : c.name"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="关联职位" prop="jobId">
        <el-select
          v-model="scheduleForm.jobId"
          placeholder="选择职位（可选）"
          clearable
          :disabled="isEdit"
          style="width: 100%"
        >
          <el-option v-for="j in jobOptions" :key="j.id" :label="j.title" :value="j.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="面试轮次" prop="round">
        <el-select v-model="scheduleForm.round" style="width: 100%">
          <el-option label="初试" value="初试" />
          <el-option label="复试" value="复试" />
          <el-option label="终面" value="终面" />
        </el-select>
      </el-form-item>
      <el-form-item label="面试方式" prop="type">
        <el-select v-model="scheduleForm.type" style="width: 100%">
          <el-option label="电话" value="电话" />
          <el-option label="视频" value="视频" />
          <el-option label="现场" value="现场" />
        </el-select>
      </el-form-item>
      <!-- 考察方向（字典 interview_focus_type，可选） -->
      <el-form-item label="考察方向" prop="focusType">
        <el-select
          v-model="scheduleForm.focusType"
          placeholder="选择考察方向（可选）"
          clearable
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
      <el-form-item label="面试官" prop="interviewerIds">
        <el-select
          v-model="scheduleForm.interviewerIds"
          multiple
          filterable
          placeholder="选择面试官"
          style="width: 100%"
        >
          <el-option v-for="u in userOptions" :key="u.id" :label="u.name" :value="u.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="面试时间" prop="scheduledAt">
        <el-date-picker
          v-model="scheduleForm.scheduledAt"
          type="datetime"
          placeholder="选择日期时间"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="面试时长" prop="duration">
        <el-select v-model="scheduleForm.duration" style="width: 100%">
          <el-option label="30分钟" :value="30" />
          <el-option label="45分钟" :value="45" />
          <el-option label="60分钟" :value="60" />
          <el-option label="90分钟" :value="90" />
          <el-option label="120分钟" :value="120" />
        </el-select>
      </el-form-item>
      <el-form-item label="面试地点" prop="location">
        <el-input v-model="scheduleForm.location" placeholder="会议室/视频链接（可选）" />
      </el-form-item>
      <el-form-item label="备注" prop="notes">
        <el-input
          v-model="scheduleForm.notes"
          type="textarea"
          :rows="3"
          placeholder="面试准备事项等（可选）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="scheduleSubmitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '确认' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  createInterview,
  updateInterview,
  type InterviewItem,
  type InterviewParams,
} from '@/api/interview';
import { getCandidateList } from '@/api/candidate';
import { getInterviewerOptions } from '@/api/user';
import { getJobList } from '@/api/job';
import { getDictionaries, type DictionaryItem } from '@/api/dictionary';

/** 编辑回填允许列表项或候选人详情接口的嵌套 job/candidate 形态 */
type EditableInterview = InterviewItem & {
  candidate?: { id: string; name: string };
  job?: { id: string; title: string } | null;
};

const props = defineProps<{
  initialCandidateId?: string;
  initialCandidateName?: string;
  interview?: EditableInterview | null;
}>();

const emit = defineEmits<{
  (e: 'scheduled'): void;
}>();

const visible = defineModel<boolean>({ default: false });

const scheduleFormRef = ref<FormInstance>();
const scheduleSubmitting = ref(false);
const candidateSearching = ref(false);

const scheduleForm = reactive({
  candidateId: '',
  jobId: '',
  round: '初试',
  type: '现场',
  interviewerIds: [] as string[],
  scheduledAt: '',
  duration: 60,
  location: '',
  notes: '',
  focusType: '',
});

const scheduleRules: FormRules = {
  candidateId: [{ required: true, message: '请选择候选人', trigger: 'change' }],
  round: [{ required: true, message: '请选择面试轮次', trigger: 'change' }],
  type: [{ required: true, message: '请选择面试方式', trigger: 'change' }],
  interviewerIds: [
    { required: true, type: 'array', min: 1, message: '请至少选择一位面试官', trigger: 'change' },
  ],
  scheduledAt: [{ required: true, message: '请选择面试时间', trigger: 'change' }],
};

const candidateOptions = ref<Array<{ id: string; name: string; phone: string }>>([]);
const userOptions = ref<Array<{ id: string; name: string }>>([]);
const jobOptions = ref<Array<{ id: string; title: string }>>([]);
const focusTypeOptions = ref<DictionaryItem[]>([]);

const isEdit = computed(() => Boolean(props.interview?.id));
const candidateLocked = computed(() => Boolean(props.initialCandidateId) || isEdit.value);

function formatScheduledAt(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Element Plus 返回本地墙上时间字符串；提交前必须转成含时区的 ISO，避免服务端按自身时区解释。 */
function localScheduledAtToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function resetForm() {
  const iv = props.interview;
  if (iv) {
    const candidateId = iv.candidateId || iv.candidate?.id || props.initialCandidateId || '';
    const candidateName =
      iv.candidateName || iv.candidate?.name || props.initialCandidateName || '当前候选人';
    scheduleForm.candidateId = candidateId;
    scheduleForm.jobId = iv.jobId || iv.job?.id || '';
    scheduleForm.round = iv.round || '初试';
    scheduleForm.type = iv.type || '现场';
    scheduleForm.interviewerIds = (iv.interviewers || []).map((i) => i.id);
    scheduleForm.scheduledAt = formatScheduledAt(iv.scheduledAt);
    scheduleForm.duration = iv.duration || 60;
    scheduleForm.location = iv.location || '';
    scheduleForm.notes = iv.notes || '';
    scheduleForm.focusType = iv.focusType || '';
    candidateOptions.value = candidateId
      ? [{ id: candidateId, name: candidateName, phone: '' }]
      : [];
    return;
  }
  scheduleForm.candidateId = props.initialCandidateId || '';
  scheduleForm.jobId = '';
  scheduleForm.round = '初试';
  scheduleForm.type = '现场';
  scheduleForm.interviewerIds = [];
  scheduleForm.scheduledAt = '';
  scheduleForm.duration = 60;
  scheduleForm.location = '';
  scheduleForm.notes = '';
  scheduleForm.focusType = '';
  candidateOptions.value = props.initialCandidateId
    ? [
        {
          id: props.initialCandidateId,
          name: props.initialCandidateName || '当前候选人',
          phone: '',
        },
      ]
    : [];
}

async function searchCandidates(query: string) {
  if (!query || candidateLocked.value) return;
  candidateSearching.value = true;
  try {
    const res = (await getCandidateList({ keyword: query, pageSize: 20 })) as {
      success: boolean;
      data?: Array<{ id: string; name: string; phone: string }>;
    };
    if (res.success) {
      candidateOptions.value = res.data || [];
    }
  } catch {
    /* ignore */
  } finally {
    candidateSearching.value = false;
  }
}

async function loadInterviewers() {
  try {
    const res = await getInterviewerOptions();
    if (res.success) {
      userOptions.value = (res.data || []).map((u) => ({ id: u.id, name: u.name }));
    }
  } catch {
    /* ignore：HR 不再因 /users 403 拿到空列表 */
  }
}

async function loadJobs() {
  try {
    const res = (await getJobList({ pageSize: 100 })) as {
      success: boolean;
      data?: Array<{ id: string; title: string }>;
    };
    if (res.success) {
      jobOptions.value = (res.data || []).map((j) => ({ id: j.id, title: j.title }));
    }
  } catch {
    /* ignore */
  }
}

async function loadFocusTypeDict() {
  if (focusTypeOptions.value.length) return;
  try {
    const res = await getDictionaries({ category: 'interview_focus_type' });
    if (res.success) {
      focusTypeOptions.value = (res.data || []).filter((d: DictionaryItem) => d.enabled);
    }
  } catch {
    /* ignore */
  }
}

watch(visible, async (open) => {
  if (!open) return;
  resetForm();
  await Promise.all([loadInterviewers(), loadJobs(), loadFocusTypeDict()]);
  // 编辑回填的面试官/职位可能不在下拉当前页，补进 options 以免只显示 id
  const iv = props.interview;
  if (iv?.interviewers?.length) {
    const missing = iv.interviewers.filter((i) => !userOptions.value.some((u) => u.id === i.id));
    if (missing.length) {
      userOptions.value = [...userOptions.value, ...missing];
    }
  }
  const jobId = iv?.jobId || iv?.job?.id;
  const jobTitle = iv?.jobTitle || iv?.job?.title;
  if (jobId && !jobOptions.value.some((j) => j.id === jobId)) {
    jobOptions.value = [...jobOptions.value, { id: jobId, title: jobTitle || '已选职位' }];
  }
});

async function handleSubmit() {
  const valid = await scheduleFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  const scheduledAt = localScheduledAtToIso(scheduleForm.scheduledAt);
  if (!scheduledAt) {
    ElMessage.error('面试时间格式无效，请重新选择');
    return;
  }

  scheduleSubmitting.value = true;
  try {
    const interviewers = scheduleForm.interviewerIds.map((id) => {
      const user = userOptions.value.find((u) => u.id === id);
      return { id, name: user?.name || '' };
    });
    if (isEdit.value && props.interview) {
      await updateInterview(props.interview.id, {
        round: scheduleForm.round,
        type: scheduleForm.type,
        interviewers,
        scheduledAt,
        duration: scheduleForm.duration,
        location: scheduleForm.location || undefined,
        notes: scheduleForm.notes || undefined,
        focusType: scheduleForm.focusType || undefined,
      });
      ElMessage.success('面试安排已更新');
    } else {
      const data: InterviewParams = {
        candidateId: scheduleForm.candidateId,
        jobId: scheduleForm.jobId || undefined,
        round: scheduleForm.round,
        type: scheduleForm.type,
        interviewers,
        scheduledAt,
        duration: scheduleForm.duration,
        location: scheduleForm.location || undefined,
        notes: scheduleForm.notes || undefined,
        focusType: scheduleForm.focusType || undefined,
      };
      await createInterview(data);
      ElMessage.success('面试安排创建成功');
    }
    visible.value = false;
    emit('scheduled');
  } catch {
    // 拦截器已提示后端 error
  } finally {
    scheduleSubmitting.value = false;
  }
}
</script>
