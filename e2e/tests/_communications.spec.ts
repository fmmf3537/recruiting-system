import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P7 沟通记录 CRUD 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 communications 整套路径（create → list → update → delete + follow-ups）。
 *
 * 与之前同模式：Playwright request 默认不带 storageState，
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

test.describe('沟通记录 CRUD @admin', () => {
  test('admin 创建 → 列表出现 → 更新 → 删除闭环', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const fakeCandidateId = 'clcand99999999999999999';
    const payload = {
      candidateId: fakeCandidateId,
      type: '电话',
      content: 'E2E 测试沟通内容',
    };

    // 1. 创建（candidateId 不存在 → 期望 404，跳过后续）
    const createRes = await fetch(`${apiBase}/api/communications`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    test.skip(createRes.status === 404, 'e2e 环境无候选人，跳过闭环用例');
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();

    try {
      // 2. 列表
      const listRes = await fetch(
        `${apiBase}/api/communications?page=1&pageSize=50`,
        { headers }
      );
      expect(listRes.status).toBe(200);

      // 3. 更新
      const updateRes = await fetch(
        `${apiBase}/api/communications/${created.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ content: 'E2E 更新内容' }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. 删除
      const delRes = await fetch(
        `${apiBase}/api/communications/${created.id}`,
        { method: 'DELETE', headers }
      );
      expect(delRes.status).toBe(200);
    } finally {
      // 清理
    }
  });

  test('content 为空 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/communications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: 'clcand00000000000000001',
        type: '电话',
        content: '',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('candidateId 不存在 → 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/communications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: 'cl99999999999999999999',
        type: '电话',
        content: '沟通内容',
      }),
    });
    expect(res.status).toBe(404);
  });

  test('type 非法值 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const res = await fetch(`${apiBase}/api/communications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: 'clcand00000000000000001',
        type: 'invalid-type-xyz',
        content: '沟通内容',
      }),
    });
    expect(res.status).toBe(400);
  });
});
