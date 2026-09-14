import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P14 通知中心 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护通知中心读接口 + 幂等操作
 * （list / unread-count / mark-all-read / mark-read）。
 *
 * 通知由系统事件生成，e2e 基础环境无固定 fixture，
 * 用例设计为读接口 + 幂等操作，不依赖已有通知记录。
 */

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');

interface StorageState {
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

function loadAdminToken(): string {
  const raw = fs.readFileSync(ADMIN_AUTH_FILE, 'utf8');
  const state = JSON.parse(raw) as StorageState;
  const entry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_token');
  if (!entry) throw new Error(`admin.json 缺少 ats_token entry`);
  return entry.value;
}

test.describe('通知中心 API @admin', () => {
  test('GET /notifications → 200 + data 数组', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /unread-count → 200 + 数值 ≥ 0', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { count: number } };
    expect(typeof body.data.count).toBe('number');
    expect(body.data.count).toBeGreaterThanOrEqual(0);
  });

  test('POST /mark-all-read → 200（幂等）', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/notifications/mark-all-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
  });

  test('POST /mark-read 不存在 id → 400/404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/notifications/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notificationId: fakeId }),
    });
    // schema cuid 校验 400；若通过则 service 查不到 → 404
    expect([400, 404]).toContain(res.status);
  });
});