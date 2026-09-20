import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P2.5 用户管理 CRUD 冒烟（admin project，API 层）
 *
 * 回归哨兵：确保「后台添加用户」可用（曾因缺 POST /api/users 404）。
 *
 * Playwright 的 `request` fixture 默认不带 storageState 的 localStorage。
 * 这里显式从 .auth/admin.json 读出 ats_token，注入 Authorization 头。
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

test.describe('用户管理 CRUD @admin', () => {
  test.beforeEach(async ({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'admin', '仅 admin project 执行管理员用户管理用例');
  });

  test('admin 创建 → 列表出现 → 删除 闭环', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const email = `e2e-user-${suffix}@test.local`;
    const payload = {
      email,
      password: 'E2ePass123',
      name: `E2E用户-${suffix}`,
      role: 'hr',
      department: '研发部',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.email).toBe(email);

    try {
      // 2. 列表出现
      const listRes = await fetch(`${apiBase}/api/users?page=1&limit=50`, { headers });
      expect(listRes.status).toBe(200);
      const list = ((await listRes.json()).data ?? []) as Array<{ email: string }>;
      expect(list.some((u) => u.email === email)).toBe(true);

      // 3. 重复邮箱 → 409
      const dupRes = await fetch(`${apiBase}/api/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      expect(dupRes.status).toBe(409);
    } finally {
      // 4. 删除（清理）
      const delRes = await fetch(`${apiBase}/api/users/${created.id}`, {
        method: 'DELETE',
        headers,
      });
      expect(delRes.ok).toBe(true);
    }
  });

  test('admin 在编辑成员时密码留空可保存且原密码仍有效', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'admin', '仅 admin project 执行管理员成员编辑用例');
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const suffix = Date.now().toString().slice(-8);
    const email = `e2e-keep-password-${suffix}@test.local`;
    const password = 'KeepPass123';
    const name = `保留密码-${suffix}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const createRes = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, name, role: 'hr', department: '研发部' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as { id: string };

    try {
      await page.goto('/users');
      const row = page.locator('.el-table__body-wrapper tr', { hasText: email });
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: '编辑' }).click();

      const dialog = page.locator('.el-dialog:visible');
      await expect(dialog.getByText('编辑成员')).toBeVisible();
      const inputs = dialog.locator('input');
      await inputs.nth(0).fill(`${name}-已更新`);
      await inputs.nth(2).fill('');
      await dialog.getByRole('button', { name: '保存' }).click();
      await expect(page.locator('.el-message')).toContainText('修改成功');

      const loginRes = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(loginRes.status).toBe(200);
    } finally {
      await fetch(`${apiBase}/api/users/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('密码不满足策略 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: `bad-pass-${Date.now()}@test.local`,
        password: '12345678', // 仅数字
        name: '坏密码用户',
        role: 'member',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('非 admin 创建 → 403', async ({ baseURL }) => {
    // 用 hr 角色 token 试试（如果 .auth/hr.json 存在）
    const hrAuthFile = path.join(AUTH_DIR, 'hr.json');
    test.skip(!fs.existsSync(hrAuthFile), 'hr storageState 缺失，跳过');

    const hrState = JSON.parse(fs.readFileSync(hrAuthFile, 'utf8')) as StorageState;
    const hrToken = hrState.origins[0]?.localStorage.find((x) => x.name === 'ats_token')?.value;
    test.skip(!hrToken, 'hr.json 缺少 ats_token');

    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hrToken}`,
      },
      body: JSON.stringify({
        email: `hr-tries-${Date.now()}@test.local`,
        password: 'HrTries123',
        name: 'HR越权测试',
        role: 'member',
      }),
    });
    expect(res.status).toBe(403);
  });
});
