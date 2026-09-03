process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32ch';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  aiProviderConfig: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  operationLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ default: mockPrisma }));

vi.mock('../../src/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LLM_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'sk-test',
    JWT_SECRET: 'test-secret-key-for-testing-only-32ch',
  },
  AI_CONFIG_ENC_KEY: Buffer.alloc(32, 3),
}));

vi.mock('../../src/lib/llm', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department: role === 'admin' ? null : '人力资源部',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未认证' });
        return;
      }
      if (!roles.includes(req.user.role)) {
        res.status(403).json({ success: false, error: '没有权限执行此操作', code: 403 });
        return;
      }
      next();
    },
}));

import aiSettingsRoutes from '../../src/routes/ai-settings';
import { errorHandler } from '../../src/middleware/errorHandler';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', aiSettingsRoutes);
  app.use(errorHandler);
  return app;
}

describe('ai-settings 接口集成测试', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    mockPrisma.aiProviderConfig.findMany.mockResolvedValue([]);
    mockPrisma.operationLog.create.mockResolvedValue({});
  });

  it('admin 可获取四家提供方列表，响应不含明文密钥', async () => {
    const res = await request(app).get('/api/settings/ai-providers').set('x-test-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(4);
    res.body.data.forEach((item: Record<string, unknown>) => {
      expect(item).not.toHaveProperty('apiKeyEnc');
      expect(item).toHaveProperty('apiKeyMask');
      expect(item).toHaveProperty('hasKey');
    });
  });

  it('非 admin 访问列表返回 403', async () => {
    const res = await request(app).get('/api/settings/ai-providers').set('x-test-role', 'hr');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('非法 provider 返回 400', async () => {
    const res = await request(app)
      .put('/api/settings/ai-providers/openai')
      .set('x-test-role', 'admin')
      .send({ model: 'gpt-4' });
    expect(res.status).toBe(400);
  });
});
