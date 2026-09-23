import { test, expect } from '@playwright/test';
import { loadAuthToken, loadAuthUserId } from './helpers';

type Role = 'admin' | 'hr' | 'hiring_manager';
type Notification = { businessId?: string; type?: string };

function uniqueFutureTime(): string {
  const offsetMinutes = 2 * 24 * 60 + Math.floor(Math.random() * 30 * 24 * 60);
  return new Date(Date.now() + offsetMinutes * 60000).toISOString();
}

function headers(role: Role) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${loadAuthToken(role)}`,
  };
}

async function createCandidate(apiBase: string, jobIds?: string[]) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const response = await fetch(`${apiBase}/api/candidates`, {
    method: 'POST',
    headers: headers('admin'),
    body: JSON.stringify({
      name: `E2E面试闭环-${suffix}`,
      phone: `138${suffix.padStart(8, '0')}`.slice(0, 11),
      email: `e2e-interview-flow-${suffix}@test.local`,
      jobIds,
    }),
  });
  const body = (await response.json()) as { data?: { id: string } };
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body.data!;
}

async function createInterview(
  apiBase: string,
  candidateId: string,
  interviewers: Array<{ id: string; name: string }>,
  jobId?: string
) {
  const response = await fetch(`${apiBase}/api/interviews`, {
    method: 'POST',
    headers: headers('admin'),
    body: JSON.stringify({
      candidateId,
      jobId,
      round: '初试',
      type: '视频',
      interviewers,
      scheduledAt: uniqueFutureTime(),
      duration: 60,
    }),
  });
  const body = (await response.json()) as { data?: { id: string } };
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body.data!;
}

async function createJob(apiBase: string, hiringManagerId: string) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const response = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: headers('admin'),
    body: JSON.stringify({
      title: `E2E面试闭环岗-${suffix}`,
      departments: ['技术部'],
      level: '中级',
      skills: [],
      location: '上海',
      type: '社招',
      description: 'E2E 测试职位描述',
      requirements: 'E2E 测试职位要求',
      hiringManagerId,
    }),
  });
  const body = (await response.json()) as { data?: { id: string } };
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body.data!;
}

async function waitForNotification(apiBase: string, role: Role, interviewId: string, type: string) {
  await expect
    .poll(
      async () => {
        const response = await fetch(`${apiBase}/api/notifications?pageSize=100`, { headers: headers(role) });
        if (!response.ok) return false;
        const data = (await response.json()).data as Notification[];
        return data.some((item) => item.businessId === interviewId && item.type === type);
      },
      { timeout: 5000 }
    )
    .toBe(true);
}

test.describe('面试协作闭环 API', () => {
  test('改期与移除面试官后，当前及被移除面试官都有通知', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5175';
    const candidate = await createCandidate(apiBase);
    const admin = { id: loadAuthUserId('admin'), name: '管理员测试' };
    const hr = { id: loadAuthUserId('hr'), name: 'HR测试' };
    try {
      const interview = await createInterview(apiBase, candidate.id, [admin, hr]);
      const update = await fetch(`${apiBase}/api/interviews/${interview.id}`, {
        method: 'PATCH',
        headers: headers('admin'),
        body: JSON.stringify({
          interviewers: [admin],
          scheduledAt: uniqueFutureTime(),
        }),
      });
      expect(update.status, await update.text()).toBe(200);

      await waitForNotification(apiBase, 'hr', interview.id, 'interview_updated');
    } finally {
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, { method: 'DELETE', headers: headers('admin') });
    }
  });

  test('候选人申请改期会生成 HR 待办', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5175';
    const candidate = await createCandidate(apiBase);
    try {
      const interview = await createInterview(apiBase, candidate.id, [{ id: loadAuthUserId('admin'), name: '管理员测试' }]);
      const response = await fetch(`${apiBase}/api/interviews/${interview.id}/candidate-response`, {
        method: 'PATCH',
        headers: headers('admin'),
        body: JSON.stringify({ response: 'reschedule_requested', note: '候选人时间冲突' }),
      });
      expect(response.status, await response.text()).toBe(200);
      await waitForNotification(apiBase, 'admin', interview.id, 'candidate_interview_response');
    } finally {
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, { method: 'DELETE', headers: headers('admin') });
    }
  });

  test('全员反馈完成后，用人经理建议与 HR 最终决策可闭环', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5175';
    const job = await createJob(apiBase, loadAuthUserId('hiring_manager'));
    const candidate = await createCandidate(apiBase, [job.id]);
    try {
      const interview = await createInterview(
        apiBase,
        candidate.id,
        [{ id: loadAuthUserId('admin'), name: '管理员测试' }],
        job.id
      );
      const complete = await fetch(`${apiBase}/api/interviews/${interview.id}/complete`, {
        method: 'POST', headers: headers('admin'),
      });
      expect(complete.status, await complete.text()).toBe(200);

      const pending = await fetch(`${apiBase}/api/interview/pending-evaluations`, { headers: headers('admin') });
      const pendingData = (await pending.json()).data as Array<{ id: string; evaluations: Array<{ id: string }> }>;
      const evaluationId = pendingData.find((item) => item.id === interview.id)?.evaluations[0]?.id;
      expect(evaluationId).toBeTruthy();
      const evaluation = await fetch(`${apiBase}/api/evaluations/${evaluationId}`, {
        method: 'PUT', headers: headers('admin'),
        body: JSON.stringify({ dimensions: [{ name: '专业能力', score: 4 }], overallScore: 4, conclusion: 'pass' }),
      });
      expect(evaluation.status, await evaluation.text()).toBe(200);

      const recommendation = await fetch(`${apiBase}/api/hiring/interviews/${interview.id}/recommendation`, {
        method: 'POST',
        headers: headers('hiring_manager'),
        body: JSON.stringify({ recommendation: 'hold', note: '等待 HC 确认' }),
      });
      expect(recommendation.status, await recommendation.text()).toBe(200);

      const decision = await fetch(`${apiBase}/api/interviews/${interview.id}/final-decision`, {
        method: 'POST', headers: headers('admin'), body: JSON.stringify({ decision: 'hold', note: '等待 HC 确认' }),
      });
      const decisionBody = (await decision.json()) as { data?: { finalDecision?: string } };
      expect(decision.status, JSON.stringify(decisionBody)).toBe(200);
      expect(decisionBody.data?.finalDecision).toBe('hold');
    } finally {
      await fetch(`${apiBase}/api/candidates/${candidate.id}`, { method: 'DELETE', headers: headers('admin') });
      await fetch(`${apiBase}/api/jobs/${job.id}/close`, { method: 'POST', headers: headers('admin') });
    }
  });
});
