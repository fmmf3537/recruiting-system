import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P14 标签 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护标签 CRUD（create → list → update → delete）+ schema 校验。
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

test.describe('标签 API @admin', () => {
  test('创建标签 → 列表出现 → 更新 → 删除', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      name: `E2E标签-${suffix}`,
      color: '#FF5733',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    // createTag 是创建类操作，返回 201（tag.controller createTag）
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.name).toBe(payload.name);

    try {
      // 2. 列表出现
      const listRes = await fetch(`${apiBase}/api/tags`, { headers });
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()).data ?? [];
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((t: { id: string }) => t.id === created.id)).toBe(true);

      // 3. 更新
      const updateRes = await fetch(`${apiBase}/api/tags/${created.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: `${payload.name}-改`, color: '#28A745' }),
      });
      expect(updateRes.status).toBe(200);
      expect((await updateRes.json()).data.name).toContain('改');
    } finally {
      // 4. 删除
      const delRes = await fetch(`${apiBase}/api/tags/${created.id}`, {
        method: 'DELETE',
        headers,
      });
      expect(delRes.ok).toBe(true);
    }
  });

  test('创建 name 为空 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('创建 color 非法 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '坏颜色', color: 'red' }),
    });
    // #RRGGBB 正则校验
    expect(res.status).toBe(400);
  });

  test('POST /init-presets → 200（admin）', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/tags/init-presets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});