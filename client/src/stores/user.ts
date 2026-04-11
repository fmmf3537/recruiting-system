import { defineStore } from 'pinia';
import { login as loginApi, getCurrentUser } from '@api/auth';
import type { UserInfo, LoginForm, LoginResponse, UserInfoResponse } from '@types/user';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    userInfo: null as UserInfo | null,
    isLoading: false,
  }),

  getters: {
    isLoggedIn: (state): boolean => {
      return !!state.token && !!state.userInfo;
    },
    userRole: (state): string => state.userInfo?.role || '',
    isAdmin: (state): boolean => state.userInfo?.role === 'ADMIN',
  },

  actions: {
    setToken(newToken: string) {
      this.token = newToken;
      localStorage.setItem('token', newToken);
    },

    clearToken() {
      this.token = '';
      this.userInfo = null;
      localStorage.removeItem('token');
    },

    async login(loginForm: LoginForm): Promise<boolean> {
      this.isLoading = true;
      try {
        const res = await loginApi(loginForm) as LoginResponse;
        
        if (res.success && res.token && res.user) {
          this.setToken(res.token);
          this.userInfo = res.user;
          return true;
        } else {
          throw new Error(res.message || '登录失败');
        }
      } catch (error) {
        console.error('[UserStore] Login failed:', error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    logout() {
      this.clearToken();
    },

    async fetchUserInfo(): Promise<boolean> {
      if (!this.token) {
        return false;
      }
      try {
        const res = await getCurrentUser() as UserInfoResponse;
        
        if (res.success && res.user) {
          this.userInfo = res.user;
          return true;
        }
        return false;
      } catch (error) {
        console.error('[UserStore] Fetch user info failed:', error);
        this.clearToken();
        return false;
      }
    },

    async initUser(): Promise<boolean> {
      if (this.token && !this.userInfo) {
        return await this.fetchUserInfo();
      }
      return !!this.userInfo;
    },
  },
});
