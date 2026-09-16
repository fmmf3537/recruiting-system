import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// 在模块加载前设置测试环境变量（env.ts 在 import 时即读取校验）
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32ch';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
});

const { cacheStore, clearListCacheFn } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cacheStore: store,
    clearListCacheFn: vi.fn(),
  };
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
  clearListCache: clearListCacheFn,
  connectRedis: vi.fn(),
}));

// Mock Prisma（不依赖真实数据库）
vi.mock('../../src/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  },
}));

import usersRoutes from '../../src/routes/users';
import { errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

const TEST_SECRET = 'test-secret-key-for-testing-only-32ch';
const ADMIN_ID = 'cladmin000000000000000001';
const MEMBER_ID = 'clmember00000000000000001';

function signAdminToken(): string {
  return jwt.sign(
    {
      userId: ADMIN_ID,
      email: 'admin@test.com',
      role: 'admin',
      department: null,
      tokenVersion: 0,
    },
    TEST_SECRET,
    { expiresIn: '1h' }
  );
}

function signMemberToken(): string {
  return jwt.sign(
    {
      userId: MEMBER_ID,
      email: 'member@test.com',
      role: 'member',
      department: null,
      tokenVersion: 0,
    },
    TEST_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * 设置 authenticate 中间件的 findUnique mock（按 userId 精确返回用户）
 * auth 中间件会以 `{ where: { id: userId } }` 查用户，select 仅含 id/email/role/department/tokenVersion
 */
function mockAuthUser(user: {
  id: string;
  email: string;
  role: 'admin' | 'member';
  tokenVersion?: number;
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
        tokenVersion: user.tokenVersion ?? 0,
      } as never;
    }
    if (where?.email !== undefined) {
      return null; // 邮箱查重默认不存在
    }
    return null;
  });
}

describe('POST /api/users 创建成员（E2E-P2.5）', () => {
  let app: express.Application;

  const newUserData = {
    email: 'newuser@test.local',
    password: 'NewUser123',
    name: '新成员',
    role: 'hr' as const,
    department: '研发部',
  };

  const createdUserRecord = {
    id: 'clnewuser00000000000001',
    email: newUserData.email,
    name: newUserData.name,
    role: newUserData.role,
    department: newUserData.department,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    updatedAt: new Date('2026-09-10T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/users', usersRoutes);
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
  });

  it('admin 创建成员 → 201 + 返回 data 含 id/email', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    vi.mocked(prisma.user.create).mockResolvedValueOnce(createdUserRecord as never);
    vi.mocked(prisma.operationLog.create).mockResolvedValueOnce({} as never);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send(newUserData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.email).toBe(newUserData.email);
    expect(res.body.data.name).toBe(newUserData.name);
    expect(res.body.data.role).toBe('hr');
    expect(res.body.data.department).toBe('研发部');
    expect(res.body.message).toBe('用户创建成功');
  });

  it('admin 可创建 hiring_manager / interviewer 角色；历史 member 不再接受', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.create).mockImplementation(async (args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (args as any)?.data;
      return { ...createdUserRecord, role: data.role } as never;
    });

    for (const role of ['hiring_manager', 'interviewer'] as const) {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${signAdminToken()}`)
        .send({ ...newUserData, email: `${role}@test.local`, role });
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe(role);
    }

    const legacyMember = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({ ...newUserData, email: 'legacy-member@test.local', role: 'member' });
    expect(legacyMember.status).toBe(400);
  });

  it('重复邮箱 → 409', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    // 覆盖默认：让 email 查重返回已存在用户
    vi.mocked(prisma.user.findUnique).mockImplementation(async (args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where = (args as any)?.where;
      if (where?.id === ADMIN_ID) {
        return {
          id: ADMIN_ID,
          email: 'admin@test.com',
          role: 'admin',
          department: null,
          tokenVersion: 0,
        } as never;
      }
      if (where?.email === newUserData.email) {
        return { id: 'existing', email: newUserData.email } as never;
      }
      return null;
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send(newUserData);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('该邮箱已被注册');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('非 admin（member）创建 → 403', async () => {
    mockAuthUser({ id: MEMBER_ID, email: 'member@test.com', role: 'member' });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signMemberToken()}`)
      .send(newUserData);

    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('未登录创建 → 401', async () => {
    const res = await request(app).post('/api/users').send(newUserData);

    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('密码仅数字（不满足策略）→ 400', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({
        ...newUserData,
        password: '12345678',
      });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('密码不足 8 位 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({
        ...newUserData,
        password: 'Ab1',
      });

    expect(res.status).toBe(400);
  });

  it('department 空串 → 存 null', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    const createSpy = vi.mocked(prisma.user.create).mockResolvedValueOnce({
      ...createdUserRecord,
      department: null,
    } as never);
    vi.mocked(prisma.operationLog.create).mockResolvedValueOnce({} as never);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({
        ...newUserData,
        department: '',
      });

    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ department: null }),
      })
    );
  });

  it('department 不传 → 存 null', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    const createSpy = vi.mocked(prisma.user.create).mockResolvedValueOnce({
      ...createdUserRecord,
      department: null,
    } as never);
    vi.mocked(prisma.operationLog.create).mockResolvedValueOnce({} as never);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { department, ...payload } = newUserData;

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ department: null }),
      })
    );
  });

  it('创建成功 → 写入 OperationLog (action=user_create)', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    vi.mocked(prisma.user.create).mockResolvedValueOnce(createdUserRecord as never);
    const logSpy = vi.mocked(prisma.operationLog.create).mockResolvedValueOnce({} as never);

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send(newUserData);

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'user_create',
          targetType: 'User',
          targetId: createdUserRecord.id,
        }),
      })
    );
  });

  it('创建成功 → clearListCache(users:list:*) 被调用', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });
    vi.mocked(prisma.user.create).mockResolvedValueOnce(createdUserRecord as never);
    vi.mocked(prisma.operationLog.create).mockResolvedValueOnce({} as never);

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send(newUserData);

    expect(clearListCacheFn).toHaveBeenCalledWith('users:list:*');
  });

  it('email 格式非法 → 400', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({
        ...newUserData,
        email: 'not-an-email',
      });

    expect(res.status).toBe(400);
  });

  it('name 仅 1 位 → 400（min 2）', async () => {
    mockAuthUser({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({
        ...newUserData,
        name: 'X',
      });

    expect(res.status).toBe(400);
  });
});
