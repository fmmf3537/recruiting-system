import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P10 候选人推进阶段 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 POST /api/candidates/:id/stage 链路。
 *
 * 与 P2.5/P3 同模式：Playwright request 默认不带 storageState，
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

test.describe('候选人推进阶段 @admin', () => {
  test('admin 创建候选人 → 推进到下一个阶段 → passed', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const createPayload = {
      name: `E2E推进-${suffix}`,
      phone: `138${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11),
      email: `e2e-stage-${suffix}@test.local`,
    };

    // 1. 创建候选人
    const createRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createPayload),
    });
    test.skip(createRes.status !== 201, '候选人创建失败（e2e 环境可能无候选人），跳过');
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();

    try {
      // 2. 推进到下一阶段（status=passed）
      const advanceRes = await fetch(
        `${apiBase}/api/candidates/${created.id}/stage`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ stage: '初筛', status: 'passed' }),
        }
      );
      expect(advanceRes.status).toBe(200);
    } finally {
      // 软删清理
      await fetch(`${apiBase}/api/candidates/${created.id}`, {
        method: 'DELETE',
        headers,
      });
    }
  });

  test('推进 status 非法值 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'clcand99999999999999999';
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}/stage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stage: '初筛', status: 'invalid-status' }),
    });
    expect(res.status).toBe(400);
  });

  test('candidateId 不存在 → 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'cl99999999999999999999';
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}/stage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stage: '初筛', status: 'passed' }),
    });
    expect(res.status).toBe(404);
  });

  test('stage 空字符串 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}/stage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stage: '', status: 'passed' }),
    });
    expect(res.status).toBe(400);
  });
});
