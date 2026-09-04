import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockSetCache = vi.hoisted(() => vi.fn());
const mockGetFromCache = vi.hoisted(() => vi.fn().mockResolvedValue(null));

const mockPrisma = vi.hoisted(() => ({
  interview: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  candidate: { count: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/llm', () => ({
  callLLM: vi.fn(),
  extractResumeInfo: vi.fn(),
}));

vi.mock('../../src/lib/queue', () => ({
  resumeParseQueue: { add: vi.fn() },
  aiMatchScoreQueue: { add: vi.fn() },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { disconnect: vi.fn() },
  getBullMQConnection: () => ({ host: 'localhost', port: 6379 }),
  getFromCache: mockGetFromCache,
  setCache: mockSetCache,
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers['x-test-role'];
    if (header === 'none') {
      res.status(401).json({ success: false, error: '未提供认证令牌' });
      return;
    }
    const role = typeof header === 'string' ? header : 'admin';
    req.user = {
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department: role === 'admin' ? null : '技术部',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import interviewRoutes from '../../src/routes/interviews';
import { errorHandler } from '../../src/middleware/errorHandler';

const SUBMITTED_AT = new Date('2026-09-01T08:00:00.000Z');

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clhinterview0000000000001',
    round: '初试',
    type: '现场',
    interviewers: [{ id: 'u1', name: '甲' }],
    scheduledAt: new Date('2026-09-10T02:00:00.000Z'),
    duration: 60,
    location: null,
    notes: null,
    status: 'scheduled',
    candidateId: 'clhcandidate0000000000001',
    candidate: { id: 'clhcandidate0000000000001', name: '张三' },
    jobId: null,
    job: null,
    createdById: 'user-1',
    createdBy: { id: 'user-1', name: 'HR' },
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    evaluations: [] as Array<{ conclusion: string | null; submittedAt: Date }>,
    ...overrides,
  };
}

describe('INTV-S2 面试列表 round 筛选 + evaluations', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/interviews', interviewRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();
    mockGetFromCache.mockResolvedValue(null);
    mockSetCache.mockResolvedValue(undefined);

    mockPrisma.interview.findMany.mockResolvedValue([listRow()]);
    mockPrisma.interview.count.mockResolvedValue(1);
  });

  it('GET /api/interviews?round=初试 → findMany where 含 round', async () => {
    await request(app).get('/api/interviews').query({ round: '初试' }).expect(200);

    expect(mockPrisma.interview.findMany).toHaveBeenCalled();
    const args = mockPrisma.interview.findMany.mock.calls[0][0] as {
      where: { round?: string };
    };
    expect(args.where.round).toBe('初试');
  });

  it('不同 round 返回过滤结果', async () => {
    mockPrisma.interview.findMany.mockImplementation(async (args: { where?: { round?: string } }) => {
      const round = args.where?.round;
      const rows = [
        listRow({ id: 'clhinterview0000000000001', round: '初试' }),
        listRow({ id: 'clhinterview0000000000002', round: '复试' }),
      ];
      return round ? rows.filter((r) => r.round === round) : rows;
    });
    mockPrisma.interview.count.mockResolvedValue(1);

    const res = await request(app).get('/api/interviews').query({ round: '复试' }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].round).toBe('复试');
  });

  it('findMany include.evaluations 含 submittedAt not null + take:1', async () => {
    await request(app).get('/api/interviews').expect(200);

    const args = mockPrisma.interview.findMany.mock.calls[0][0] as {
      include: { evaluations?: { where?: unknown; take?: number; orderBy?: unknown } };
    };
    expect(args.include.evaluations).toMatchObject({
      where: { submittedAt: { not: null } },
      take: 1,
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('返回项带 evaluations 数组', async () => {
    const res = await request(app).get('/api/interviews').expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data[0].evaluations)).toBe(true);
  });

  it('无 round 参数时 where 不含 round', async () => {
    await request(app).get('/api/interviews').expect(200);

    const args = mockPrisma.interview.findMany.mock.calls[0][0] as {
      where: { round?: string };
    };
    expect(args.where.round).toBeUndefined();
  });

  it('已提交评估的 conclusion 透传到 evaluations[0]', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([
      listRow({
        evaluations: [{ conclusion: 'pass', submittedAt: SUBMITTED_AT }],
      }),
    ]);

    const res = await request(app).get('/api/interviews').expect(200);
    expect(res.body.data[0].evaluations[0].conclusion).toBe('pass');
    expect(res.body.data[0].evaluations[0].submittedAt).toBe(SUBMITTED_AT.toISOString());
  });

  it('不同 round 写入不同 cache key', async () => {
    await request(app).get('/api/interviews').query({ round: '初试' }).expect(200);
    await request(app).get('/api/interviews').query({ round: '复试' }).expect(200);

    const keys = mockSetCache.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toContain('初试');
    expect(keys[1]).toContain('复试');
  });
});
