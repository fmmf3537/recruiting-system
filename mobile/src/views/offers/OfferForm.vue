<template>
  <div class="form-page">
    <van-nav-bar title="创建 Offer" left-arrow fixed placeholder @click-left="$router.back()" />

    <van-form class="form-content" @submit="onSubmit">
      <van-field
        v-model="form.salary"
        name="salary"
        label="薪资"
        placeholder="请输入薪资"
        inputmode="text"
        autocomplete="off"
        :rules="[{ required: true, message: '请输入薪资' }]"
      />
      <van-field
        v-model="form.offerDate"
        is-link
        readonly
        name="offerDate"
        label="Offer 日期"
        placeholder="请选择"
        :rules="[{ required: true, message: '请选择 Offer 日期' }]"
        @click="showDatePicker = true"
      />
      <van-popup v-model:show="showDatePicker" round position="bottom">
        <van-date-picker title="选择日期" @confirm="onDateConfirm" @cancel="showDatePicker = false" />
      </van-popup>

      <van-field
        v-model="form.expectedJoinDate"
        is-link
        readonly
        name="expectedJoinDate"
        label="预计入职"
        placeholder="请选择"
        @click="showJoinDatePicker = true"
      />
      <van-popup v-model:show="showJoinDatePicker" round position="bottom">
        <van-date-picker title="选择日期" @confirm="onJoinDateConfirm" @cancel="showJoinDatePicker = false" />
      </van-popup>

      <van-field
        v-model="form.note"
        name="note"
        label="备注"
        type="textarea"
        rows="2"
        placeholder="请输入备注"
      />

      <div class="submit-area safe-bottom">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          创建 Offer
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { createOffer } from '@/api/offers';

const route = useRoute();
const router = useRouter();
const rawId = route.query.candidateId as string;
const candidateId = rawId && rawId !== 'undefined' && rawId !== 'null' ? rawId : '';

const submitting = ref(false);
const showDatePicker = ref(false);
const showJoinDatePicker = ref(false);

const form = ref({
  salary: '',
  offerDate: '',
  expectedJoinDate: '',
  note: '',
});

function onDateConfirm({ selectedValues }: { selectedValues: string[] }) {
  form.value.offerDate = `${selectedValues[0]}-${selectedValues[1]}-${selectedValues[2]}T00:00:00.000Z`;
  showDatePicker.value = false;
}

function onJoinDateConfirm({ selectedValues }: { selectedValues: string[] }) {
  form.value.expectedJoinDate = `${selectedValues[0]}-${selectedValues[1]}-${selectedValues[2]}T00:00:00.000Z`;
  showJoinDatePicker.value = false;
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
    const res = await createOffer({
      candidateId,
      salary: form.value.salary,
      offerDate: form.value.offerDate,
      expectedJoinDate: form.value.expectedJoinDate || undefined,
      note: form.value.note || undefined,
    });
    if (res.success) {
      showToast('创建成功');
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

.safe-bottom {
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}
</style>
