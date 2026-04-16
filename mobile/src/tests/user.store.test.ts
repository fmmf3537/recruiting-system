import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserStore } from '@/stores/user';

// jsdom 的 localStorage mock 不完整，手动 mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('should be not login initially when localStorage is empty', () => {
    const store = useUserStore();
    expect(store.isLogin).toBe(false);
    expect(store.isAdmin).toBe(false);
  });

  it('should update login state after setting token', () => {
    const store = useUserStore();
    store.setToken('test-token');
    expect(store.isLogin).toBe(true);
    expect(localStorage.getItem('ats_token')).toBe('test-token');
  });

  it('should clear user info after logout', () => {
    const store = useUserStore();
    store.setToken('test-token');
    store.setUserInfo({ id: '1', email: 'a@b.com', name: 'Test', role: 'member', createdAt: '' });
    store.logout();
    expect(store.isLogin).toBe(false);
    expect(store.userInfo).toBeNull();
    expect(localStorage.getItem('ats_token')).toBeNull();
  });
});
