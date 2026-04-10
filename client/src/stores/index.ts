import { useUserStore } from './user';

export { useUserStore };

// 导出所有 store 的类型
export type UserStore = ReturnType<typeof useUserStore>;
