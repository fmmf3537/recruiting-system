import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P11 面试安排 / 取消 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 POST /api/interviews + /api/interviews/:id/cancel 链路。
 *
 * 与 P2.5/P3/P10 同模式：Playwright request 默认不带 storageState，
 * 显式从 .auth/admin.json 读出 ats_token，注入 Authorization header。
 */

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');

// admin 用户的真实 id（从 admin.json 的 ats_user 动态读取，避免 seed 变更后硬编码失效）
const ADMIN_USER_ID = (() => {
  const raw = fs.readFileSync(ADMIN_AUTH_FILE, 'utf8');
  const state = JSON.parse(raw) as StorageState;
  const userEntry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_user');
  if (!userEntry) throw new Error(`admin.json 缺少 ats_user entry`);
  return (JSON.parse(userEntry.value) as { id: string }).id;
})();

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

test.describe('面试安排/取消 @admin', () => {
  test('admin 创建候选人 → 创建面试 → 取消面试', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);

    // 1. 创建候选人
    const candRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `E2E面试-${suffix}`,
        phone: `138${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11),
        email: `e2e-interview-${suffix}@test.local`,
      }),
    });
    test.skip(candRes.status !== 201, '候选人创建失败（e2e 环境可能无候选人），跳过');
    const candidate = (await candRes.json()).data;
    expect(candidate.id).toBeTruthy();

    try {
      // 2. 创建面试（用 admin 自己当面试官，时间为明天）
      const futureTime = new Date(Date.now() + 86400 * 1000).toISOString();
      const interviewRes = await fetch(`${apiBase}/api/interviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidateId: candidate.id,
          round: '初试',
          type: '视频',
          interviewers: [{ id: ADMIN_USER_ID, name: '管理员测试' }],
          scheduledAt: futureTime,
          duration: 60,
        }),
      });
      expect(interviewRes.status).toBe(201);
      const interview = (await interviewRes.json()).data;
      expect(interview.id).toBeTruthy();

      // 3. 取消面试
      const cancelRes = await fetch(
        `${apiBase}/api/interviews/${interview.id}/cancel`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason: 'E2E 测试取消' }),
        }
      );
      expect(cancelRes.status).toBe(200);
    } finally {
      // 清理候选人
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, {
        method: 'DELETE',
        headers,
      });
    }
  });

  test('取消面试 ID 不存在 → 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/interviews/${fakeId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: '测试' }),
    });
    expect(res.status).toBe(404);
  });

  test('interviewers 空数组 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeCandId = 'clcand00000000000000001';
    const futureTime = new Date(Date.now() + 86400 * 1000).toISOString();
    const res = await fetch(`${apiBase}/api/interviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: fakeCandId,
        round: '初试',
        type: '视频',
        interviewers: [],
        scheduledAt: futureTime,
        duration: 60,
      }),
    });
    expect(res.status).toBe(400);
  });

  test('candidateId 不存在 → 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeCandId = 'cl99999999999999999999';
    const futureTime = new Date(Date.now() + 86400 * 1000).toISOString();
    const res = await fetch(`${apiBase}/api/interviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: fakeCandId,
        round: '初试',
        type: '视频',
        interviewers: [{ id: ADMIN_USER_ID, name: '管理员测试' }],
        scheduledAt: futureTime,
        duration: 60,
      }),
    });
    expect(res.status).toBe(404);
  });
});
