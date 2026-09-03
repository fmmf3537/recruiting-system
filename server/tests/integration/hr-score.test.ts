process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32ch';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  hrScoreEvent: { findMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  hrScoreSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
  dictionary: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  candidate: { findMany: vi.fn() },
  stageRecord: { findMany: vi.fn() },
  interviewEvaluation: { findMany: vi.fn() },
  communicationLog: { findMany: vi.fn() },
  operationLog: { findMany: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({ default: mockPrisma }));

vi.mock('../../src/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    HR_SCORE_BUSINESS_WEIGHT: 0.7,
    HR_SCORE_PROCESS_WEIGHT: 0.3,
    HR_SCORE_TALENT_OPS_WEEKLY: 5,
  },
}));

vi.mock('../../src/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
      department: role === 'admin' ? null : '人力资源部',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import hrScoreRoutes from '../../src/routes/hr-score';
import { errorHandler } from '../../src/middleware/errorHandler';

const RULE = {
  id: 'dict-1',
  category: 'hr_score_rule',
  code: 'resume_upload',
  name: '简历上传',
  description: '2',
  enabled: true,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/hr-score', hrScoreRoutes);
  app.use(errorHandler);
  return app;
}

describe('hr-score 接口集成测试（F4-S2）', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    mockPrisma.hrScoreEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        userId: 'user-1',
        ruleCode: 'resume_upload',
        category: 'business',
        points: 2,
        targetType: 'Candidate',
        targetId: 'c-1',
        remark: '简历上传入库',
        bizDate: new Date(),
        createdAt: new Date(),
      },
    ]);
    mockPrisma.hrScoreEvent.count.mockResolvedValue(1);
    mockPrisma.hrScoreSnapshot.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        businessPts: 20,
        processPts: 10,
        totalScore: 17,
        periodStart: new Date(),
      },
      {
        userId: 'user-2',
        businessPts: 40,
        processPts: 8,
        totalScore: 30.4,
        periodStart: new Date(),
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', name: '张三' },
      { id: 'user-2', name: '李四' },
    ]);
    mockPrisma.dictionary.findMany.mockResolvedValue([RULE]);
    mockPrisma.dictionary.findFirst.mockResolvedValue(RULE);
    mockPrisma.dictionary.update.mockResolvedValue({ ...RULE, description: '3' });
  });

  it('GET /api/hr-score/my hr 角色：200，含 events + aggregate', async () => {
    const res = await request(app)
      .get('/api/hr-score/my?period=week&page=1&pageSize=20')
      .set('x-test-role', 'hr');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.aggregate).toMatchObject({
      businessPts: expect.any(Number),
      processPts: expect.any(Number),
      totalScore: expect.any(Number),
    });
    expect(res.body.data.rank).toEqual(expect.any(Number));
  });

  it('GET /api/hr-score/my hiring_manager：403', async () => {
    const res = await request(app)
      .get('/api/hr-score/my')
      .set('x-test-role', 'hiring_manager');
    expect(res.status).toBe(403);
  });

  it('GET /api/hr-score/my interviewer：403', async () => {
    const res = await request(app)
      .get('/api/hr-score/my')
      .set('x-test-role', 'interviewer');
    expect(res.status).toBe(403);
  });

  it('GET /api/hr-score/my?userId=他人 hr 越权：403', async () => {
    const res = await request(app)
      .get('/api/hr-score/my?userId=user-2')
      .set('x-test-role', 'hr');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('无权查看他人积分明细');
  });

  it('GET /api/hr-score/team hr 角色：200，他人仅名次', async () => {
    const res = await request(app)
      .get('/api/hr-score/team?period=week')
      .set('x-test-role', 'hr');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const rows = res.body.data as Array<{
      userId: string;
      isSelf: boolean;
      totalScore: number | null;
      rank: number;
    }>;
    const self = rows.find((r) => r.userId === 'user-1');
    const other = rows.find((r) => r.userId === 'user-2');
    expect(self?.isSelf).toBe(true);
    expect(self?.totalScore).toEqual(expect.any(Number));
    expect(other?.isSelf).toBe(false);
    expect(other?.totalScore).toBeNull();
    expect(other?.rank).toEqual(expect.any(Number));
  });

  it('GET /api/hr-score/team admin 角色：完整分数', async () => {
    const res = await request(app)
      .get('/api/hr-score/team?period=week')
      .set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ totalScore: number | null }>;
    expect(rows.every((r) => r.totalScore !== null)).toBe(true);
  });

  it('GET /api/hr-score/report admin：200', async () => {
    const res = await request(app)
      .get('/api/hr-score/report?period=month')
      .set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      businessTrend: expect.any(Array),
      processTrend: expect.any(Array),
      comparison: expect.any(Object),
      topN: expect.any(Array),
    });
  });

  it('GET /api/hr-score/report hr：403', async () => {
    const res = await request(app)
      .get('/api/hr-score/report?period=month')
      .set('x-test-role', 'hr');
    expect(res.status).toBe(403);
  });

  it('GET /api/hr-score/export admin：200，Content-Type text/csv', async () => {
    const res = await request(app)
      .get('/api/hr-score/export?period=month')
      .set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('userId');
    expect(res.text).toContain('totalScore');
  });

  it('GET /api/hr-score/export hr：403', async () => {
    const res = await request(app)
      .get('/api/hr-score/export?period=month')
      .set('x-test-role', 'hr');
    expect(res.status).toBe(403);
  });

  it('PATCH /api/hr-score/rules/:code admin：200，字典更新', async () => {
    const res = await request(app)
      .patch('/api/hr-score/rules/resume_upload')
      .set('x-test-role', 'admin')
      .send({ description: '3', enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.dictionary.update).toHaveBeenCalledTimes(1);
  });

  it('PATCH /api/hr-score/rules/:code hr：403', async () => {
    const res = await request(app)
      .patch('/api/hr-score/rules/resume_upload')
      .set('x-test-role', 'hr')
      .send({ description: '3' });
    expect(res.status).toBe(403);
  });
});
