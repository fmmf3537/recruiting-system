<template>
  <van-action-sheet v-model:show="visible" title="推进阶段" :closeable="false">
    <div class="stage-form">
      <van-field
        v-model="form.stage"
        is-link
        readonly
        label="目标阶段"
        placeholder="请选择"
        @click="showStagePicker = true"
      />
      <van-popup v-model:show="showStagePicker" round position="bottom">
        <van-picker
          :columns="stageColumns"
          @confirm="onStageConfirm"
          @cancel="showStagePicker = false"
        />
      </van-popup>

      <van-field
        v-model="form.status"
        is-link
        readonly
        label="阶段状态"
        placeholder="请选择"
        @click="showStatusPicker = true"
      />
      <van-popup v-model:show="showStatusPicker" round position="bottom">
        <van-picker
          :columns="statusColumns"
          @confirm="onStatusConfirm"
          @cancel="showStatusPicker = false"
        />
      </van-popup>

      <van-field
        v-if="form.status === 'rejected'"
        v-model="form.rejectReason"
        label="淘汰原因"
        placeholder="请输入淘汰原因"
      />

      <van-field
        v-model="form.note"
        label="备注"
        type="textarea"
        rows="2"
        placeholder="请输入备注"
      />

      <div class="action-buttons">
        <van-button block round @click="visible = false">取消</van-button>
        <van-button block round type="primary" :loading="submitting" @click="onSubmit">
          确认推进
        </van-button>
      </div>
    </div>
  </van-action-sheet>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { showToast } from 'vant';
import { advanceStage, type CandidateStage, type StageStatus } from '@/api/candidates';
import { STAGE_ORDER, STAGE_STATUS, STAGE_STATUS_MAP } from '@/constants';

const props = defineProps<{
  show: boolean;
  candidateId: string;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'success'): void;
}>();

const visible = ref(props.show);
const submitting = ref(false);
const showStagePicker = ref(false);
const showStatusPicker = ref(false);

const stageColumns = STAGE_ORDER.map((s) => ({ text: s, value: s }));

const statusColumns = STAGE_STATUS.map((s) => ({ text: STAGE_STATUS_MAP[s], value: s }));

const form = ref({
  stage: '' as CandidateStage | '',
  status: 'in_progress' as StageStatus,
  rejectReason: '',
  note: '',
});

watch(
  () => props.show,
  (val) => {
    visible.value = val;
  }
);

watch(visible, (val) => {
  emit('update:show', val);
  if (val) {
    form.value = {
      stage: '',
      status: 'in_progress',
      rejectReason: '',
      note: '',
    };
  }
});

function onStageConfirm({ selectedOptions }: { selectedOptions: { text: string; value: CandidateStage }[] }) {
  form.value.stage = selectedOptions[0].value;
  showStagePicker.value = false;
}

function onStatusConfirm({ selectedOptions }: { selectedOptions: { text: string; value: StageStatus }[] }) {
  form.value.status = selectedOptions[0].value;
  showStatusPicker.value = false;
}

async function onSubmit() {
  if (!form.value.stage) {
    showToast('请选择目标阶段');
    return;
  }
  submitting.value = true;
  try {
    const res = await advanceStage(props.candidateId, {
      stage: form.value.stage,
      status: form.value.status,
      rejectReason: form.value.rejectReason || undefined,
      note: form.value.note || undefined,
    });
    if (res.success) {
      showToast('推进成功');
      visible.value = false;
      emit('success');
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.stage-form {
  padding: 16px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
</style>
