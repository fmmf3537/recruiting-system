import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// 在模块加载前设置测试环境变量（env.ts 在 import 时即读取校验）
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32ch';
  process.env.JWT_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';
});

// Mock Prisma（不依赖真实数据库）
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

import authRoutes from '../../src/routes/auth';
import usersRoutes from '../../src/routes/users';
import { errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

// 构造 cuid 风格的测试 ID（idParam 校验要求 cuid 格式）
const ADMIN_ID = 'cladmin000000000000000001';
const MEMBER_ID = 'clmember00000000000000001';

const TEST_SECRET = 'test-secret-key-for-testing-only-32ch';

// 直接签发 token（模拟登录后客户端持有的凭证）
function signToken(payload: {
  userId: string;
  email: string;
  role: string;
  tokenVersion: number;
}): string {
  return jwt.sign({ department: null, ...payload }, TEST_SECRET, { expiresIn: '1h' });
}

describe('认证与账号安全 API 测试', () => {
  let app: express.Application;

  const adminUser = {
    id: ADMIN_ID,
    email: 'admin@test.com',
    name: '管理员',
    role: 'admin',
    department: null,
    tokenVersion: 0,
    createdAt: new Date(),
  };

  const memberUser = {
    id: MEMBER_ID,
    email: 'member@test.com',
    name: '普通成员',
    role: 'member',
    department: null,
    tokenVersion: 0,
    createdAt: new Date(),
  };

  let memberPasswordHash: string;

  beforeAll(async () => {
    memberPasswordHash = await bcrypt.hash('OldPass123', 10);
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/users', usersRoutes);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  describe('登录与 tokenVersion', () => {
    it('登录签发的 token 携带 tokenVersion，可正常访问 /me', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...memberUser,
        password: memberPasswordHash,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'member@test.com', password: 'OldPass123' })
        .expect(200);

      const token = loginRes.body.token as string;
      const decoded = jwt.decode(token) as { tokenVersion?: number };
      expect(decoded.tokenVersion).toBe(0);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(meRes.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/change-password - 修改密码', () => {
    it('改密后 tokenVersion +1，旧 token 立即失效', async () => {
      // 改密前：数据库中 tokenVersion 为 0
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...memberUser,
        password: memberPasswordHash,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(prisma.user.update).mockResolvedValue(memberUser as never);

      const oldToken = signToken({
        userId: MEMBER_ID,
        email: 'member@test.com',
        role: 'member',
        tokenVersion: 0,
      });

      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ oldPassword: 'OldPass123', newPassword: 'NewPass456' })
        .expect(200);
      expect(changeRes.body.success).toBe(true);

      // 验证更新时 tokenVersion +1
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEMBER_ID },
          data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
        })
      );

      // 改密后：数据库中 tokenVersion 已变为 1，旧 token（版本 0）应被吊销
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...memberUser,
        tokenVersion: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);
      expect(meRes.body.error).toContain('失效');
    });

    it('弱密码（7位纯数字）应被拒绝', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...memberUser,
        password: memberPasswordHash,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const token = signToken({
        userId: MEMBER_ID,
        email: 'member@test.com',
        role: 'member',
        tokenVersion: 0,
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'OldPass123', newPassword: '1234567' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('纯字母密码（无数字）应被拒绝', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...memberUser,
        password: memberPasswordHash,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const token = signToken({
        userId: MEMBER_ID,
        email: 'member@test.com',
        role: 'member',
        tokenVersion: 0,
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'OldPass123', newPassword: 'abcdefgh' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/register - 注册密码策略', () => {
    function adminToken(): string {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as never);
      return signToken({
        userId: ADMIN_ID,
        email: 'admin@test.com',
        role: 'admin',
        tokenVersion: 0,
      });
    }

    it('纯数字 8 位密码应被拒绝', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ email: 'new@test.com', password: '12345678', name: '新成员' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('6 位符合复杂度但长度不足的密码应被拒绝', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ email: 'new@test.com', password: 'abc123', name: '新成员' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/users/:id/reset-password - 管理员重置密码', () => {
    it('重置成功：返回符合策略的 12 位临时密码，tokenVersion +1 并写入操作日志', async () => {
      // authenticate 查管理员，handler 查目标用户
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(adminUser as never)
        .mockResolvedValueOnce(memberUser as never);
      vi.mocked(prisma.user.update).mockResolvedValue(memberUser as never);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as never);

      const token = signToken({
        userId: ADMIN_ID,
        email: 'admin@test.com',
        role: 'admin',
        tokenVersion: 0,
      });

      const res = await request(app)
        .post(`/api/users/${MEMBER_ID}/reset-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const { tempPassword } = res.body.data as { tempPassword: string };
      // 临时密码：12 位，含字母和数字，满足密码策略
      expect(tempPassword).toHaveLength(12);
      expect(tempPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d)/);

      // tokenVersion +1，强制目标用户重新登录
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEMBER_ID },
          data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
        })
      );

      // 写入操作日志
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: ADMIN_ID,
            targetType: 'User',
            targetId: MEMBER_ID,
            action: 'password_reset',
          }),
        })
      );
    });

    it('重置后目标用户的旧 token 立即失效', async () => {
      // 目标用户旧 token（版本 0），数据库中已被重置为版本 1
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...memberUser,
        tokenVersion: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const oldMemberToken = signToken({
        userId: MEMBER_ID,
        email: 'member@test.com',
        role: 'member',
        tokenVersion: 0,
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${oldMemberToken}`)
        .expect(401);
      expect(res.body.error).toContain('失效');
    });

    it('非管理员调用应返回 403', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(memberUser as never);

      const token = signToken({
        userId: MEMBER_ID,
        email: 'member@test.com',
        role: 'member',
        tokenVersion: 0,
      });

      await request(app)
        .post(`/api/users/${MEMBER_ID}/reset-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('目标用户不存在应返回 404', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(adminUser as never)
        .mockResolvedValueOnce(null);

      const token = signToken({
        userId: ADMIN_ID,
        email: 'admin@test.com',
        role: 'admin',
        tokenVersion: 0,
      });

      await request(app)
        .post(`/api/users/${MEMBER_ID}/reset-password`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
