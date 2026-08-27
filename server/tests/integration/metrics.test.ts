import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32ch';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
});

const mockPrisma = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    candidate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    candidateJob: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    pipelineTemplate: {
      findFirst: vi.fn(),
    },
    stageRecord: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    offer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  };
  mock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return mock;
});

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/redis', () => ({
  redis: {
    del: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    status: 'ready',
    on: vi.fn(),
    connect: vi.fn(),
  },
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn(),
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
  getBullMQConnection: vi.fn(() => ({ host: 'localhost', port: 6379 })),
}));

// 用普通函数而非 vi.fn：beforeEach 的 clearAllMocks 会清掉 mockResolvedValue，
// 导致 createNotification() 返回 undefined，随后 .catch 抛 TypeError
vi.mock('../../src/services/notification.service', () => ({
  createNotification: () => Promise.resolve({}),
  createNotificationForUsers: () => Promise.resolve([]),
}));

vi.mock('../../src/services/email-auto-sender.service', () => ({
  autoSendEmailOnStageTransition: vi.fn(),
}));

import app from '../../src/app';
import {
  candidateStageAdvanceTotal,
  httpRequestTotal,
  register,
} from '../../src/lib/metrics';
import { candidateService } from '../../src/services/candidate.service';

async function counterSum(metric: {
  get: () => Promise<{ values: Array<{ value: number }> }>;
}): Promise<number> {
  const data = await metric.get();
  return data.values.reduce((acc, item) => acc + item.value, 0);
}

describe('Prometheus metrics API', () => {
  const memberUser = {
    id: 'clmember00000000000000001',
    email: 'member@test.com',
    name: '普通成员',
    role: 'member',
    department: null,
    tokenVersion: 0,
    createdAt: new Date(),
  };

  let memberPasswordHash: string;

  beforeAll(async () => {
    memberPasswordHash = await bcrypt.hash('OldPass123', 10);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(mockPrisma)
    );
  });

  it('GET /api/metrics 返回 200，Content-Type 为 text/plain', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('响应体包含 ats_http_requests_total', async () => {
    // 抓取发生在 finish 钩子之前，先发一次请求再 scrape，确保 counter 已写入
    await request(app).get('/api/metrics');
    const res = await request(app).get('/api/metrics');
    expect(res.text).toContain('ats_http_requests_total');
  });

  it('默认 metrics 包含 nodejs_eventloop_lag_seconds', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.text).toContain('nodejs_eventloop_lag_seconds');
  });

  it('触发 POST /api/auth/login 后，相应 metric 增加', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...memberUser,
      password: memberPasswordHash,
    });

    const before = await counterSum(httpRequestTotal);
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'member@test.com',
      password: 'OldPass123',
    });
    expect(loginRes.status).toBe(200);

    const after = await counterSum(httpRequestTotal);
    expect(after).toBeGreaterThan(before);
  });

  it('触发阶段推进后，ats_candidate_stage_advance_total 增加', async () => {
    mockPrisma.candidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      name: '张三',
      createdById: memberUser.id,
      stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: memberUser.id, role: 'member' });
    mockPrisma.candidateJob.findFirst.mockResolvedValue(null);
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.stageRecord.create.mockResolvedValue({});

    const before = await counterSum(candidateStageAdvanceTotal);

    await candidateService.advanceStage(
      'candidate-1',
      { stage: '初筛', status: 'passed' },
      memberUser.id
    );

    const after = await counterSum(candidateStageAdvanceTotal);
    expect(after).toBeGreaterThan(before);

    const body = await register.metrics();
    expect(body).toContain('ats_candidate_stage_advance_total');
  });

  it('10 次 200 与 1 次 500 后，status_code=500 计数为 1', async () => {
    const countByStatus = async (status: string): Promise<number> => {
      const data = await httpRequestTotal.get();
      return data.values
        .filter((item) => item.labels.status_code === status)
        .reduce((acc, item) => acc + item.value, 0);
    };

    const before200 = await countByStatus('200');
    const before500 = await countByStatus('500');

    await Promise.all(Array.from({ length: 10 }, () => request(app).get('/api/metrics')));
    mockPrisma.user.findUnique.mockRejectedValue(new Error('forced-500'));
    const boom = await request(app).post('/api/auth/login').send({
      email: 'member@test.com',
      password: 'OldPass123',
    });
    expect(boom.status).toBe(500);

    expect(await countByStatus('200')).toBe(before200 + 10);
    expect(await countByStatus('500')).toBe(before500 + 1);
  });
});
