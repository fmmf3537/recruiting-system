import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as loginApi, getCurrentUser, type LoginParams } from '@/api/auth';
import router from '@/router';

// 用户信息类型
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string>(localStorage.getItem('ats_token') || '');
  const userInfo = ref<UserInfo | null>(null);
  const isLoading = ref(false);

  // Getters
  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => userInfo.value?.role === 'admin');
  const userName = computed(() => userInfo.value?.name || '');

  // Actions
  
  /**
   * 设置 token
   */
  function setToken(newToken: string) {
    token.value = newToken;
    localStorage.setItem('ats_token', newToken);
  }

  /**
   * 清除 token
   */
  function clearToken() {
    token.value = '';
    userInfo.value = null;
    localStorage.removeItem('ats_token');
    localStorage.removeItem('ats_user');
  }

  /**
   * 设置用户信息
   */
  function setUserInfo(user: UserInfo) {
    userInfo.value = user;
    localStorage.setItem('ats_user', JSON.stringify(user));
  }

  /**
   * 从 localStorage 恢复用户信息
   */
  function restoreUserInfo() {
    const stored = localStorage.getItem('ats_user');
    if (stored) {
      try {
        userInfo.value = JSON.parse(stored);
      } catch {
        localStorage.removeItem('ats_user');
      }
    }
  }

  /**
   * 登录
   */
  async function login(params: LoginParams) {
    isLoading.value = true;
    try {
      const res = await loginApi(params);
      if (res.success) {
        setToken(res.token);
        setUserInfo(res.user as UserInfo);
        return { success: true };
      }
      return { success: false, message: res.message };
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.error || '登录失败'
      };
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 获取当前用户信息
   */
  async function fetchUserInfo() {
    if (!token.value) return false;
    
    try {
      const res = await getCurrentUser();
      if (res.success) {
        setUserInfo(res.user as UserInfo);
        return true;
      }
      return false;
    } catch {
      clearToken();
      return false;
    }
  }

  /**
   * 登出
   */
  async function logout() {
    clearToken();
    router.push('/login');
  }

  // 初始化时恢复用户信息
  restoreUserInfo();

  return {
    token,
    userInfo,
    isLoading,
    isLoggedIn,
    isAdmin,
    userName,
    setToken,
    clearToken,
    setUserInfo,
    restoreUserInfo,
    login,
    fetchUserInfo,
    logout,
  };
});
