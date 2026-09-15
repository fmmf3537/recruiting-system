import { test, expect } from '@playwright/test';
import { loadAuthToken } from './helpers';

/**
 * HRW-E2E HR 工作负载监控 API 回归
 *
 * 保护 GET /api/hr-workload/overview 与 /export 的权限矩阵、日/周/月契约、参数校验。
 * Playwright fetch 不带 project storageState，显式从 .auth/<role>.json 读 token，
 * 因此 admin / hr / hiring_manager / interviewer 四个 project 跑同一文件都应通过。
 */

type AuthRole = 'admin' | 'hr' | 'hiring_manager' | 'interviewer';

function loadToken(role: AuthRole): string {
  return loadAuthToken(role);
}

function authHeaders(role: AuthRole): Record<string, string> {
  return {
    Authorization: `Bearer ${loadToken(role)}`,
  };
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function apiBaseOf(baseURL: string | undefined): string {
  return baseURL ?? 'http://localhost:5174';
}

function assertOverviewShape(json: {
  success?: boolean;
  data?: {
    range?: { start?: string; end?: string };
    summary?: Record<string, unknown>;
    rows?: unknown;
  };
}): void {
  expect(json.success).toBe(true);
  expect(json.data).toBeTruthy();
  expect(json.data?.range?.start).toBeTruthy();
  expect(json.data?.range?.end).toBeTruthy();
  expect(json.data?.summary).toBeTruthy();
  expect(json.data?.summary).toHaveProperty('activeHrCount');
  expect(json.data?.summary).toHaveProperty('newCandidates');
  expect(json.data?.summary).toHaveProperty('joined');
  expect(json.data?.summary).toHaveProperty('weakPointCount');
  expect(Array.isArray(json.data?.rows)).toBe(true);

  const rows = json.data?.rows as Array<Record<string, unknown>>;
  if (rows.length === 0) return;
  const row = rows[0];
  expect(row).toHaveProperty('hrId');
  expect(row).toHaveProperty('hrName');
  expect(row).toHaveProperty('process');
  expect(row).toHaveProperty('result');
  expect(row).toHaveProperty('rates');
  expect(row).toHaveProperty('status');
  expect(row).toHaveProperty('weakPoints');
}

test.describe('HR 工作负载监控 API', () => {
  test('A: admin overview 日/周/月 200 且结构完整', async ({ baseURL }) => {
    const apiBase = apiBaseOf(baseURL);
    const date = todayStr();
    const headers = authHeaders('admin');

    for (const period of ['day', 'week', 'month'] as const) {
      const res = await fetch(
        `${apiBase}/api/hr-workload/overview?period=${period}&date=${date}`,
        { headers }
      );
      expect(res.status, await res.clone().text()).toBe(200);
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          range?: { start?: string; end?: string };
          summary?: Record<string, unknown>;
          rows?: unknown;
        };
      };
      assertOverviewShape(json);
    }
  });

  test('B: hr / hiring_manager / interviewer 调 overview → 403', async ({ baseURL }) => {
    const apiBase = apiBaseOf(baseURL);
    const date = todayStr();
    const denied: AuthRole[] = ['hr', 'hiring_manager', 'interviewer'];

    for (const role of denied) {
      const res = await fetch(
        `${apiBase}/api/hr-workload/overview?period=day&date=${date}`,
        { headers: authHeaders(role) }
      );
      expect(res.status, `${role} 应 403，实际 ${res.status}`).toBe(403);
    }
  });

  test('C: admin export 周报 200 且附件非空', async ({ baseURL }) => {
    const apiBase = apiBaseOf(baseURL);
    const date = todayStr();
    const res = await fetch(
      `${apiBase}/api/hr-workload/export?period=week&date=${date}`,
      { headers: authHeaders('admin') }
    );
    expect(res.status, await res.clone().text()).toBe(200);

    const disposition = res.headers.get('content-disposition') || '';
    expect(disposition.toLowerCase()).toContain('attachment');
    const contentType = res.headers.get('content-type') || '';
    expect(contentType.length).toBeGreaterThan(0);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBeGreaterThan(0);
  });

  test('D: 缺 period 或 period=year → 400', async ({ baseURL }) => {
    const apiBase = apiBaseOf(baseURL);
    const date = todayStr();
    const headers = authHeaders('admin');

    const missingPeriod = await fetch(
      `${apiBase}/api/hr-workload/overview?date=${date}`,
      { headers }
    );
    expect(missingPeriod.status).toBe(400);

    const badPeriod = await fetch(
      `${apiBase}/api/hr-workload/overview?period=year&date=${date}`,
      { headers }
    );
    expect(badPeriod.status).toBe(400);
  });
});
