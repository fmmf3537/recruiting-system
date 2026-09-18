import { test, expect } from '@playwright/test';
import { loadAuthToken } from './helpers';

/**
 * 用人经理招聘工作台 API 回归。
 * 验证入口权限和岗位维度接口契约；数据由 E2E 最小种子提供，允许为空列表。
 */
function headers(role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'): HeadersInit {
  return { Authorization: `Bearer ${loadAuthToken(role)}` };
}

function apiBaseOf(baseURL: string | undefined): string {
  return baseURL ?? 'http://localhost:5174';
}

test.describe('用人经理招聘工作台 @hiring_manager', () => {
  test('工作台各岗位维度接口可访问且返回稳定结构', async ({ baseURL }) => {
    const apiBase = apiBaseOf(baseURL);
    const requests = [
      ['/api/hiring/overview', (data: Record<string, unknown>) => {
        expect(data.scope).toBe('owned_jobs');
        expect(data).toHaveProperty('openJobs');
        expect(data).toHaveProperty('activeCandidates');
      }],
      ['/api/hiring/jobs', (data: unknown) => {
        expect(Array.isArray(data)).toBe(true);
        for (const job of data as Array<Record<string, unknown>>) {
          expect(job).toHaveProperty('candidateCount');
          expect(job).toHaveProperty('stageCounts');
        }
      }],
      ['/api/hiring/candidates', (data: unknown) => expect(Array.isArray(data)).toBe(true)],
      ['/api/hiring/approvals', (data: unknown) => expect(Array.isArray(data)).toBe(true)],
      ['/api/hiring/interviews', (data: unknown) => expect(Array.isArray(data)).toBe(true)],
    ] as const;

    for (const [path, assertData] of requests) {
      const response = await fetch(`${apiBase}${path}`, { headers: headers('hiring_manager') });
      expect(response.status, `${path} 应允许用人经理访问`).toBe(200);
      const json = await response.json() as { success?: boolean; data: unknown };
      expect(json.success).toBe(true);
      assertData(json.data as never);
    }
  });

  test('HR 与面试官不能访问用人经理招聘工作台', async ({ baseURL }) => {
    const apiBase = apiBaseOf(baseURL);
    for (const role of ['hr', 'interviewer'] as const) {
      const response = await fetch(`${apiBase}/api/hiring/overview`, { headers: headers(role) });
      expect(response.status, `${role} 不应访问招聘工作台`).toBe(403);
    }
  });
});
