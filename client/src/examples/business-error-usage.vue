<script setup lang="ts">
/**
 * 业务错误码使用示例（不进入业务页面）。
 * 拦截器已统一弹消息；页面可再按 code 做字段级处理。
 */
import { ElMessage } from 'element-plus';
import { createCandidate, type CreateCandidateParams } from '@/api/candidate';
import { BackendErrorCode, BusinessError } from '@/types/error';

const payload: CreateCandidateParams = {
  name: '示例候选人',
  phone: '13800000000',
  email: 'demo@example.com',
  education: '本科',
  source: '招聘网站',
};

function highlightDuplicateField(_message: string): void {
  // 业务页可在此高亮手机号/邮箱
}

function showValidationErrors(_error: BusinessError): void {
  // 业务页可在此展示字段级校验错误
}

async function handleSubmit(): Promise<void> {
  try {
    await createCandidate(payload);
    ElMessage.success('创建成功');
  } catch (e) {
    if (e instanceof BusinessError) {
      switch (e.code) {
        case BackendErrorCode.CANDIDATE_DUPLICATE:
          highlightDuplicateField(e.message);
          break;
        case BackendErrorCode.VALIDATION_FAILED:
          showValidationErrors(e);
          break;
        default:
          console.warn('已处理', e.code);
      }
    }
  }
}
</script>

<template>
  <button type="button" @click="handleSubmit">提交示例</button>
</template>
