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

vi.mock('../../src/services/notification.service', () => ({
  createNotification: vi.fn(async () => undefined),
  createNotificationForUsers: vi.fn(async () => undefined),
}));

// Mock Prisma（HCRequest 在 prisma 是 hCRequest，驼峰）
vi.mock('../../src/lib/prisma', () => ({
  default: {
    hCRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    job: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  },
}));

import hcRequestRoutes from '../../src/routes/hc-requests';
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

/** 模拟 auth 中间件的 findUnique */
function mockAuthUser(user: {
  id: string;
  role: 'admin' | 'hr' | 'hiring_manager';
}): void {
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

describe('HC 编制申请工作流（E2E-P4）', () => {
  let app: express.Application;

  const validHCData = {
    title: '高级前端工程师',
    department: '研发部',
    level: 'P6',
    headcount: 2,
    urgency: 'urgent',
    reason: 'new',
  };

  const draftHCRecord = {
    id: 'clhc000000000000000001',
    title: validHCData.title,
    department: validHCData.department,
    level: validHCData.level,
    headcount: validHCData.headcount,
    filledCount: 0,
    urgency: validHCData.urgency,
    reason: validHCData.reason,
    status: 'draft',
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    requesterId: HR_ID,
    approverId: null,
    approveNote: null,
    createdJobId: null,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/hc-requests', hcRequestRoutes);
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it('admin 创建 HC（draft）→ 201', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.hCRequest.create).mockResolvedValueOnce({
      ...draftHCRecord,
      requesterId: ADMIN_ID,
    } as never);

    const res = await request(app)
      .post('/api/hc-requests')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send(validHCData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.status).toBe('draft');
  });

  it('hr 创建 HC → 201', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    vi.mocked(prisma.hCRequest.create).mockResolvedValueOnce(draftHCRecord as never);

    const res = await request(app)
      .post('/api/hc-requests')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send(validHCData);

    expect(res.status).toBe(201);
    expect(res.body.data.requesterId).toBe(HR_ID);
  });

  it('title 少于 2 字 → 400', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .post('/api/hc-requests')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({ ...validHCData, title: 'X' });

    expect(res.status).toBe(400);
    expect(prisma.hCRequest.create).not.toHaveBeenCalled();
  });

  it('urgency 非法值 → 400', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .post('/api/hc-requests')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({ ...validHCData, urgency: 'super-urgent' });

    expect(res.status).toBe(400);
    expect(prisma.hCRequest.create).not.toHaveBeenCalled();
  });

  it('未登录创建 → 401', async () => {
    const res = await request(app).post('/api/hc-requests').send(validHCData);

    expect(res.status).toBe(401);
    expect(prisma.hCRequest.create).not.toHaveBeenCalled();
  });

  it('hr 提交 draft → submitted + 200', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce(draftHCRecord as never);
    vi.mocked(prisma.hCRequest.update).mockResolvedValueOnce({
      ...draftHCRecord,
      status: 'submitted',
      submittedAt: new Date(),
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: ADMIN_ID },
      { id: 'admin2' },
    ] as never);

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/submit`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('已提交');
  });

  it('提交非 draft 申请 → 400', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce({
      ...draftHCRecord,
      status: 'submitted',
    } as never);

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/submit`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(400);
  });

  it('非申请人 submit → 403', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    // HC 由 HR 创建，但 admin 试图提交
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce(draftHCRecord as never);

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/submit`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(403);
  });

  it('admin approve submitted → 200 + status=approved', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    const submittedHC = { ...draftHCRecord, status: 'submitted', submittedAt: new Date() };
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce(submittedHC as never);
    vi.mocked(prisma.hCRequest.update).mockResolvedValueOnce({
      ...submittedHC,
      status: 'approved',
      approverId: ADMIN_ID,
      approvedAt: new Date(),
    } as never);

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/approve`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ note: '同意' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('非 admin approve → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/approve`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({});

    expect(res.status).toBe(403);
    expect(prisma.hCRequest.update).not.toHaveBeenCalled();
  });

  it('admin reject 空 note → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/reject`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ note: '' });

    expect(res.status).toBe(400);
    expect(prisma.hCRequest.update).not.toHaveBeenCalled();
  });

  it('admin reject submitted → 200 + status=rejected', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    const submittedHC = { ...draftHCRecord, status: 'submitted', submittedAt: new Date() };
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce(submittedHC as never);
    vi.mocked(prisma.hCRequest.update).mockResolvedValueOnce({
      ...submittedHC,
      status: 'rejected',
      approverId: ADMIN_ID,
      rejectedAt: new Date(),
      approveNote: 'HC 不合理',
    } as never);

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/reject`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ note: 'HC 不合理' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
  });

  it('非 admin reject → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/reject`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({ note: '测试驳回' });

    expect(res.status).toBe(403);
  });

  it('delete draft（申请人）→ 200', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce(draftHCRecord as never);
    vi.mocked(prisma.hCRequest.delete).mockResolvedValueOnce(draftHCRecord as never);

    const res = await request(app)
      .delete(`/api/hc-requests/${draftHCRecord.id}`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(200);
  });

  it('delete submitted（申请人）→ 400', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce({
      ...draftHCRecord,
      status: 'submitted',
    } as never);

    const res = await request(app)
      .delete(`/api/hc-requests/${draftHCRecord.id}`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(400);
    expect(prisma.hCRequest.delete).not.toHaveBeenCalled();
  });

  it('admin create-job from approved → 200 + 关联 jobId', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    const approvedHC = {
      ...draftHCRecord,
      status: 'approved',
      approverId: ADMIN_ID,
      approvedAt: new Date(),
    };
    vi.mocked(prisma.hCRequest.findUnique).mockResolvedValueOnce(approvedHC as never);
    vi.mocked(prisma.job.create).mockResolvedValueOnce({
      id: 'cljob00000000000000001',
      title: approvedHC.title,
    } as never);
    vi.mocked(prisma.hCRequest.update).mockResolvedValueOnce({
      ...approvedHC,
      createdJobId: 'cljob00000000000000001',
      status: 'fulfilled',
    } as never);

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/create-job`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(prisma.job.create).toHaveBeenCalled();
    expect(prisma.hCRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdJobId: 'cljob00000000000000001' }),
      })
    );
  });

  it('非 admin create-job → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .post(`/api/hc-requests/${draftHCRecord.id}/create-job`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(403);
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});
