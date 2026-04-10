import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { login as loginApi, getUserInfo } from '@api/auth';
import type { UserInfo, LoginForm } from '@types/user';

export const useUserStore = defineStore('user', () => {
  // State
  const token = ref<string>(localStorage.getItem('token') || '');
  const userInfo = ref<UserInfo | null>(null);
  const isLoading = ref(false);

  // Getters
  const isLoggedIn = computed(() => !!token.value);
  const userRole = computed(() => userInfo.value?.role || '');
  const isAdmin = computed(() => userRole.value === 'ADMIN');

  // Actions
  const setToken = (newToken: string) => {
    token.value = newToken;
    localStorage.setItem('token', newToken);
  };

  const clearToken = () => {
    token.value = '';
    userInfo.value = null;
    localStorage.removeItem('token');
  };

  const login = async (loginForm: LoginForm) => {
    isLoading.value = true;
    try {
      const res = await loginApi(loginForm);
      setToken(res.token);
      userInfo.value = res.user;
      return res;
    } finally {
      isLoading.value = false;
    }
  };

  const logout = () => {
    clearToken();
  };

  const fetchUserInfo = async () => {
    if (!token.value) return null;
    try {
      const res = await getUserInfo();
      userInfo.value = res;
      return res;
    } catch (error) {
      clearToken();
      throw error;
    }
  };

  const initUser = async () => {
    if (token.value && !userInfo.value) {
      await fetchUserInfo();
    }
  };

  return {
    token,
    userInfo,
    isLoading,
    isLoggedIn,
    userRole,
    isAdmin,
    login,
    logout,
    fetchUserInfo,
    initUser,
    setToken,
    clearToken,
  };
});
