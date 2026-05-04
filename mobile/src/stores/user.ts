import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as loginApi, getMe, feishuLogin } from '@/api/auth';
import type { LoginParams, FeishuLoginParams } from '@/api/auth';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  createdAt: string;
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('ats_token') || '');
  const userInfo = ref<UserInfo | null>(null);

  const isLogin = computed(() => !!token.value);
  const isAdmin = computed(() => userInfo.value?.role === 'admin');

  function setToken(val: string) {
    token.value = val;
    localStorage.setItem('ats_token', val);
  }

  function setUserInfo(val: UserInfo) {
    userInfo.value = val;
  }

  function clearUser() {
    token.value = '';
    userInfo.value = null;
    localStorage.removeItem('ats_token');
  }

  async function login(params: LoginParams) {
    const res = await loginApi(params);
    if (res.success && res.token) {
      setToken(res.token);
      setUserInfo(res.user);
    }
    return res;
  }

  async function feishuLoginAction(params: FeishuLoginParams): Promise<any> {
    const res = await feishuLogin(params) as any;
    if (res.success && res.token) {
      setToken(res.token);
      setUserInfo(res.user);
    }
    return res;
  }

  async function fetchUserInfo() {
    const res = await getMe();
    if (res.success && res.user) {
      setUserInfo(res.user);
    }
    return res;
  }

  function logout() {
    clearUser();
  }

  return {
    token,
    userInfo,
    isLogin,
    isAdmin,
    setToken,
    setUserInfo,
    clearUser,
    login,
    feishuLoginAction,
    fetchUserInfo,
    logout,
  };
});
