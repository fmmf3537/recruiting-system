import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import hiringRoutes from '../../src/routes/hiring';
import interviewWorkbenchRoutes from '../../src/routes/interview';
import candidateRoutes from '../../src/routes/candidates';
import { errorHandler } from '../../src/middleware/errorHandler';

// 在模块加载前设置测试环境变量（env.ts 在 import 时即读取校验）
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32ch';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
});

vi.mock('../../src/lib/redis', () => ({
  redis: { del: vi.fn(async () => 1) },
  getFromCache: vi.fn(async () => null),
  setCache: vi.fn(async () => undefined),
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
}));

// Mock Prisma（路由内调用 job/candidateJob/offer/interview 的 count/findMany）
vi.mock('../../src/lib/prisma', () => ({
  default: {
    job: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
    },
    candidateJob: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
    offer: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    interview: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const header = req.headers['x-test-role'];
    const role = typeof header === 'string' ? header : 'admin';
    req.user = {
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department: role === 'admin' ? null : '技术部',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

describe('role 中间件', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/hiring', hiringRoutes);
    app.use('/api/interview', interviewWorkbenchRoutes);
    app.use('/api/candidates', candidateRoutes);
    app.use(errorHandler);
  });

  it('hr 访问 /api/hiring/overview 返回 403', async () => {
    const res = await request(app)
      .get('/api/hiring/overview')
      .set('x-test-role', 'hr')
      .expect(403);
    expect(res.body.error).toContain('无权访问');
  });

  it('hiring_manager 访问 /api/hiring/overview 返回 200', async () => {
    const res = await request(app)
      .get('/api/hiring/overview')
      .set('x-test-role', 'hiring_manager')
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('interviewer 访问 /api/hiring/overview 返回 403', async () => {
    await request(app)
      .get('/api/hiring/overview')
      .set('x-test-role', 'interviewer')
      .expect(403);
  });

  it('interviewer 访问 /api/interview/my 返回 200', async () => {
    const res = await request(app)
      .get('/api/interview/my')
      .set('x-test-role', 'interviewer')
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('hr 访问 /api/interview/my 返回 403（面试官专属）', async () => {
    await request(app)
      .get('/api/interview/my')
      .set('x-test-role', 'hr')
      .expect(403);
  });

  it('admin 访问任何路由都通过', async () => {
    await request(app).get('/api/hiring/overview').expect(200);
    await request(app).get('/api/interview/my').expect(200);
  });

  it('hiring_manager 不能 POST /api/candidates', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set('x-test-role', 'hiring_manager')
      .send({ name: '李四' })
      .expect(403);
    expect(res.body.error).toBe('没有权限：candidate:create');
  });

  it('interviewer 不能 POST /api/candidates', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set('x-test-role', 'interviewer')
      .send({ name: '王五' })
      .expect(403);
    expect(res.body.error).toBe('没有权限：candidate:create');
  });
});
