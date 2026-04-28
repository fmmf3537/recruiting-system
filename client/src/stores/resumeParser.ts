import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ResumeParseResult, WorkHistory } from '@/api/candidate';

/**
 * 简历解析结果 Store
 * 用于在简历解析和候选人表单之间传递数据，替代 sessionStorage
 */
export const useResumeParserStore = defineStore('resumeParser', () => {
  // 解析结果
  const parsedData = ref<ResumeParseResult | null>(null);

  // 是否有解析数据
  const hasData = computed(() => !!parsedData.value);

  // 工作经历列表
  const workHistory = computed<WorkHistory[]>(() => parsedData.value?.workHistory || []);

  // 设置解析结果
  function setParsedData(data: ResumeParseResult) {
    parsedData.value = data;
  }

  // 清空解析结果（表单提交成功或取消时调用）
  function clearParsedData() {
    parsedData.value = null;
  }

  return {
    parsedData,
    hasData,
    workHistory,
    setParsedData,
    clearParsedData,
  };
});
