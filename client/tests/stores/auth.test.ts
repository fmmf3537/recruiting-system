import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

// Mock API
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  getCurrentUser: vi.fn(),
}));

// Mock router
vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}));

import { login, getCurrentUser } from '@/api/auth';
import router from '@/router';

describe('Auth Store', () => {
  let store: ReturnType<typeof useAuthStore>;
  let storage: Record<string, string> = {};

  beforeEach(() => {
    setActivePinia(createPinia());
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
      clear: () => { storage = {}; },
    });
    vi.clearAllMocks();
    store = useAuthStore();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  describe('state & getters', () => {
    it('初始状态应为未登录', () => {
      expect(store.isLoggedIn).toBe(false);
      expect(store.isAdmin).toBe(false);
      expect(store.userName).toBe('');
      expect(store.userInfo).toBeNull();
    });

    it('设置 token 后应为已登录', () => {
      store.setToken('test-token');
      expect(store.isLoggedIn).toBe(true);
      expect(localStorage.getItem('ats_token')).toBe('test-token');
    });

    it('设置 admin 用户后 isAdmin 应为 true', () => {
      store.setUserInfo({
        id: '1',
        email: 'admin@test.com',
        name: '管理员',
        role: 'admin',
        createdAt: '2024-01-01',
      });
      expect(store.isAdmin).toBe(true);
      expect(store.userName).toBe('管理员');
    });
  });

  describe('login', () => {
    it('登录成功应设置 token 和用户信息', async () => {
      vi.mocked(login).mockResolvedValue({
        success: true,
        token: 'jwt-token-123',
        user: {
          id: '1',
          email: 'test@test.com',
          name: '张三',
          role: 'member',
          createdAt: '2024-01-01',
        },
      } as any);

      const result = await store.login({ email: 'test@test.com', password: '123456' });

      expect(result.success).toBe(true);
      expect(store.token).toBe('jwt-token-123');
      expect(store.userInfo?.name).toBe('张三');
      expect(localStorage.getItem('ats_token')).toBe('jwt-token-123');
    });

    it('登录失败应返回错误信息', async () => {
      vi.mocked(login).mockRejectedValue({
        response: { data: { error: '密码错误' } },
      });

      const result = await store.login({ email: 'test@test.com', password: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('密码错误');
      expect(store.isLoggedIn).toBe(false);
    });
  });

  describe('logout', () => {
    it('登出应清除状态并跳转到登录页', async () => {
      store.setToken('test-token');
      store.setUserInfo({
        id: '1',
        email: 'test@test.com',
        name: '张三',
        role: 'member',
        createdAt: '2024-01-01',
      });

      await store.logout();

      expect(store.token).toBe('');
      expect(store.userInfo).toBeNull();
      expect(localStorage.getItem('ats_token')).toBeNull();
      expect(router.push).toHaveBeenCalledWith('/login');
    });
  });

  describe('restoreUserInfo', () => {
    it('应从 localStorage 恢复用户信息', () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        name: '张三',
        role: 'member',
        createdAt: '2024-01-01',
      };
      localStorage.setItem('ats_user', JSON.stringify(user));

      store.restoreUserInfo();

      expect(store.userInfo).toEqual(user);
    });

    it('损坏的 localStorage 数据应被清除', () => {
      localStorage.setItem('ats_user', 'invalid-json');

      store.restoreUserInfo();

      expect(store.userInfo).toBeNull();
      expect(localStorage.getItem('ats_user')).toBeNull();
    });
  });

  describe('fetchUserInfo', () => {
    it('有 token 时应获取用户信息', async () => {
      store.setToken('valid-token');
      vi.mocked(getCurrentUser).mockResolvedValue({
        success: true,
        user: {
          id: '1',
          email: 'test@test.com',
          name: '张三',
          role: 'member',
          createdAt: '2024-01-01',
        },
      } as any);

      const result = await store.fetchUserInfo();

      expect(result).toBe(true);
      expect(store.userInfo?.name).toBe('张三');
    });

    it('无 token 时应直接返回 false', async () => {
      const result = await store.fetchUserInfo();
      expect(result).toBe(false);
    });

    it('API 失败时应清除 token', async () => {
      store.setToken('invalid-token');
      vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthorized'));

      const result = await store.fetchUserInfo();

      expect(result).toBe(false);
      expect(store.token).toBe('');
    });
  });
});
