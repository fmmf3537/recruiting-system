import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUserStore = defineStore('user', () => {
  const token = ref<string>('');
  const userInfo = ref<Record<string, unknown> | null>(null);

  const isLogin = computed(() => !!token.value);
  const isAdmin = computed(() => userInfo.value?.role === 'admin');

  function setToken(val: string) {
    token.value = val;
  }

  function setUserInfo(val: Record<string, unknown>) {
    userInfo.value = val;
  }

  function clearUser() {
    token.value = '';
    userInfo.value = null;
  }

  return {
    token,
    userInfo,
    isLogin,
    isAdmin,
    setToken,
    setUserInfo,
    clearUser,
  };
});
