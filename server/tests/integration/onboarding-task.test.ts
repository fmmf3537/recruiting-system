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

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  default: {
    onboardingTask: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
    },
    candidate: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    user: {
      // auth 中间件用
      findUnique: vi.fn(),
    },
  },
}));

import onboardingTaskRoutes from '../../src/routes/onboarding-task';
import { errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

const TEST_SECRET = 'test-secret-key-for-testing-only-32ch';
const ADMIN_ID = 'cladmin000000000000000001';
const HR_ID = 'clhr00000000000000000001';
const CANDIDATE_ID = 'clcand000000000000000001';

function signToken(userId: string, role: 'admin' | 'hr'): string {
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

/** 模拟 auth 中间件的 findUnique */
function mockAuthUser(user: { id: string; role: 'admin' | 'hr' }): void {
  vi.mocked(prisma.user.findUnique).mockImplementation(async (args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = (args as any)?.where;
    if (where?.id === user.id) {
      return {
        id: user.id,
        email: `${user.role}@test.com`,
        role: user.role,
        department: null,
        tokenVersion: 0,
      } as never;
    }
    return null;
  });
}

/** 让候选人存在（admin 路径不查 visibility，hr 路径需要） */
function mockCandidateExists(visible = true): void {
  vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
    id: CANDIDATE_ID,
    name: '张三',
    phone: '13800138000',
    deletedAt: null,
  } as never);
  // visibility 校验用 count
  vi.mocked(prisma.candidate.count).mockResolvedValue(visible ? 1 : 0);
}

describe('入职任务 CRUD（E2E-P6）', () => {
  let app: express.Application;

  const sampleTask = {
    id: 'cltask000000000000000001',
    candidateId: CANDIDATE_ID,
    title: '收集身份证复印件',
    category: '材料收集',
    assigneeId: null,
    dueDate: null,
    note: null,
    status: 'pending',
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/onboarding-tasks', onboardingTaskRoutes);
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it('admin 创建任务 → 201', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    mockCandidateExists();
    vi.mocked(prisma.onboardingTask.create).mockResolvedValueOnce(sampleTask as never);

    const res = await request(app)
      .post('/api/onboarding-tasks')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        title: '收集身份证复印件',
        category: '材料收集',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.title).toBe('收集身份证复印件');
    expect(res.body.message).toBe('任务创建成功');
  });

  it('title 为空 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });

    const res = await request(app)
      .post('/api/onboarding-tasks')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        title: '',
        category: '材料收集',
      });

    expect(res.status).toBe(400);
    expect(prisma.onboardingTask.create).not.toHaveBeenCalled();
  });

  it('candidateId 不存在 → 404', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.candidate.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/onboarding-tasks')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        title: '收材料',
        category: '材料收集',
      });

    expect(res.status).toBe(404);
    expect(prisma.onboardingTask.create).not.toHaveBeenCalled();
  });

  it('hr 越权访问不可见候选人 → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    mockCandidateExists(false); // visibility = false

    const res = await request(app)
      .post('/api/onboarding-tasks')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({
        candidateId: CANDIDATE_ID,
        title: '收材料',
        category: '材料收集',
      });

    expect(res.status).toBe(403);
    expect(prisma.onboardingTask.create).not.toHaveBeenCalled();
  });

  it('未登录 → 401', async () => {
    const res = await request(app).post('/api/onboarding-tasks').send({
      candidateId: CANDIDATE_ID,
      title: '收材料',
      category: '材料收集',
    });

    expect(res.status).toBe(401);
    expect(prisma.onboardingTask.create).not.toHaveBeenCalled();
  });

  it('admin 列表任务 → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    mockCandidateExists();
    vi.mocked(prisma.onboardingTask.findMany).mockResolvedValueOnce([
      sampleTask,
    ] as never);

    const res = await request(app)
      .get(`/api/onboarding-tasks/candidates/${CANDIDATE_ID}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it('admin 更新 status → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.onboardingTask.findUnique).mockResolvedValueOnce(sampleTask as never);
    vi.mocked(prisma.onboardingTask.update).mockResolvedValueOnce({
      ...sampleTask,
      status: 'completed',
    } as never);

    const res = await request(app)
      .patch(`/api/onboarding-tasks/${sampleTask.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.message).toBe('任务更新成功');
  });

  it('admin 更新不存在任务 → 404', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.onboardingTask.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/onboarding-tasks/cl99999999999999999999')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(404);
    expect(prisma.onboardingTask.update).not.toHaveBeenCalled();
  });

  it('admin 删除任务 → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.onboardingTask.findUnique).mockResolvedValueOnce(sampleTask as never);
    vi.mocked(prisma.onboardingTask.delete).mockResolvedValueOnce(sampleTask as never);

    const res = await request(app)
      .delete(`/api/onboarding-tasks/${sampleTask.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('任务删除成功');
  });

  it('admin 批量生成任务 → 200 + 10 个标准任务', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    mockCandidateExists();
    vi.mocked(prisma.onboardingTask.count).mockResolvedValueOnce(0); // 现有 0 个
    vi.mocked(prisma.onboardingTask.createMany).mockResolvedValueOnce({ count: 10 } as never);
    vi.mocked(prisma.onboardingTask.findMany).mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => ({
        id: `cltask00000000000000000${i + 1}`,
        candidateId: CANDIDATE_ID,
        title: `标准任务-${i + 1}`,
        category: '材料收集',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as never
    );

    const res = await request(app)
      .post(`/api/onboarding-tasks/candidates/${CANDIDATE_ID}/generate`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('标准任务已生成');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(10);
    expect(prisma.onboardingTask.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Array),
      })
    );
    // createMany 的 data 应该是 10 个任务
    const callArgs = vi.mocked(prisma.onboardingTask.createMany).mock.calls[0][0];
    expect((callArgs.data as unknown[]).length).toBe(10);
  });

  it('候选人已有任务时批量生成 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    mockCandidateExists();
    vi.mocked(prisma.onboardingTask.count).mockResolvedValueOnce(3); // 已有 3 个

    const res = await request(app)
      .post(`/api/onboarding-tasks/candidates/${CANDIDATE_ID}/generate`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(400);
    expect(prisma.onboardingTask.createMany).not.toHaveBeenCalled();
  });
});
