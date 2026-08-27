import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32ch';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
});

const { cacheStore, redisDel, getFromCache, setCache } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cacheStore: store,
    redisDel: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    getFromCache: vi.fn(async (key: string) => {
      const raw = store.get(key);
      return raw ? JSON.parse(raw) : null;
    }),
    setCache: vi.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
  };
});

vi.mock('../../src/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { del: redisDel },
  getFromCache,
  setCache,
  clearListCache: vi.fn(),
  connectRedis: vi.fn(),
}));

import authRoutes from '../../src/routes/auth';
import { authenticate, authUserCacheKey } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

const MEMBER_ID = 'clmember00000000000000001';
const TEST_SECRET = 'test-secret-key-for-testing-only-32ch';

function signToken(payload: {
  userId: string;
  email: string;
  role: string;
  tokenVersion: number;
}): string {
  return jwt.sign({ department: null, ...payload }, TEST_SECRET, { expiresIn: '1h' });
}

describe('JWT 用户 Redis 缓存', () => {
  let app: express.Application;
  let passwordHash: string;

  const memberUser = {
    id: MEMBER_ID,
    email: 'member@test.com',
    name: '普通成员',
    role: 'member',
    department: null,
    tokenVersion: 0,
    createdAt: new Date(),
  };

  const authUserRow = {
    id: MEMBER_ID,
    email: 'member@test.com',
    role: 'member',
    department: null,
    tokenVersion: 0,
  };

  function memberToken(): string {
    return signToken({
      userId: MEMBER_ID,
      email: 'member@test.com',
      role: 'member',
      tokenVersion: 0,
    });
  }

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('OldPass123', 10);
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.get('/api/protected', authenticate, (req, res) => {
      res.json({ success: true, userId: req.user!.userId });
    });
    app.use(errorHandler);
    cacheStore.clear();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...memberUser,
      password: passwordHash,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue(memberUser as never);
  });

  it('第一次请求触发 DB 查询并写入缓存', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${memberToken()}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(setCache).toHaveBeenCalledWith(
      authUserCacheKey(MEMBER_ID),
      expect.objectContaining({ id: MEMBER_ID, tokenVersion: 0 }),
      60
    );
    expect(cacheStore.has(authUserCacheKey(MEMBER_ID))).toBe(true);
  });

  it('第二次请求（同 token）不触发 DB 查询', async () => {
    await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${memberToken()}`)
      .expect(200);

    vi.mocked(prisma.user.findUnique).mockClear();

    await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${memberToken()}`)
      .expect(200);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(getFromCache).toHaveBeenCalled();
  });

  it('修改密码后缓存被清空', async () => {
    await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${memberToken()}`)
      .expect(200);
    expect(cacheStore.has(authUserCacheKey(MEMBER_ID))).toBe(true);

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${memberToken()}`)
      .send({ oldPassword: 'OldPass123', newPassword: 'NewPass456' })
      .expect(200);

    expect(redisDel).toHaveBeenCalledWith(authUserCacheKey(MEMBER_ID));
    expect(cacheStore.has(authUserCacheKey(MEMBER_ID))).toBe(false);
  });

  it('缓存击穿：并发请求复用同一次 DB 查询', async () => {
    let release!: (value: typeof authUserRow) => void;
    const barrier = new Promise<typeof authUserRow>((resolve) => {
      release = resolve;
    });
    vi.mocked(prisma.user.findUnique).mockImplementation(
      () => barrier as Promise<typeof memberUser>
    );

    const token = memberToken();
    const pending = Promise.all([
      request(app).get('/api/protected').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/protected').set('Authorization', `Bearer ${token}`),
    ]);

    await new Promise((r) => { setTimeout(r, 30); });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    release(authUserRow);
    const [first, second] = await pending;
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
