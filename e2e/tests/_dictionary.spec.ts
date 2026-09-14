import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P14 字典 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护字典 CRUD（create → list → categories → update → delete）
 * + 权限（创建/更新/删除仅 admin）。
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

test.describe('字典 API @admin', () => {
  test('创建字典项 → 列表出现 → categories 含分类 → 更新 → 删除', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const category = `e2e_cat_${suffix}`;
    const payload = {
      category,
      code: `e2e_code_${suffix}`,
      name: `E2E字典-${suffix}`,
    };

    // 1. 创建（admin）
    const createRes = await fetch(`${apiBase}/api/dictionaries`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    // createDictionary 是创建类操作，返回 201
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.name).toBe(payload.name);

    try {
      // 2. 列表（按 category 筛选）
      const listRes = await fetch(
        `${apiBase}/api/dictionaries?category=${encodeURIComponent(category)}`,
        { headers }
      );
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()).data ?? [];
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((d: { id: string }) => d.id === created.id)).toBe(true);

      // 3. categories 含分类（getCategories 返回 string[] 分类名）
      const catRes = await fetch(`${apiBase}/api/dictionaries/categories`, { headers });
      expect(catRes.status).toBe(200);
      const cats = (await catRes.json()).data ?? [];
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.some((c: string) => c === category)).toBe(true);

      // 4. 更新
      const updateRes = await fetch(`${apiBase}/api/dictionaries/${created.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ enabled: false }),
      });
      expect(updateRes.status).toBe(200);
      expect((await updateRes.json()).data.enabled).toBe(false);
    } finally {
      // 5. 删除
      const delRes = await fetch(`${apiBase}/api/dictionaries/${created.id}`, {
        method: 'DELETE',
        headers,
      });
      expect(delRes.ok).toBe(true);
    }
  });

  test('创建 name 为空 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/dictionaries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ category: 'e2e_cat', name: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('非 admin 创建 → 403', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    // 用 hr 角色 token 试试（如果 .auth/hr.json 存在）
    const hrAuthFile = path.join(AUTH_DIR, 'hr.json');
    test.skip(!fs.existsSync(hrAuthFile), 'hr storageState 缺失，跳过');

    const hrState = JSON.parse(fs.readFileSync(hrAuthFile, 'utf8')) as StorageState;
    const hrToken = hrState.origins[0]?.localStorage.find((x) => x.name === 'ats_token')?.value;
    test.skip(!hrToken, 'hr.json 缺少 ats_token');

    const res = await fetch(`${apiBase}/api/dictionaries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hrToken}`,
      },
      body: JSON.stringify({ category: 'e2e_cat', name: 'HR越权' }),
    });
    expect(res.status).toBe(403);
  });

  test('更新不存在字典项 → 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/dictionaries/${fakeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: false }),
    });
    // schema cuid 校验 400；若通过则 service 查不到 → 404
    expect([400, 404]).toContain(res.status);
  });
});