import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

/** 表单存在内容且尚未提交时，离开页面前给出统一确认。 */
export function useUnsavedChangesGuard(formData: object, submitting: Ref<boolean>) {
  const dirty = ref(false);
  let baseline = '';
  const snapshot = () => JSON.stringify(formData);
  const stop = watch(formData, () => { dirty.value = snapshot() !== baseline; }, { deep: true });
  function markSaved() { baseline = snapshot(); dirty.value = false; }
  function confirmLeave() { return !dirty.value || submitting.value || window.confirm('当前表单有未保存内容，确定离开吗？'); }
  onBeforeRouteLeave(() => confirmLeave());
  onMounted(markSaved);
  onBeforeUnmount(() => stop());
  return { dirty, markSaved };
}
