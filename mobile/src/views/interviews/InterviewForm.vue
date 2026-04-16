<template>
  <div class="form-page">
    <van-nav-bar title="填写面试反馈" left-arrow fixed placeholder @click-left="$router.back()" />

    <van-form class="form-content" @submit="onSubmit">
      <van-field
        v-model="form.round"
        is-link
        readonly
        name="round"
        label="面试轮次"
        placeholder="请选择"
        :rules="[{ required: true, message: '请选择面试轮次' }]"
        @click="showRoundPicker = true"
      />
      <van-popup v-model:show="showRoundPicker" round position="bottom">
        <van-picker :columns="roundColumns" @confirm="onRoundConfirm" @cancel="showRoundPicker = false" />
      </van-popup>

      <van-field
        v-model="form.interviewerName"
        name="interviewerName"
        label="面试官"
        placeholder="请输入面试官姓名"
        :rules="[{ required: true, message: '请输入面试官姓名' }]"
      />

      <van-field
        v-model="form.interviewTime"
        is-link
        readonly
        name="interviewTime"
        label="面试时间"
        placeholder="请选择"
        :rules="[{ required: true, message: '请选择面试时间' }]"
        @click="showDatePicker = true"
      />
      <van-popup v-model:show="showDatePicker" round position="bottom">
        <van-date-picker
          title="选择日期时间"
          type="datetime"
          @confirm="onDateConfirm"
          @cancel="showDatePicker = false"
        />
      </van-popup>

      <van-field
        v-model="form.conclusion"
        is-link
        readonly
        name="conclusion"
        label="面试结论"
        placeholder="请选择"
        :rules="[{ required: true, message: '请选择面试结论' }]"
        @click="showConclusionPicker = true"
      />
      <van-popup v-model:show="showConclusionPicker" round position="bottom">
        <van-picker
          :columns="conclusionColumns"
          @confirm="onConclusionConfirm"
          @cancel="showConclusionPicker = false"
        />
      </van-popup>

      <van-field
        v-if="form.conclusion === 'reject'"
        v-model="form.rejectReason"
        name="rejectReason"
        label="淘汰原因"
        placeholder="请输入淘汰原因"
      />

      <van-field
        v-model="form.feedbackContent"
        name="feedbackContent"
        label="反馈内容"
        type="textarea"
        rows="4"
        placeholder="请输入面试反馈内容"
        :rules="[{ required: true, message: '请输入反馈内容' }]"
      />

      <div class="submit-area">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          提交反馈
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { addInterviewFeedback, type InterviewRound, type InterviewConclusion } from '@/api/candidates';

const route = useRoute();
const router = useRouter();
const rawId = route.params.id as string || (route.query.candidateId as string);
const candidateId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId : '';
const defaultRound = (route.query.round as InterviewRound) || '';

const submitting = ref(false);
const showRoundPicker = ref(false);
const showDatePicker = ref(false);
const showConclusionPicker = ref(false);

const roundColumns = [
  { text: '初试', value: '初试' },
  { text: '复试', value: '复试' },
  { text: '终面', value: '终面' },
];

const conclusionColumns = [
  { text: '通过', value: 'pass' },
  { text: '淘汰', value: 'reject' },
  { text: '待定', value: 'pending' },
];

const form = ref({
  round: defaultRound,
  interviewerName: '',
  interviewTime: '',
  conclusion: '' as InterviewConclusion | '',
  rejectReason: '',
  feedbackContent: '',
});

function onRoundConfirm({ selectedOptions }: { selectedOptions: { text: string; value: InterviewRound }[] }) {
  form.value.round = selectedOptions[0].value;
  showRoundPicker.value = false;
}

function onDateConfirm({ selectedValues }: { selectedValues: string[] }) {
  // van-date-picker 返回 [year, month, day]
  form.value.interviewTime = `${selectedValues[0]}-${selectedValues[1]}-${selectedValues[2]}T09:00:00.000Z`;
  showDatePicker.value = false;
}

function onConclusionConfirm({ selectedOptions }: { selectedOptions: { text: string; value: InterviewConclusion }[] }) {
  form.value.conclusion = selectedOptions[0].value;
  showConclusionPicker.value = false;
}

onMounted(() => {
  if (!candidateId) {
    showToast('缺少或无效的候选人ID');
    router.back();
  }
});

async function onSubmit() {
  if (!candidateId) {
    showToast('缺少或无效的候选人ID');
    return;
  }
  submitting.value = true;
  try {
    const res = await addInterviewFeedback(candidateId, {
      round: form.value.round as InterviewRound,
      interviewerName: form.value.interviewerName,
      interviewTime: form.value.interviewTime,
      conclusion: form.value.conclusion as InterviewConclusion,
      feedbackContent: form.value.feedbackContent,
      rejectReason: form.value.rejectReason || undefined,
    });
    if (res.success) {
      showToast('提交成功');
      router.back();
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.form-page {
  min-height: 100%;
  background-color: #f7f8fa;
  padding-bottom: 24px;
}

.form-content {
  padding-top: 8px;
}

.submit-area {
  padding: 24px 16px;
}
</style>
