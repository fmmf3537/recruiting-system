import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P15 候选人信息编辑 API 冒烟（admin project，API 层）
 *
 * 回归哨兵：保护 PATCH /api/candidates/:id 链路
 * （此前 E2E 缺失此环节，仅单元/集成层覆盖）。
 *
 * 与 P3/P10 同模式：Playwright request 默认不带 storageState，
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

test.describe('候选人信息编辑 @admin', () => {
  test('创建候选人 → 修改姓名/电话/邮箱 → 详情确认', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const suffix = Date.now().toString().slice(-8);
    // 1. 创建候选人
    const createRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `编辑源-${suffix}`,
        phone: `138${suffix.slice(0, 8)}`,
        email: `edit-src-${suffix}@test.local`,
      }),
    });
    test.skip(createRes.status !== 201, '候选人创建失败（e2e 环境可能异常），跳过');
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();

    try {
      // 2. PATCH 修改姓名/电话/邮箱
      const newPhone = `139${suffix.slice(0, 8)}`;
      const patchRes = await fetch(`${apiBase}/api/candidates/${created.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: `编辑后-${suffix}`,
          phone: newPhone,
          email: `edit-new-${suffix}@test.local`,
        }),
      });
      expect(patchRes.status).toBe(200);
      const patched = (await patchRes.json()).data;
      expect(patched.name).toBe(`编辑后-${suffix}`);
      expect(patched.phone).toBe(newPhone);

      // 3. 详情确认持久化
      const detailRes = await fetch(`${apiBase}/api/candidates/${created.id}`, { headers });
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()).data;
      expect(detail.name).toBe(`编辑后-${suffix}`);
      expect(detail.phone).toBe(newPhone);
      expect(detail.email).toBe(`edit-new-${suffix}@test.local`);
    } finally {
      // 清理（软删）
      await fetch(`${apiBase}/api/candidates/${created.id}`, {
        method: 'DELETE',
        headers,
      });
    }
  });

  test('编辑候选人可改为关联新职位并保存工作经历', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const suffix = Date.now().toString().slice(-8);

    const jobRes = await fetch(`${apiBase}/api/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `候选人关联-${suffix}`,
        departments: ['研发部'],
        level: 'P6',
        location: '上海',
        type: '全职',
        description: '用于候选人关联回归测试的职位描述',
        requirements: '用于候选人关联回归测试的职位要求',
      }),
    });
    expect(jobRes.status).toBe(201);
    const job = (await jobRes.json()).data;

    const candidateRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `关联源-${suffix}`,
        phone: `138${suffix.slice(0, 8)}`,
        email: `relation-${suffix}@test.local`,
      }),
    });
    expect(candidateRes.status).toBe(201);
    const candidate = (await candidateRes.json()).data;

    try {
      const updateRes = await fetch(`${apiBase}/api/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          jobIds: [job.id],
          workHistory: [{
            company: '回归测试公司',
            position: '产品经理',
            startDate: '2024-01-01',
            endDate: '2025-01-01',
            description: '负责招聘系统需求规划',
          }],
        }),
      });
      expect(updateRes.status).toBe(200);

      const detailRes = await fetch(`${apiBase}/api/candidates/${candidate.id}`, { headers });
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()).data;
      expect(detail.jobs).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: job.id, title: job.title }),
      ]));
      expect(detail.workHistories).toEqual(expect.arrayContaining([
        expect.objectContaining({ company: '回归测试公司', position: '产品经理' }),
      ]));
    } finally {
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, { method: 'DELETE', headers });
      await fetch(`${apiBase}/api/jobs/${job.id}`, { method: 'DELETE', headers });
    }
  });

  test('修改不存在的候选人 → 404', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: '不存在' }),
    });
    expect(res.status).toBe(404);
  });

  test('phone 少于 11 位 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: '12345' }),
    });
    // schema min(11) → 400
    expect(res.status).toBe(400);
  });

  test('name 少于 2 字 → 400', async ({ baseURL }) => {
    const token = loadAdminToken();
    const apiBase = baseURL ?? 'http://localhost:5174';
    const fakeId = 'clcand00000000000000001';
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'X' }),
    });
    // schema min(2) → 400
    expect(res.status).toBe(400);
  });

  test('非 admin 修改 → 403（interviewer 无 candidate:update）', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    // 用 interviewer 角色 token 试（如果 .auth/interviewer.json 存在）
    const ivAuthFile = path.join(AUTH_DIR, 'interviewer.json');
    test.skip(!fs.existsSync(ivAuthFile), 'interviewer storageState 缺失，跳过');

    const ivState = JSON.parse(fs.readFileSync(ivAuthFile, 'utf8')) as StorageState;
    const ivToken = ivState.origins[0]?.localStorage.find((x) => x.name === 'ats_token')?.value;
    test.skip(!ivToken, 'interviewer.json 缺少 ats_token');

    const fakeId = 'cl' + 'x'.repeat(24);
    const res = await fetch(`${apiBase}/api/candidates/${fakeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ivToken}`,
      },
      body: JSON.stringify({ name: '越权测试' }),
    });
    // interviewer 无 candidate:update → 403
    expect(res.status).toBe(403);
  });
});