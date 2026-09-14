import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P4 HC 编制申请工作流冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 hc-requests 完整审批流（create → submit → approve/reject → create-job）。
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

test.describe('HC 编制申请工作流 @admin', () => {
  test('admin 创建 → submit → approve 完整工作流', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      title: `E2E-HC-${suffix}`,
      department: '研发部',
      level: 'P6',
      headcount: 1,
      urgency: 'urgent',
      reason: 'new',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/hc-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('draft');

    try {
      // 2. 提交审批
      const submitRes = await fetch(`${apiBase}/api/hc-requests/${created.id}/submit`, {
        method: 'POST',
        headers,
      });
      expect(submitRes.status).toBe(200);

      // 3. admin approve
      const approveRes = await fetch(`${apiBase}/api/hc-requests/${created.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: 'E2E 自动审批' }),
      });
      expect(approveRes.status).toBe(200);
      const approved = (await approveRes.json()).data;
      expect(approved.status).toBe('approved');

      // 4. 详情确认
      const detailRes = await fetch(`${apiBase}/api/hc-requests/${created.id}`, { headers });
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()).data;
      expect(detail.status).toBe('approved');
      expect(detail.approverId).toBeTruthy();
    } finally {
      // 清理（approved 不能删除，但不影响测试）
    }
  });

  test('admin 创建 → submit → reject（带 note）', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    const payload = {
      title: `E2E-HC-拒-${suffix}`,
      department: '研发部',
      level: 'P7',
      headcount: 1,
      urgency: 'normal',
      reason: 'expansion',
    };

    // 1. 创建
    const createRes = await fetch(`${apiBase}/api/hc-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data;

    try {
      // 2. 提交
      const submitRes = await fetch(`${apiBase}/api/hc-requests/${created.id}/submit`, {
        method: 'POST',
        headers,
      });
      expect(submitRes.status).toBe(200);

      // 3. reject（带 note）
      const rejectRes = await fetch(`${apiBase}/api/hc-requests/${created.id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: 'E2E 自动驳回：HC 数量超标' }),
      });
      expect(rejectRes.status).toBe(200);
      const rejected = (await rejectRes.json()).data;
      expect(rejected.status).toBe('rejected');
      expect(rejected.approveNote).toContain('E2E 自动驳回');
    } finally {
      // 清理（rejected 可删除，但不一定必要）
    }
  });

  test('reject 空 note → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 假设存在一个已 submitted 的 HC；这里直接尝试 reject 空 note
    // 实际场景下需要先创建+submit，但因为 reject 在 schema 层就拒空 note，
    // 即使 hc 不存在也会返回 400（zod 验证先于 service）
    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/hc-requests/${fakeId}/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ note: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('非 admin approve → 403', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    // 用 hr 角色 token 试试（如果 .auth/hr.json 存在）
    const hrAuthFile = path.join(AUTH_DIR, 'hr.json');
    test.skip(!fs.existsSync(hrAuthFile), 'hr storageState 缺失，跳过');

    const hrState = JSON.parse(fs.readFileSync(hrAuthFile, 'utf8')) as StorageState;
    const hrToken = hrState.origins[0]?.localStorage.find((x) => x.name === 'ats_token')?.value;
    test.skip(!hrToken, 'hr.json 缺少 ats_token');

    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/hc-requests/${fakeId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hrToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });
});
