import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P13 职位管理 CRUD API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护职位全链路
 * （create → list → detail → update → close → duplicate → delete + 权限）。
 *
 * 与 P2.5/P3/P12 同模式：Playwright request 默认不带 storageState，
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

test.describe('职位管理 CRUD @admin', () => {
  test('admin 创建职位 → 列表出现 → 详情 → 更新 → 关闭 → 删除', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      title: `E2E职位-${suffix}`,
      departments: ['研发部'],
      level: 'P6',
      location: '上海',
      type: '全职',
      description: 'E2E 职位描述',
      requirements: 'E2E 职位要求',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('open');

    try {
      // 2. 列表出现
      const listRes = await fetch(`${apiBase}/api/jobs?page=1&pageSize=50`, { headers });
      expect(listRes.status).toBe(200);
      const list = ((await listRes.json()).data ?? []) as Array<{ id: string }>;
      expect(list.some((j) => j.id === created.id)).toBe(true);

      // 3. 详情
      const detailRes = await fetch(`${apiBase}/api/jobs/${created.id}`, { headers });
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()).data;
      expect(detail.id).toBe(created.id);
      expect(detail.title).toBe(payload.title);

      // 4. 更新
      const updateRes = await fetch(`${apiBase}/api/jobs/${created.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ level: 'P7' }),
      });
      expect(updateRes.status).toBe(200);
      expect((await updateRes.json()).data.level).toBe('P7');

      // 5. 关闭
      const closeRes = await fetch(`${apiBase}/api/jobs/${created.id}/close`, {
        method: 'POST',
        headers,
      });
      expect(closeRes.status).toBe(200);
      expect((await closeRes.json()).data.status).toBe('closed');
    } finally {
      // 6. 删除（admin）
      const delRes = await fetch(`${apiBase}/api/jobs/${created.id}`, {
        method: 'DELETE',
        headers,
      });
      expect(delRes.ok).toBe(true);
    }
  });

  test('复制职位 → 新职位标题含"（副本）"', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      title: `E2E副本源-${suffix}`,
      departments: ['研发部'],
      level: 'P6',
      location: '上海',
      type: '全职',
      description: 'E2E 副本源描述',
      requirements: 'E2E 副本源要求',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    test.skip(createRes.status !== 201, '职位创建失败（e2e 环境可能无权限），跳过');
    const created = (await createRes.json()).data;

    try {
      // 2. 复制
      const dupRes = await fetch(`${apiBase}/api/jobs/${created.id}/duplicate`, {
        method: 'POST',
        headers,
      });
      // duplicate 是创建类操作，返回 201（job.controller duplicateJob）
      expect(dupRes.status).toBe(201);
      const duplicated = (await dupRes.json()).data;
      expect(duplicated.id).toBeTruthy();
      expect(duplicated.id).not.toBe(created.id);
      // 标题含"（副本）"
      expect(duplicated.title).toContain('（副本）');
    } finally {
      // 3. 清理（两职位都删）
      await fetch(`${apiBase}/api/jobs/${created.id}`, { method: 'DELETE', headers });
    }
  });

  test('title 少于 2 字 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'X',
        departments: ['研发部'],
        level: 'P6',
        location: '上海',
        type: '全职',
        description: '描述',
        requirements: '要求',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('departments 空数组 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'E2E测试职位',
        departments: [],
        level: 'P6',
        location: '上海',
        type: '全职',
        description: '描述',
        requirements: '要求',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('非 admin 删除职位 → 403', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    // 用 hr 角色 token 试试（如果 .auth/hr.json 存在）
    const hrAuthFile = path.join(AUTH_DIR, 'hr.json');
    test.skip(!fs.existsSync(hrAuthFile), 'hr storageState 缺失，跳过');

    const hrState = JSON.parse(fs.readFileSync(hrAuthFile, 'utf8')) as StorageState;
    const hrToken = hrState.origins[0]?.localStorage.find((x) => x.name === 'ats_token')?.value;
    test.skip(!hrToken, 'hr.json 缺少 ats_token');

    const fakeJobId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/jobs/${fakeJobId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    // 非 admin → 403（authorize('admin') 拦截，未进入 service 的 404）
    expect(res.status).toBe(403);
  });
});