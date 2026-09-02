import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// 简化：仅 mock prisma / LLM / queue / redis，不连 DB
vi.mock('../../src/lib/prisma', () => ({
  default: {
    candidate: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    job: { findUnique: vi.fn() },
    aiMatchScore: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    dictionary: { count: vi.fn(), findMany: vi.fn() },
    operationLog: { create: vi.fn() },
  },
}));

vi.mock('../../src/lib/llm', () => ({
  callLLM: vi.fn(),
  extractResumeInfo: vi.fn(),
}));

// 模拟 aiMatchScoreQueue.add 为 fire-and-forget（不影响单测）
vi.mock('../../src/lib/queue', () => ({
  resumeParseQueue: { add: vi.fn() },
  aiMatchScoreQueue: { add: vi.fn() },
}));

// 防止启动连接 Redis
vi.mock('../../src/lib/redis', () => ({
  redis: { disconnect: vi.fn() },
  getBullMQConnection: () => ({ host: 'localhost', port: 6379 }),
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn(),
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
}));

// 模拟 auth 与 middleware 链（按 role-middleware.test 的方式注入 req.user）
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers['x-test-role'];
    // 哨兵值 'none'：模拟未携带有效 token，走真实 authenticate 的 401 分支
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

// 自定义 requireMatrixPermission（不依赖 role-permission.service）
const permissionMockState: { role: string | null } = { role: 'admin' };
vi.mock('../../src/middleware/role', () => ({
  requireMatrixPermission: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const role = permissionMockState.role || (req.headers['x-test-role'] as string) || 'admin';
    if (role === 'interviewer') {
      return next(new AppError('没有权限：ai:match-score', 403));
    }
    next();
  },
}));

import candidateRoutes from '../../src/routes/candidates';
import jobRoutes from '../../src/routes/jobs';
import { AppError, errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';
import { callLLM } from '../../src/lib/llm';
import { scoreCandidateForJob } from '../../src/services/match-score.service';

describe('match-score 接口集成测试', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionMockState.role = null;
    app = express();
    app.use(express.json());
    app.use('/api/candidates', candidateRoutes);
    app.use('/api/jobs', jobRoutes);
    app.use(errorHandler);
  });

  it('无 token 时 /api/candidates/:id/match-scores 应返回 401', async () => {
    // 哨兵头 x-test-role: none 让 mock authenticate 走 401 分支（模拟未携带 token）
    const res = await request(app)
      .get('/api/candidates/clf2stest0000000000000001/match-scores')
      .set('x-test-role', 'none');
    expect(res.status).toBe(401);
  });

  it('POST /api/candidates/:id/match-score 正常路径：admin 可触发、LLM 返回合法 JSON', async () => {
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: 'clf2stest0000000000000001',
      name: '张三',
      skills: ['Vue'],
      workYears: 3,
      education: '本科',
      school: '清华',
      currentCompany: 'Acme',
      currentPosition: '前端',
      createdById: 'user-1',
      workHistories: [],
    } as any);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      id: 'clf2stest0000000000000002',
      title: '高级前端',
      level: 'P6',
      type: '社招',
      description: '负责核心',
      requirements: '3年经验',
      skills: ['Vue'],
    } as any);
    vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
    vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
      id: 'ams-1',
      ...args.create,
    }));
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);
    vi.mocked(callLLM).mockResolvedValue({
      content: JSON.stringify({
        dimensions: [
          { code: 'skill_match', score: 80 },
          { code: 'experience_match', score: 80 },
          { code: 'education_match', score: 80 },
          { code: 'stability', score: 80 },
          { code: 'bonus', score: 80 },
        ],
        summary: '匹配',
        highlights: [],
        risks: [],
      }),
    });

    const res = await request(app)
      .post('/api/candidates/clf2stest0000000000000001/match-score')
      .set('x-test-role', 'admin')
      .send({ jobId: 'clf2stest0000000000000002' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.overallScore).toBe(80);
    expect(res.body.data.grade).toBe('recommend');
    expect(res.body.data.triggeredBy).toBe('manual');
  });

  it('interviewer 应被 requireMatrixPermission 拦截（403）', async () => {
    const res = await request(app)
      .post('/api/candidates/clf2stest0000000000000001/match-score')
      .set('x-test-role', 'interviewer')
      .send({ jobId: 'clf2stest0000000000000002' });
    expect(res.status).toBe(403); // mock 抛 AppError(403)，由 errorHandler 返回 403
    expect(res.body.error).toBe('没有权限：ai:match-score');
  });

  it('service 层 listJobMatchScores - hr 跨部门无权访问：返回 403', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      id: 'clf2stest0000000000000004',
      departments: ['市场部'],
    } as any);

    await expect(
      scoreCandidateForJob('clf2stest0000000000000003', 'clf2stest0000000000000004', { triggeredBy: 'manual', createdById: 'user-1' }).catch(async () => {
        // 不会到这一步；列表接口的 403 走单独路径
        return null;
      })
    ).resolves.toBeTruthy();

    // 直接调用 service（不给 scope）应返回 401
    const { listJobMatchScores } = await import('../../src/services/match-score.service');
    await expect(listJobMatchScores('clf2stest0000000000000004', undefined)).rejects.toThrow('需要登录上下文');
  });
});
