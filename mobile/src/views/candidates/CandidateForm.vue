<template>
  <div class="form-page">
    <van-nav-bar title="候选人" left-arrow fixed placeholder @click-left="$router.back()" />

    <van-form class="form-content" @submit="onSubmit">
      <van-field
        v-model="form.name"
        name="name"
        label="姓名"
        placeholder="请输入姓名"
        :rules="[{ required: true, message: '请输入姓名' }]"
      />
      <van-field
        v-model="form.gender"
        is-link
        readonly
        name="gender"
        label="性别"
        placeholder="请选择性别"
        :rules="[{ required: true, message: '请选择性别' }]"
        @click="showGenderPicker = true"
      />
      <van-popup v-model:show="showGenderPicker" round position="bottom">
        <van-picker :columns="genderColumns" @confirm="onGenderConfirm" @cancel="showGenderPicker = false" />
      </van-popup>

      <van-field
        v-model="form.phone"
        name="phone"
        label="电话"
        placeholder="请输入电话"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        :rules="[{ required: true, message: '请输入电话' }]"
      />
      <van-field
        v-model="form.email"
        name="email"
        label="邮箱"
        placeholder="请输入邮箱"
        type="email"
        inputmode="email"
        autocomplete="email"
        :rules="[{ required: true, message: '请输入邮箱' }]"
      />
      <van-field
        v-model="form.education"
        name="education"
        label="学历"
        placeholder="请输入学历"
        :rules="[{ required: true, message: '请输入学历' }]"
      />
      <van-field
        v-model="form.school"
        name="school"
        label="学校"
        placeholder="请输入学校"
      />
      <van-field
        v-model="form.workYears"
        name="workYears"
        label="工作年限"
        placeholder="请输入工作年限"
        type="digit"
        inputmode="numeric"
        autocomplete="off"
      />
      <van-field
        v-model="form.currentCompany"
        name="currentCompany"
        label="当前公司"
        placeholder="请输入当前公司"
      />
      <van-field
        v-model="form.currentPosition"
        name="currentPosition"
        label="当前职位"
        placeholder="请输入当前职位"
      />
      <van-field
        v-model="form.expectedSalary"
        name="expectedSalary"
        label="期望薪资"
        placeholder="请输入期望薪资"
      />
      <van-field
        v-model="form.source"
        name="source"
        label="来源"
        placeholder="请输入来源"
        :rules="[{ required: true, message: '请输入来源' }]"
      />
      <van-field
        v-model="form.sourceNote"
        name="sourceNote"
        label="来源备注"
        placeholder="请输入来源备注"
      />
      <van-field
        v-model="form.intro"
        name="intro"
        label="说明"
        type="textarea"
        rows="2"
        placeholder="请输入候选人说明"
      />

      <div class="submit-area safe-bottom">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { createCandidate, updateCandidate, getCandidateById, type Gender, type CreateCandidateParams } from '@/api/candidates';

const route = useRoute();
const router = useRouter();
const isEdit = ref(!!route.query.mode && route.query.mode === 'edit');
const candidateId = ref((route.query.id as string) || '');
const submitting = ref(false);
const showGenderPicker = ref(false);

const genderColumns = [
  { text: '男', value: '男' },
  { text: '女', value: '女' },
];

const form = ref({
  name: '',
  gender: '' as Gender | '',
  phone: '',
  email: '',
  education: '',
  school: '',
  workYears: '',
  currentCompany: '',
  currentPosition: '',
  expectedSalary: '',
  source: '',
  sourceNote: '',
  intro: '',
});

function onGenderConfirm({ selectedOptions }: { selectedOptions: { text: string; value: Gender }[] }) {
  form.value.gender = selectedOptions[0].value;
  showGenderPicker.value = false;
}

async function onSubmit() {
  submitting.value = true;
  try {
    const payload = {
      ...form.value,
      gender: form.value.gender || undefined,
      workYears: form.value.workYears ? Number(form.value.workYears) : undefined,
    };
    if (isEdit.value && candidateId.value) {
      await updateCandidate(candidateId.value, payload);
      showToast('保存成功');
    } else {
      await createCandidate(payload as CreateCandidateParams);
      showToast('创建成功');
    }
    router.back();
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (isEdit.value && candidateId.value) {
    const res = await getCandidateById(candidateId.value);
    if (res.success) {
      const d = res.data;
      form.value = {
        name: d.name,
        gender: d.gender,
        phone: d.phone,
        email: d.email,
        education: d.education,
        school: d.school || '',
        workYears: d.workYears ? String(d.workYears) : '',
        currentCompany: d.currentCompany || '',
        currentPosition: d.currentPosition || '',
        expectedSalary: d.expectedSalary || '',
        source: d.source,
        sourceNote: d.sourceNote || '',
        intro: d.intro || '',
      };
    }
  }
});
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
