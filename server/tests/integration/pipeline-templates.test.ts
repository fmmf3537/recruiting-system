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
    pipelineTemplate: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    candidateJob: {
      findFirst: vi.fn(),
    },
    user: {
      // auth 中间件用
      findUnique: vi.fn(),
    },
  },
}));

import pipelineTemplateRoutes from '../../src/routes/pipeline-templates';
import { errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

const TEST_SECRET = 'test-secret-key-for-testing-only-32ch';
const ADMIN_ID = 'cladmin000000000000000001';
const HR_ID = 'clhr00000000000000000001';

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

describe('流程模板 CRUD（E2E-P5）', () => {
  let app: express.Application;

  const sevenStages = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'];

  const sampleTemplate = {
    id: 'clpt000000000000000001',
    name: '标准社招',
    type: '社招',
    stages: sevenStages,
    enabled: true,
    isDefault: true,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/pipeline-templates', pipelineTemplateRoutes);
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it('admin 列表 → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.findMany).mockResolvedValueOnce([
      sampleTemplate,
    ] as never);

    const res = await request(app)
      .get('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('hr 列表 → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .get('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(403);
    expect(prisma.pipelineTemplate.findMany).not.toHaveBeenCalled();
  });

  it('hr 调 stages（无 candidateId）→ 200 + 默认模板阶段', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    vi.mocked(prisma.pipelineTemplate.findFirst).mockResolvedValueOnce(
      sampleTemplate as never
    );

    const res = await request(app)
      .get('/api/pipeline-templates/stages')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(sevenStages);
  });

  it('admin 新建（含 stages）→ 201', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.create).mockResolvedValueOnce(sampleTemplate as never);

    const res = await request(app)
      .post('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        name: '标准社招',
        type: '社招',
        stages: sevenStages,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.message).toBe('模板创建成功');
  });

  it('stages 空数组 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });

    const res = await request(app)
      .post('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        name: '空模板',
        type: '校招',
        stages: [],
      });

    expect(res.status).toBe(400);
    expect(prisma.pipelineTemplate.create).not.toHaveBeenCalled();
  });

  it('name 为空 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });

    const res = await request(app)
      .post('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        name: '',
        type: '校招',
        stages: sevenStages,
      });

    expect(res.status).toBe(400);
    expect(prisma.pipelineTemplate.create).not.toHaveBeenCalled();
  });

  it('新建时设 isDefault=true → updateMany 清除同 type 默认', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.pipelineTemplate.create).mockResolvedValueOnce({
      ...sampleTemplate,
      id: 'clpt000000000000000002',
    } as never);

    const res = await request(app)
      .post('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({
        name: '校招新默认',
        type: '校招',
        stages: sevenStages,
        isDefault: true,
      });

    expect(res.status).toBe(201);
    expect(prisma.pipelineTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: '校招', isDefault: true }),
        data: expect.objectContaining({ isDefault: false }),
      })
    );
  });

  it('非 admin 新建 → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .post('/api/pipeline-templates')
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({
        name: 'HR 越权测试',
        type: '社招',
        stages: sevenStages,
      });

    expect(res.status).toBe(403);
    expect(prisma.pipelineTemplate.create).not.toHaveBeenCalled();
  });

  it('admin 更新 enabled → 200', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.findUnique).mockResolvedValueOnce(sampleTemplate as never);
    vi.mocked(prisma.pipelineTemplate.update).mockResolvedValueOnce({
      ...sampleTemplate,
      enabled: false,
    } as never);

    const res = await request(app)
      .patch(`/api/pipeline-templates/${sampleTemplate.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
    expect(res.body.message).toBe('模板更新成功');
  });

  it('非 admin 更新 → 403', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });

    const res = await request(app)
      .patch(`/api/pipeline-templates/${sampleTemplate.id}`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`)
      .send({ enabled: false });

    expect(res.status).toBe(403);
    expect(prisma.pipelineTemplate.update).not.toHaveBeenCalled();
  });

  it('更新不存在的模板 → 404', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.findUnique).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/pipeline-templates/cl99999999999999999999')
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ enabled: false });

    expect(res.status).toBe(404);
    expect(prisma.pipelineTemplate.update).not.toHaveBeenCalled();
  });

  it('更新时设 isDefault=true → 清除同 type 其它默认', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.findUnique).mockResolvedValueOnce(sampleTemplate as never);
    vi.mocked(prisma.pipelineTemplate.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.pipelineTemplate.update).mockResolvedValueOnce({
      ...sampleTemplate,
      name: '更新后默认',
    } as never);

    const res = await request(app)
      .patch(`/api/pipeline-templates/${sampleTemplate.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ name: '更新后默认', isDefault: true });

    expect(res.status).toBe(200);
    expect(prisma.pipelineTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: '社招',
          isDefault: true,
          id: expect.objectContaining({ not: sampleTemplate.id }),
        }),
      })
    );
  });

  it('更新 stages 为空 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, role: 'admin' });
    vi.mocked(prisma.pipelineTemplate.findUnique).mockResolvedValueOnce(sampleTemplate as never);

    const res = await request(app)
      .patch(`/api/pipeline-templates/${sampleTemplate.id}`)
      .set('Authorization', `Bearer ${signToken(ADMIN_ID, 'admin')}`)
      .send({ stages: [] });

    expect(res.status).toBe(400);
    expect(prisma.pipelineTemplate.update).not.toHaveBeenCalled();
  });

  it('stages 路径带 candidateId → 200 + 走候选人阶段解析', async () => {
    mockAuthUser({ id: HR_ID, role: 'hr' });
    const candidateId = 'clcand00000000000000001';
    // 候选人 → 职位 → 模板（指定 enabled）
    vi.mocked(prisma.candidateJob.findFirst).mockResolvedValueOnce({
      job: {
        type: '社招',
        pipelineTemplate: {
          enabled: true,
          stages: ['笔试', '一面', '二面', 'Offer'],
        },
      },
    } as never);

    const res = await request(app)
      .get(`/api/pipeline-templates/stages?candidateId=${candidateId}`)
      .set('Authorization', `Bearer ${signToken(HR_ID, 'hr')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['笔试', '一面', '二面', 'Offer']);
  });
});
