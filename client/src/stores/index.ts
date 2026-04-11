import { createPinia } from 'pinia';

// 创建 pinia 实例
export const pinia = createPinia();

// 导出所有 store
export * from './auth';
export * from './app';
