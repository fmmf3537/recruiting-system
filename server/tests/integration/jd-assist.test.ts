import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock prisma + LLM（不连 DB）
vi.mock('../../src/lib/prisma', () => ({
  default: {
    job: { findMany: vi.fn() },
    operationLog: { create: vi.fn() },
  },
}));

vi.mock('../../src/lib/llm', () => ({
  callLLM: vi.fn(),
  extractResumeInfo: vi.fn(),
}));

// 防止启动连接 Redis / BullMQ
vi.mock('../../src/lib/queue', () => ({
  resumeParseQueue: { add: vi.fn() },
  aiMatchScoreQueue: { add: vi.fn() },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { disconnect: vi.fn() },
  getBullMQConnection: () => ({ host: 'localhost', port: 6379 }),
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn(),
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
}));

// 模拟 auth：x-test-role: 'none' → 401；其余按 role 注入 req.user
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
      department: role === 'admin' ? null : '技术部',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// 自定义 requireMatrixPermission：interviewer 抛 403；其余放行
const permissionMockState: { role: string | null } = { role: 'admin' };
vi.mock('../../src/middleware/role', () => ({
  requireMatrixPermission: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const role = permissionMockState.role || (req.headers['x-test-role'] as string) || 'admin';
    if (role === 'interviewer') {
      return next(new AppError('没有权限：ai:jd-assist', 403));
    }
    next();
  },
}));

import jobRoutes from '../../src/routes/jobs';
import { AppError, errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';
import { callLLM } from '../../src/lib/llm';

describe('jd-assist 接口集成测试', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionMockState.role = null;
    app = express();
    app.use(express.json());
    app.use('/api/jobs', jobRoutes);
    app.use(errorHandler);
  });

  // ============ 401 ============

  it('无 token 时 POST /api/jobs/ai-polish 应返回 401', async () => {
    const res = await request(app)
      .post('/api/jobs/ai-polish')
      .set('x-test-role', 'none')
      .send({ jdText: '一段足够长的 JD 内容用于测试' });
    expect(res.status).toBe(401);
  });

  it('无 token 时 POST /api/jobs/ai-draft 应返回 401', async () => {
    const res = await request(app)
      .post('/api/jobs/ai-draft')
      .set('x-test-role', 'none')
      .send({ title: '工程师', departments: ['研发'], level: 'P5', type: '社招' });
    expect(res.status).toBe(401);
  });

  // ============ 403（interviewer） ============

  it('interviewer 调用 /ai-polish 应被拦截（403）', async () => {
    const res = await request(app)
      .post('/api/jobs/ai-polish')
      .set('x-test-role', 'interviewer')
      .send({ jdText: '一段足够长的 JD 内容用于测试' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('没有权限：ai:jd-assist');
  });

  it('interviewer 调用 /ai-draft 应被拦截（403）', async () => {
    const res = await request(app)
      .post('/api/jobs/ai-draft')
      .set('x-test-role', 'interviewer')
      .send({ title: '工程师', departments: ['研发'], level: 'P5', type: '社招' });
    expect(res.status).toBe(403);
  });

  // ============ zod 校验 400 ============

  it('ai-polish body jdText 过短（<10 字）应被 zod 拦截 400', async () => {
    const res = await request(app)
      .post('/api/jobs/ai-polish')
      .set('x-test-role', 'admin')
      .send({ jdText: '太短' });
    expect(res.status).toBe(400);
    // 不应调 LLM
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('ai-draft 缺必填 departments 应被 zod 拦截 400', async () => {
    const res = await request(app)
      .post('/api/jobs/ai-draft')
      .set('x-test-role', 'admin')
      .send({ title: '工程师', level: 'P5', type: '社招' });
    expect(res.status).toBe(400);
    expect(callLLM).not.toHaveBeenCalled();
  });

  // ============ 正常路径 ============

  it('admin 调用 /ai-polish 正常路径：mock LLM 返回合法 JSON，200 + data', async () => {
    vi.mocked(callLLM).mockResolvedValue({
      content: JSON.stringify({
        issues: [
          { title: '问题 1', detail: '详情 1', severity: '高' },
          { title: '问题 2', detail: '详情 2', severity: '低' },
        ],
        improvedJd: '## 优化稿内容',
      }),
    });
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

    const res = await request(app)
      .post('/api/jobs/ai-polish')
      .set('x-test-role', 'admin')
      .send({
        jdText: '原始 JD 内容文本，用于测试诊断与优化功能。',
        meta: { title: '高级前端工程师', level: 'P6' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.issues).toHaveLength(2);
    expect(res.body.data.improvedJd).toBe('## 优化稿内容');
    expect(callLLM).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'jd-polish');
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'ai_jd_polish',
        }),
      })
    );
  });

  it('admin 调用 /ai-draft 正常路径：无参考 JD 时也能生成 200', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue([]);
    vi.mocked(callLLM).mockResolvedValue({
      content: JSON.stringify({
        draftJd: '## 岗位职责\nxxx\n## 任职要求\nxxx\n## 加分项\nxxx',
      }),
    });
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

    const res = await request(app)
      .post('/api/jobs/ai-draft')
      .set('x-test-role', 'admin')
      .send({
        title: '高级前端工程师',
        departments: ['技术部'],
        level: 'P6',
        type: '社招',
        freeText: '熟悉 Vue3 / TypeScript',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.draftJd).toContain('岗位职责');
    expect(callLLM).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'jd-draft');
  });

  it('hiring_manager 调用 /ai-polish 也应通过（hr/hiring_manager 在权限矩阵内）', async () => {
    vi.mocked(callLLM).mockResolvedValue({
      content: JSON.stringify({
        issues: [],
        improvedJd: '## 优化稿',
      }),
    });
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

    const res = await request(app)
      .post('/api/jobs/ai-polish')
      .set('x-test-role', 'hiring_manager')
      .send({ jdText: '足够长的 JD 内容文本用于测试' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});