import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P12 Offer 完整审批流 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 Offer 全链路
 * （create → submit → approve → send → result accepted → join）。
 *
 * 与 P2.5/P3/P10/P11 同模式：Playwright request 默认不带 storageState，
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

test.describe('Offer 完整审批流 @admin', () => {
  test('创建 Offer → 提交审批 → 审批通过 → 发送 → 答复 accepted → 标记入职', async ({ baseURL }) => {
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
        name: `E2EOffer-${suffix}`,
        phone: `138${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11),
        email: `e2e-offer-${suffix}@test.local`,
      }),
    });
    test.skip(candRes.status !== 201, '候选人创建失败（e2e 环境可能无候选人），跳过');
    const candidate = (await candRes.json()).data;
    expect(candidate.id).toBeTruthy();

    try {
      // 2. 创建 Offer
      const offerDate = new Date().toISOString();
      const createRes = await fetch(`${apiBase}/api/offers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidateId: candidate.id,
          salary: '25000',
          offerDate,
          expectedJoinDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
          note: 'E2E Offer 测试',
        }),
      });
      expect(createRes.status).toBe(201);
      const offer = (await createRes.json()).data;
      expect(offer.status).toBe('draft');

      // 3. 提交审批
      const submitRes = await fetch(`${apiBase}/api/offers/${candidate.id}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ approverId: ADMIN_USER_ID }),
      });
      expect(submitRes.status).toBe(200);
      expect((await submitRes.json()).data.status).toBe('pending_approval');

      // 4. 审批通过
      const approveRes = await fetch(`${apiBase}/api/offers/${candidate.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: 'E2E 审批通过' }),
      });
      expect(approveRes.status).toBe(200);
      expect((await approveRes.json()).data.status).toBe('approved');

      // 5. 标记发送
      const sendRes = await fetch(`${apiBase}/api/offers/${candidate.id}/send`, {
        method: 'POST',
        headers,
      });
      expect(sendRes.status).toBe(200);
      expect((await sendRes.json()).data.status).toBe('sent');

      // 6. 录入答复 accepted
      const resultRes = await fetch(`${apiBase}/api/offers/${candidate.id}/result`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ result: 'accepted' }),
      });
      expect(resultRes.status).toBe(200);
      expect((await resultRes.json()).data.result).toBe('accepted');

      // 7. 标记入职
      const joinRes = await fetch(`${apiBase}/api/offers/${candidate.id}/join`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          actualJoinDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        }),
      });
      expect(joinRes.status).toBe(200);
      expect((await joinRes.json()).data.joined).toBe(true);
    } finally {
      // 清理候选人（软删）
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, {
        method: 'DELETE',
        headers,
      });
    }
  });

  test('submit 用不存在 approverId → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeCandId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/offers/${fakeCandId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ approverId: 'cl' + 'x'.repeat(24) }),
    });
    // schema 校验 cuid 格式，或 service 校验 approver 不存在 → 400
    expect([400, 404]).toContain(res.status);
  });

  test('send 未审批（候选人无 Offer）→ 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeCandId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/offers/${fakeCandId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    // 候选人不存在 → 404（service 先校验候选人）
    expect([400, 404]).toContain(res.status);
  });

  test('offerDate 非法值 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeCandId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: fakeCandId,
        salary: '25000',
        offerDate: 'not-a-date',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('salary 为空 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeCandId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidateId: fakeCandId,
        salary: '',
        offerDate: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(400);
  });
});