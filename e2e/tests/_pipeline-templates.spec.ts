import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P5 流程模板 CRUD 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 pipeline-templates admin 配置流（list → create → update → enable/disable）。
 *
 * 与 P2.5/P3/P4 同模式：Playwright request 默认不带 storageState，
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

test.describe('流程模板 CRUD @admin', () => {
  test('admin 创建 → 列表出现 → 更新 enabled 闭环', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      name: `E2E模板-${suffix}`,
      type: '社招',
      stages: ['入库', '初筛', '复试', '终面', 'Offer', '入职'],
      isDefault: false,
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/pipeline-templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.name).toBe(payload.name);
    expect(created.type).toBe('社招');

    try {
      // 2. 列表出现
      const listRes = await fetch(`${apiBase}/api/pipeline-templates`, { headers });
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()).data ?? [];
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((t: { id: string }) => t.id === created.id)).toBe(true);

      // 3. 更新 enabled
      const updateRes = await fetch(
        `${apiBase}/api/pipeline-templates/${created.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ enabled: false }),
        }
      );
      expect(updateRes.status).toBe(200);
      const updated = (await updateRes.json()).data;
      expect(updated.enabled).toBe(false);

      // 4. stages 路径（不传 candidateId）→ 返回默认模板
      const stagesRes = await fetch(
        `${apiBase}/api/pipeline-templates/stages`,
        { headers }
      );
      expect(stagesRes.status).toBe(200);
      const stages = (await stagesRes.json()).data;
      expect(Array.isArray(stages)).toBe(true);
    } finally {
      // 注意：pipeline-templates 没有 DELETE 路由（管理用），保留测试数据
    }
  });

  test('stages 空数组 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/pipeline-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: '空模板测试',
        type: '校招',
        stages: [],
      }),
    });
    expect(res.status).toBe(400);
  });

  test('name 为空 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/pipeline-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: '',
        type: '校招',
        stages: ['笔试', '一面', 'Offer'],
      }),
    });
    expect(res.status).toBe(400);
  });

  test('非 admin 列表 → 403', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    // 用 hr 角色 token 试试
    const hrAuthFile = path.join(AUTH_DIR, 'hr.json');
    test.skip(!fs.existsSync(hrAuthFile), 'hr storageState 缺失，跳过');

    const hrState = JSON.parse(fs.readFileSync(hrAuthFile, 'utf8')) as StorageState;
    const hrToken = hrState.origins[0]?.localStorage.find((x) => x.name === 'ats_token')?.value;
    test.skip(!hrToken, 'hr.json 缺少 ats_token');

    const res = await fetch(`${apiBase}/api/pipeline-templates`, {
      headers: { Authorization: `Bearer ${hrToken}` },
    });
    expect(res.status).toBe(403);
  });
});
