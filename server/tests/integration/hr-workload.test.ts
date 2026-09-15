import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  candidate: { groupBy: vi.fn(), findMany: vi.fn() },
  communicationLog: { groupBy: vi.fn(), findMany: vi.fn() },
  interview: { groupBy: vi.fn(), findMany: vi.fn() },
  stageRecord: { groupBy: vi.fn() },
  operationLog: { groupBy: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  offer: { findMany: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({ default: mockPrisma }));

vi.mock('../../src/lib/redis', () => ({
  redis: { disconnect: vi.fn(), get: vi.fn(), setex: vi.fn() },
  getBullMQConnection: () => ({ host: 'localhost', port: 6379 }),
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn(),
  clearListCache: vi.fn(),
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
      userId: 'user-admin',
      email: 'admin@test.com',
      role,
      department: role === 'admin' ? null : '人力部',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import hrWorkloadRoutes from '../../src/routes/hr-workload';
import { errorHandler } from '../../src/middleware/errorHandler';

const HR_ID = 'clhruser00000000000000001';
const QUERY = { period: 'week', date: '2026-09-16' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/hr-workload', hrWorkloadRoutes);
  app.use(errorHandler);
  return app;
}

function stubEmptyMetrics() {
  mockPrisma.user.findMany.mockResolvedValue([
    { id: HR_ID, name: 'HR甲', department: '人力部' },
  ]);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: HR_ID,
    name: 'HR甲',
    department: '人力部',
    role: 'hr',
  });
  mockPrisma.candidate.groupBy.mockResolvedValue([]);
  mockPrisma.candidate.findMany.mockResolvedValue([]);
  mockPrisma.communicationLog.groupBy.mockResolvedValue([]);
  mockPrisma.communicationLog.findMany.mockResolvedValue([]);
  mockPrisma.interview.groupBy.mockResolvedValue([]);
  mockPrisma.interview.findMany.mockResolvedValue([]);
  mockPrisma.stageRecord.groupBy.mockResolvedValue([]);
  mockPrisma.operationLog.groupBy.mockResolvedValue([]);
  mockPrisma.operationLog.findMany.mockResolvedValue([]);
  mockPrisma.operationLog.create.mockResolvedValue({});
  mockPrisma.offer.findMany.mockResolvedValue([]);
}

describe('HRW-S HR 工作负载接口', () => {
  let app: express.Application;

  beforeEach(() => {
    app = makeApp();
    vi.clearAllMocks();
    stubEmptyMetrics();
  });

  describe('权限', () => {
    it('admin GET overview → 200', async () => {
      const res = await request(app).get('/api/hr-workload/overview').query(QUERY).expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.rows)).toBe(true);
      expect(res.body.data.range.start).toBe('2026-09-14');
      expect(res.body.data.range.end).toBe('2026-09-20');
    });

    it('hr → 403', async () => {
      await request(app)
        .get('/api/hr-workload/overview')
        .query(QUERY)
        .set('x-test-role', 'hr')
        .expect(403);
    });

    it('hiring_manager → 403', async () => {
      await request(app)
        .get('/api/hr-workload/overview')
        .query(QUERY)
        .set('x-test-role', 'hiring_manager')
        .expect(403);
    });

    it('interviewer → 403', async () => {
      await request(app)
        .get('/api/hr-workload/overview')
        .query(QUERY)
        .set('x-test-role', 'interviewer')
        .expect(403);
    });
  });

  describe('详情与导出', () => {
    it('admin GET users/:hrId → 200', async () => {
      const res = await request(app)
        .get(`/api/hr-workload/users/${HR_ID}`)
        .query(QUERY)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.row.hrId).toBe(HR_ID);
      expect(res.body.data.trend).toHaveLength(4);
    });

    it('admin GET export → 200 且写 OperationLog', async () => {
      const res = await request(app).get('/api/hr-workload/export').query(QUERY).expect(200);
      expect(res.headers['content-type']).toMatch(/spreadsheetml/);
      expect(mockPrisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-admin',
            targetType: 'HRWorkload',
            action: 'hr_workload_export',
          }),
        })
      );
    });

    it('hr GET export → 403 且不写日志', async () => {
      await request(app)
        .get('/api/hr-workload/export')
        .query(QUERY)
        .set('x-test-role', 'hr')
        .expect(403);
      expect(mockPrisma.operationLog.create).not.toHaveBeenCalled();
    });
  });
});
