import { test, expect } from '@playwright/test';
import { loadAuthToken, loadAuthUserId } from './helpers';

/**
 * AI 面试大纲异步任务回归。
 * 不依赖外部 LLM 成功：验证请求立即返回 202、任务持久化可查询，
 * 以防回退为长连接同步调用而再次触发网关超时。
 */
test.describe('AI 面试大纲异步任务 @admin', () => {
  test('创建任务立即返回，并可查询最近任务状态', async ({ baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'admin', '仅 admin project 执行大纲任务用例');
    const apiBase = baseURL ?? 'http://localhost:5174';
    const token = loadAuthToken('admin');
    const adminId = loadAuthUserId('admin');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const suffix = Date.now().toString().slice(-8);

    const candidateRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `大纲任务-${suffix}`,
        phone: `138${suffix.slice(0, 8)}`,
        email: `outline-${suffix}@test.local`,
      }),
    });
    expect(candidateRes.status).toBe(201);
    const candidate = (await candidateRes.json()).data as { id: string };

    try {
      const interviewRes = await fetch(`${apiBase}/api/interviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidateId: candidate.id,
          round: '初试',
          type: '视频',
          interviewers: [{ id: adminId, name: '管理员测试' }],
          scheduledAt: new Date(Date.now() + 86400 * 1000).toISOString(),
          duration: 60,
        }),
      });
      expect(interviewRes.status).toBe(201);
      const interview = (await interviewRes.json()).data as { id: string };

      const start = Date.now();
      const createTaskRes = await fetch(`${apiBase}/api/interviews/${interview.id}/question-outline`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ focusType: 'hr' }),
      });
      expect(createTaskRes.status).toBe(202);
      expect(Date.now() - start).toBeLessThan(5000);
      const task = (await createTaskRes.json()).data as { id: string; status: string };
      expect(task.id).toBeTruthy();
      expect(['pending', 'processing']).toContain(task.status);

      const statusRes = await fetch(
        `${apiBase}/api/interviews/${interview.id}/question-outline-generation`,
        { headers },
      );
      expect(statusRes.status).toBe(200);
      const latest = (await statusRes.json()).data as { id: string; status: string } | null;
      expect(latest?.id).toBe(task.id);
      expect(['pending', 'processing', 'succeeded', 'failed']).toContain(latest?.status);
    } finally {
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, { method: 'DELETE', headers });
    }
  });
});
