import { test, expect } from '@playwright/test';
import { loadAuthToken, loadAuthUserId } from './helpers';

/**
 * E2E-INTV-EDIT 面试修改 / 取消 API 回归
 *
 * 保护 PATCH /api/interviews/:id + POST /api/interviews/:id/cancel
 * 的权限矩阵、字段持久化与面试官时间冲突链路。
 *
 * Playwright request / fetch 不会带 project storageState，
 * 显式从 .auth/<role>.json 读 token；因此 admin/hr project 跑同一文件都应通过。
 */

type AuthRole = 'admin' | 'hr' | 'hiring_manager' | 'interviewer';

function loadToken(role: AuthRole): string {
  return loadAuthToken(role);
}

function loadUserId(role: AuthRole): string {
  return loadAuthUserId(role);
}

function apiHeaders(role: AuthRole): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${loadToken(role)}`,
  };
}

/** 本地明天/后天的墙钟时间，避免写死日期 */
function localAt(daysFromToday: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function createCandidate(
  apiBase: string,
  headers: Record<string, string>,
  suffix: string
): Promise<{ id: string; name: string }> {
  const name = `E2E改面-${suffix}`;
  const res = await fetch(`${apiBase}/api/candidates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      phone: `138${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11),
      email: `e2e-intv-edit-${suffix}@test.local`,
    }),
  });
  test.skip(res.status !== 201, '候选人创建失败（e2e 环境可能异常），跳过');
  const json = (await res.json()) as { data: { id: string } };
  expect(json.data.id).toBeTruthy();
  return { id: json.data.id, name };
}

async function createScheduledInterview(
  apiBase: string,
  headers: Record<string, string>,
  opts: {
    candidateId: string;
    interviewerIds: string[];
    scheduledAt: Date;
    duration?: number;
    location?: string;
  }
): Promise<{ id: string; scheduledAt: string; location: string | null; interviewers: Array<{ id: string }> }> {
  const interviewers = opts.interviewerIds.map((id) => ({ id, name: 'E2E面试官' }));
  const res = await fetch(`${apiBase}/api/interviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      candidateId: opts.candidateId,
      round: '初试',
      type: '视频',
      interviewers,
      scheduledAt: opts.scheduledAt.toISOString(),
      duration: opts.duration ?? 60,
      location: opts.location,
    }),
  });
  const raw = await res.text();
  expect(res.status, raw).toBe(201);
  return (JSON.parse(raw) as { data: {
    id: string;
    scheduledAt: string;
    location: string | null;
    interviewers: Array<{ id: string }>;
  } }).data;
}

