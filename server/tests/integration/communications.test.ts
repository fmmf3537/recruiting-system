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
    communicationLog: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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

import communicationRoutes from '../../src/routes/communications';
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
  vi.mocked(prisma.candidate.count).mockResolvedValue(visible ? 1 : 0);
}

describe('沟通记录 CRUD（E2E-P7）', () => {
  let app: express.Application;

  const sampleLog = {
    id: 'cllog000000000000000001',
    candidateId: CANDIDATE_ID,
    type: '电话',
    content: '沟通内容：候选人考虑中',
    result: '考虑中',
    followUpAt: new Date('2026-09-15T10:00:00Z'),
    createdById: ADMIN_ID,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/communications', communicationRoutes);
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it('admin 创建沟通（含 followUpAt）→ 201', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    mockCandidateExists();
    vi.mocked(prisma.communicationLog.create).mockResolvedValueOnce(sampleLog as never);

    const res = await request(app)
      .post('/api/communications')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        type: '电话',
        content: '沟通内容：候选人考虑中',
        result: '考虑中',
        followUpAt: '2026-09-15T10:00:00Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.type).toBe('电话');
    expect(res.body.message).toBe('沟通记录已添加');
  });

  it('content 为空 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });

    const res = await request(app)
      .post('/api/communications')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        type: '电话',
        content: '',
      });

    expect(res.status).toBe(400);
    expect(prisma.communicationLog.create).not.toHaveBeenCalled();
  });

  it('candidateId 不存在 → 404', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.candidate.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/communications')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        type: '电话',
        content: '沟通内容',
      });

    expect(res.status).toBe(404);
    expect(prisma.communicationLog.create).not.toHaveBeenCalled();
  });

  it('hr 越权访问不可见候选人 → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    mockCandidateExists(false); // visibility = false

    const res = await request(app)
      .post('/api/communications')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({
        candidateId: CANDIDATE_ID,
        type: '电话',
        content: '沟通内容',
      });

    expect(res.status).toBe(403);
    expect(prisma.communicationLog.create).not.toHaveBeenCalled();
  });

  it('未登录 → 401', async () => {
    const res = await request(app).post('/api/communications').send({
      candidateId: CANDIDATE_ID,
      type: '电话',
      content: '沟通内容',
    });

    expect(res.status).toBe(401);
    expect(prisma.communicationLog.create).not.toHaveBeenCalled();
  });

  it('admin 列表沟通 → 200 + 分页', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.communicationLog.findMany).mockResolvedValueOnce([
      sampleLog,
    ] as never);
    vi.mocked(prisma.communicationLog.count).mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/communications?page=1&pageSize=20')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeTruthy();
    expect(res.body.pagination.total).toBe(1);
  });

  it('admin 更新沟通 → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.communicationLog.findUnique).mockResolvedValueOnce(sampleLog as never);
    vi.mocked(prisma.communicationLog.update).mockResolvedValueOnce({
      ...sampleLog,
      content: '更新后的内容',
    } as never);

    const res = await request(app)
      .patch(`/api/communications/${sampleLog.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ content: '更新后的内容' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('更新后的内容');
  });

  it('admin 更新不存在沟通 → 404', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.communicationLog.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/communications/cl99999999999999999999')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ content: '更新内容' });

    expect(res.status).toBe(404);
    expect(prisma.communicationLog.update).not.toHaveBeenCalled();
  });

  it('admin 删除沟通 → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.communicationLog.findUnique).mockResolvedValueOnce(sampleLog as never);
    vi.mocked(prisma.communicationLog.delete).mockResolvedValueOnce(sampleLog as never);

    const res = await request(app)
      .delete(`/api/communications/${sampleLog.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(prisma.communicationLog.delete).toHaveBeenCalled();
  });

  it('admin 删除不存在沟通 → 404', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.communicationLog.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/communications/cl99999999999999999999')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(404);
    expect(prisma.communicationLog.delete).not.toHaveBeenCalled();
  });

  it('admin 调 follow-ups → 200 + 返回有 followUpAt 的记录', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.communicationLog.findMany).mockResolvedValueOnce([
      sampleLog, // followUpAt 非空
    ] as never);

    const res = await request(app)
      .get('/api/communications/follow-ups')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(prisma.communicationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          followUpAt: expect.objectContaining({ not: null }),
        }),
      })
    );
  });

  it('type 非法值 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });

    const res = await request(app)
      .post('/api/communications')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        candidateId: CANDIDATE_ID,
        type: 'invalid-type-xyz',
        content: '沟通内容',
      });

    expect(res.status).toBe(400);
    expect(prisma.communicationLog.create).not.toHaveBeenCalled();
  });
});
