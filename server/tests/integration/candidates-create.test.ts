import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// 在模块加载前设置测试环境变量
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32ch';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
});

const { cacheStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return { cacheStore: store };
});

vi.mock('../../src/lib/redis', () => ({
  redis: { del: vi.fn(async () => 1) },
  getFromCache: vi.fn(async (key: string) => {
    const raw = cacheStore.get(key);
    return raw ? JSON.parse(raw) : null;
  }),
  setCache: vi.fn(async (key: string, value: unknown) => {
    cacheStore.set(key, JSON.stringify(value));
  }),
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
}));

// Mock Prisma（不依赖真实数据库）
vi.mock('../../src/lib/prisma', () => ({
  default: {
    candidate: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    candidateJob: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    candidateTag: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    stageRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    workHistory: {
      createMany: vi.fn(),
    },
    user: {
      // 给 RBAC 矩阵（如果中间件查 user）用
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (fn) => fn({
      candidate: { update: vi.fn() },
      stageRecord: { update: vi.fn(), count: vi.fn() },
    })),
  },
}));

import candidatesRoutes from '../../src/routes/candidates';
import { errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

const TEST_SECRET = 'test-secret-key-for-testing-only-32ch';
const ADMIN_ID = 'cladmin000000000000000001';
const HR_ID = 'clhr00000000000000000001';
const HM_ID = 'clhm0000000000000000000001';

function signToken(userId: string, role: 'admin' | 'hr' | 'hiring_manager'): string {
  return jwt.sign(
    {
      userId,
      email: `${role}@test.com`,
      role,
      department: null,
      tokenVersion: 0,
    },
    TEST_SECRET,
    { expiresIn: '1h' }
  );
}

/** 模拟 auth 中间件的 findUnique：按 userId 返回用户，其它查询返 null（无重复）。 */
function mockAuthUser(user: {
  id: string;
  email: string;
  role: 'admin' | 'hr' | 'hiring_manager';
}): void {
  vi.mocked(prisma.user.findUnique).mockImplementation(async (args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = (args as any)?.where;
    if (where?.id === user.id) {
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        department: null,
        tokenVersion: 0,
      } as never;
    }
    return null;
  });
}

describe('POST /api/candidates 创建候选人（E2E-P3）', () => {
  let app: express.Application;

  const validCandidateData = {
    name: '张三',
    phone: '13800138000',
    email: 'zhangsan@test.local',
    education: '本科',
    school: '某大学',
  };

  const createdCandidateRecord = {
    id: 'clcand00000000000000001',
    name: validCandidateData.name,
    phone: validCandidateData.phone,
    email: validCandidateData.email,
    education: validCandidateData.education,
    school: validCandidateData.school,
    source: 'manual',
    sourceNote: null,
    consentAt: null,
    consentNote: null,
    anonymizedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/candidates', candidatesRoutes);
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it('admin 创建候选人（带姓名+手机）→ 201', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    // 查重：无重复（phone + email 各一次），用永久默认 mock
    vi.mocked(prisma.candidate.findFirst).mockResolvedValue(null as never);
    // 创建：返回预设对象
    vi.mocked(prisma.candidate.create).mockImplementation(
      async () => createdCandidateRecord as never
    );

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send(validCandidateData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.name).toBe(validCandidateData.name);
    expect(res.body.data.phone).toBe(validCandidateData.phone);
  });

  it('hr 创建候选人 → 201（RBAC 通过）', async () => {
    mockAuthUser({ id: HR_ID, email: 'hr@test.com', role: 'hr' });
    vi.mocked(prisma.candidate.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.candidate.create).mockImplementation(
      async () => createdCandidateRecord as never
    );

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send(validCandidateData);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
  });

  it('hiring_manager 创建 → 403（RBAC 拒）', async () => {
    mockAuthUser({ id: HM_ID, email: 'hiring_manager@test.com', role: 'hiring_manager' });

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(HM_ID, 'hiring_manager')}`)
      .send(validCandidateData);

    expect(res.status).toBe(403);
    expect(prisma.candidate.create).not.toHaveBeenCalled();
  });

  it('未登录创建 → 401', async () => {
    const res = await request(app).post('/api/candidates').send(validCandidateData);

    expect(res.status).toBe(401);
    expect(prisma.candidate.findFirst).not.toHaveBeenCalled();
    expect(prisma.candidate.create).not.toHaveBeenCalled();
  });

  it('重复手机号 → 201 + warning', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    // 查重：返回已存在的候选人（带 stageRecords 数组）
    const existingWithPhone = {
      id: 'existing-candidate',
      name: '已存在',
      phone: validCandidateData.phone,
      email: null,
      deletedAt: null,
      stageRecords: [{ stage: '入库', status: 'passed' }],
      createdAt: new Date(),
    };
    // 第一次按 phone 查：返回已存在；第二次按 email 查：返回 null
    vi.mocked(prisma.candidate.findFirst)
      .mockResolvedValueOnce(existingWithPhone as never)
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send(validCandidateData);

    // 当前实现：检测到重复仍创建（201 + warning + duplicates 数组）
    expect(res.status).toBe(201);
    expect(res.body.warning).toBe('发现重复候选人');
    expect(res.body.duplicates).toBeTruthy();
  });

  it('重复邮箱 → 201 + warning', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    const existingWithEmail = {
      id: 'existing-candidate',
      name: '已存在',
      phone: null,
      email: validCandidateData.email,
      deletedAt: null,
      stageRecords: [{ stage: '入库', status: 'passed' }],
      createdAt: new Date(),
    };
    // 第一次按 phone 查：null；第二次按 email 查：返回已存在
    vi.mocked(prisma.candidate.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingWithEmail as never);

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ ...validCandidateData, phone: '13900139000' }); // 不同手机号，但邮箱重复

    expect(res.status).toBe(201);
    expect(res.body.warning).toBe('发现重复候选人');
    expect(res.body.duplicates).toBeTruthy();
  });

  it('phone 超过 20 位 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        ...validCandidateData,
        phone: '1'.repeat(30), // 超过 schema max(20)
      });

    expect(res.status).toBe(400);
    expect(prisma.candidate.create).not.toHaveBeenCalled();
  });

  it('email 格式非法 → 当前 schema passthrough 允许（待补强）', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    // 查重返回 null（passthrough 让非法 email 进入 service）
    vi.mocked(prisma.candidate.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.candidate.create).mockImplementation(
      async () => ({ ...createdCandidateRecord, email: 'not-a-valid-email' }) as never
    );

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        ...validCandidateData,
        email: 'not-a-valid-email',
      });

    // 当前实现：schema 全 optional + passthrough，非法 email 也能通过
    // 这是已知弱点（与 PRD 一致），断言当前行为是 201
    expect(res.status).toBe(201);
  });

  it('name 超过 50 位 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        ...validCandidateData,
        name: '张'.repeat(60), // 超过 schema max(50)
      });

    expect(res.status).toBe(400);
    expect(prisma.candidate.create).not.toHaveBeenCalled();
  });
});
