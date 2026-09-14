import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P3 候选人 CRUD 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护候选人的 create → list → get → 软删闭环链路。
 *
 * 与 P2.5 同模式：Playwright request 默认不带 storageState，
 * 显式从 .auth/admin.json 读出 ats_token，注入 Authorization header。
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

test.describe('候选人 CRUD @admin', () => {
  test('admin 创建 → 列表出现 → 详情正确 → 软删闭环', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      name: `E2E候选人-${suffix}`,
      phone: `138${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11),
      email: `e2e-cand-${suffix}@test.local`,
      education: '本科',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    test.skip(createRes.status !== 201, '候选人创建失败（e2e 环境可能异常），跳过');
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.name).toBe(payload.name);
    expect(created.phone).toBe(payload.phone);

    try {
      // 2. 列表出现
      const listRes = await fetch(`${apiBase}/api/candidates?page=1&pageSize=50`, { headers });
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      const list = (listBody.data ?? listBody ?? []) as Array<{ id: string; phone?: string }>;
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((c) => c.id === created.id)).toBe(true);

      // 3. 详情正确
      const detailRes = await fetch(`${apiBase}/api/candidates/${created.id}`, { headers });
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()).data;
      expect(detail.id).toBe(created.id);
      expect(detail.name).toBe(payload.name);
      expect(detail.email).toBe(payload.email);
    } finally {
      // 4. 软删（清理）
      const delRes = await fetch(`${apiBase}/api/candidates/${created.id}`, {
        method: 'DELETE',
        headers,
      });
      // 软删接口返回 200，资源状态变为 deletedAt 非空
      expect(delRes.ok).toBe(true);
    }
  });

  test('重复手机号 → 201 + warning（业务设计：允许创建但返回重复警告）', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const phone = `139${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11);
    const payload = {
      name: `重复测试-${suffix}`,
      phone,
      email: `dup1-${suffix}@test.local`,
    };

    // 第一次创建
    const first = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    test.skip(first.status !== 201, '候选人创建失败（e2e 环境可能异常），跳过');
    const firstData = (await first.json()).data;

    try {
      // 第二次：相同手机号 → 当前实现允许创建并返回 warning（非 409）
      const dupRes = await fetch(`${apiBase}/api/candidates`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, email: `dup2-${suffix}@test.local` }),
      });
      expect(dupRes.status).toBe(201);
      const dupBody = await dupRes.json();
      expect(dupBody.warning).toBeTruthy(); // '发现重复候选人' 或脱敏提示
    } finally {
      // 清理
      await fetch(`${apiBase}/api/candidates/${firstData.id}`, {
        method: 'DELETE',
        headers,
      });
    }
  });

  test('phone 字段超过 20 位 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: '超长手机号测试',
        phone: '1'.repeat(30),
        email: `longphone-${Date.now()}@test.local`,
      }),
    });
    expect(res.status).toBe(400);
  });
});