/** 先取消仍 scheduled 的面试（容错 400/404），再软删候选人 */
async function cleanupCandidate(
  apiBase: string,
  headers: Record<string, string>,
  candidateId: string | undefined
): Promise<void> {
  if (!candidateId) return;
  try {
    const listRes = await fetch(
      `${apiBase}/api/interviews?candidateId=${candidateId}&pageSize=50`,
      { headers }
    );
    const listJson = (await listRes.json()) as { data?: Array<{ id: string; status: string }> };
    for (const it of listJson.data || []) {
      if (it.status !== 'scheduled') continue;
      const cancelRes = await fetch(`${apiBase}/api/interviews/${it.id}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'E2E cleanup' }),
      });
      if (cancelRes.status !== 200 && cancelRes.status !== 400 && cancelRes.status !== 404) {
        // 清理失败不阻断 finally
      }
    }
  } catch {
    /* 列表失败仍尝试删候选人 */
  }
  await fetch(`${apiBase}/api/candidates/${candidateId}`, {
    method: 'DELETE',
    headers,
  }).catch(() => {});
}

test.describe('面试修改/取消 API', () => {
  test('admin 创建后 hr 可 PATCH 持久化并 cancel', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    const adminHeaders = apiHeaders('admin');
    const hrHeaders = apiHeaders('hr');
    const suffix = Date.now().toString().slice(-8);
    let candidateId: string | undefined;

    try {
      // 候选人由 hr 创建，保证 hr 可见；面试由 admin 创建（admin 可见全部）
      const candidate = await createCandidate(apiBase, hrHeaders, suffix);
      candidateId = candidate.id;

      const interview = await createScheduledInterview(apiBase, adminHeaders, {
        candidateId,
        interviewerIds: [loadUserId('admin')],
        scheduledAt: localAt(1, 10, 0),
        location: 'E2E-原地点',
      });

      const nextAt = new Date(new Date(interview.scheduledAt).getTime() + 86400 * 1000);
      const patchRes = await fetch(`${apiBase}/api/interviews/${interview.id}`, {
        method: 'PATCH',
        headers: hrHeaders,
        body: JSON.stringify({
          scheduledAt: nextAt.toISOString(),
          location: 'E2E-新地点',
        }),
      });
      expect(patchRes.status, await patchRes.text()).toBe(200);

      const detailRes = await fetch(`${apiBase}/api/interviews/${interview.id}`, {
        headers: hrHeaders,
      });
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()).data as {
        scheduledAt: string;
        location: string | null;
        interviewers: Array<{ id: string }>;
        status: string;
      };
      expect(detail.location).toBe('E2E-新地点');
      expect(
        Math.abs(new Date(detail.scheduledAt).getTime() - nextAt.getTime())
      ).toBeLessThan(2000);
      expect(detail.interviewers.map((i) => i.id)).toContain(loadUserId('admin'));

      const cancelRes = await fetch(`${apiBase}/api/interviews/${interview.id}/cancel`, {
        method: 'POST',
        headers: hrHeaders,
        body: JSON.stringify({ reason: 'E2E hr 取消' }),
      });
      expect(cancelRes.status, await cancelRes.text()).toBe(200);

      const afterCancel = await fetch(`${apiBase}/api/interviews/${interview.id}`, {
        headers: hrHeaders,
      });
      expect(afterCancel.status).toBe(200);
      expect(((await afterCancel.json()).data as { status: string }).status).toBe('cancelled');
    } finally {
      await cleanupCandidate(apiBase, adminHeaders, candidateId);
    }
  });

  test('interviewer PATCH 与 hiring_manager cancel 均 403', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    const adminHeaders = apiHeaders('admin');
    const suffix = `${Date.now().toString().slice(-8)}b`;
    let candidateId: string | undefined;

    try {
      const candidate = await createCandidate(apiBase, adminHeaders, suffix);
      candidateId = candidate.id;
      const interview = await createScheduledInterview(apiBase, adminHeaders, {
        candidateId,
        interviewerIds: [loadUserId('admin')],
        scheduledAt: localAt(1, 14, 0),
      });

      const patchRes = await fetch(`${apiBase}/api/interviews/${interview.id}`, {
        method: 'PATCH',
        headers: apiHeaders('interviewer'),
        body: JSON.stringify({ location: '无权修改' }),
      });
      expect(patchRes.status).toBe(403);

      const cancelRes = await fetch(`${apiBase}/api/interviews/${interview.id}/cancel`, {
        method: 'POST',
        headers: apiHeaders('hiring_manager'),
        body: JSON.stringify({ reason: '无权取消' }),
      });
      expect(cancelRes.status).toBe(403);
    } finally {
      await cleanupCandidate(apiBase, adminHeaders, candidateId);
    }
  });

  test('同面试官时间重叠 PATCH 409，错开后 200', async ({ baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    const adminHeaders = apiHeaders('admin');
    const i1 = loadUserId('admin');
    const suffix = `${Date.now().toString().slice(-8)}c`;
    let candidateId: string | undefined;

    try {
      const candidate = await createCandidate(apiBase, adminHeaders, suffix);
      candidateId = candidate.id;

      await createScheduledInterview(apiBase, adminHeaders, {
        candidateId,
        interviewerIds: [i1],
        scheduledAt: localAt(1, 10, 0),
        duration: 60,
        location: '面试A',
      });

      const interviewB = await createScheduledInterview(apiBase, adminHeaders, {
        candidateId,
        interviewerIds: [i1],
        scheduledAt: localAt(1, 12, 0),
        duration: 60,
        location: '面试B',
      });

      const overlapRes = await fetch(`${apiBase}/api/interviews/${interviewB.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ scheduledAt: localAt(1, 10, 30).toISOString() }),
      });
      expect(overlapRes.status, await overlapRes.text()).toBe(409);

      const clearRes = await fetch(`${apiBase}/api/interviews/${interviewB.id}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ scheduledAt: localAt(1, 13, 0).toISOString() }),
      });
      expect(clearRes.status, await clearRes.text()).toBe(200);
    } finally {
      await cleanupCandidate(apiBase, adminHeaders, candidateId);
    }
  });
});
