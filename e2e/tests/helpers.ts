import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AUTH_DIR = path.join(__dirname, '..', '.auth');

/** 与 e2e/global-setup.ts 产出对齐的 storageState 格式 */
interface StorageState {
  cookies: unknown[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/** 读取指定角色的 storageState（由 global-setup 预先产出） */
function loadStorageState(
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'
): StorageState {
  const file = path.join(AUTH_DIR, `${role}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`storageState 缺失: ${file}（请先跑 global-setup 生成 .auth/*.json）`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState;
}

/**
 * 通过预生成 storageState 注入 localStorage 登录（不再用过期硬编码 JWT）
 *
 * 用 page.addInitScript 在每次 navigation 前自动注入，
 * 比 evaluate 更稳定（避免 race condition）。
 *
 * @param page Playwright Page
 * @param role 登录角色（默认 admin）
 */
export async function login(page: Page): Promise<void>;
export async function login(
  page: Page,
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'
): Promise<void>;
export async function login(
  page: Page,
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer' = 'admin'
): Promise<void> {
  const state = loadStorageState(role);
  const tokenEntry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_token');
  const userEntry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_user');
  if (!tokenEntry || !userEntry) {
    throw new Error(`${role}.json 缺少 ats_token / ats_user entry`);
  }

  // 在每次 page.goto 前注入 localStorage（自动应用）
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('ats_token', token);
      localStorage.setItem('ats_user', user);
    },
    { token: tokenEntry.value, user: userEntry.value }
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}

/**
 * 兼容旧 TEST_EMAIL 常量（auth.spec.ts 用）
 * 与 seed-test-users.ts 的 admin 邮箱对齐
 */
export const TEST_EMAIL = 'admin@test.local';

/** 从 .auth/<role>.json 读取 ats_token（API fetch 不会自动带 storageState） */
export function loadAuthToken(
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'
): string {
  const state = loadStorageState(role);
  const entry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_token');
  if (!entry) throw new Error(`${role}.json 缺少 ats_token entry`);
  return entry.value;
}

/** 从 .auth/<role>.json 的 ats_user 解析用户 id，禁止硬编码 cuid */
export function loadAuthUserId(
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'
): string {
  const state = loadStorageState(role);
  const userEntry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_user');
  if (!userEntry) throw new Error(`${role}.json 缺少 ats_user entry`);
  return (JSON.parse(userEntry.value) as { id: string }).id;
}
