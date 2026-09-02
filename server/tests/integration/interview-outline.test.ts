import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// 简化：仅 mock prisma / LLM / queue / redis，不连 DB
vi.mock('../../src/lib/prisma', () => ({
  default: {
    interview: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    interviewQuestionOutline: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    interviewEvaluation: { findMany: vi.fn(), createMany: vi.fn() },
    interviewFeedback: { findMany: vi.fn() },
    aiMatchScore: { findUnique: vi.fn() },
    dictionary: { count: vi.fn(), findMany: vi.fn() },
    operationLog: { create: vi.fn() },
    user: { findMany: vi.fn() },
    candidate: { count: vi.fn(), findUnique: vi.fn() },
    job: { findUnique: vi.fn() },
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

// 自定义 requireMatrixPermission：按测试需要切换角色
const permissionMockState: { role: string | null } = { role: null };
vi.mock('../../src/middleware/role', () => ({
  requireMatrixPermission: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const role = permissionMockState.role || (req.headers['x-test-role'] as string) || 'admin';
    // 仅 admin / hr / hiring_manager / interviewer 给权限（与实际权限矩阵对齐）
    const allowed = ['admin', 'hr', 'hiring_manager', 'interviewer'].includes(role);
    if (!allowed) {
      return next(new AppError(`没有权限：ai:interview-outline`, 403));
    }
    next();
  },
}));

import interviewRoutes from '../../src/routes/interviews';
import { AppError, errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';
import { callLLM } from '../../src/lib/llm';

describe('interview-outline 接口集成测试（F3-S）', () => {
  let app: express.Application;

  const INT_ID = 'clf3stest0000000000000001';
  const CAND_ID = 'clf3stest0000000000000002';
  const USER_ID = 'user-1';

  const baseInterview = {
    id: INT_ID,
    candidateId: CAND_ID,
    jobId: 'clf3stest0000000000000003',
    scheduledAt: new Date('2026-09-15T10:00:00Z'),
    duration: 60,
    round: '复试',
    type: '视频',
    interviewers: [{ id: USER_ID, name: '王老师' }],
    candidate: {
      id: CAND_ID,
      name: '张三',
      skills: ['Vue'],
      workYears: 5,
      education: '本科',
      school: '清华',
      currentCompany: 'Acme',
      currentPosition: '前端',
      workHistories: [],
    },
    job: {
      id: 'clf3stest0000000000000003',
      title: '高级前端',
      level: 'P6',
      type: '社招',
      description: '负责核心',
      requirements: '5年经验',
    },
  };

  const focusDictItems = [
    { id: 'd1', category: 'interview_focus_type', code: 'hr', name: 'HR面', sortOrder: 1, enabled: true, description: null, createdAt: new Date(), updatedAt: new Date() },
  ];

  const validOutlineJson = {
    sections: [
      {
        theme: '求职动机',
        questions: [{ question: '为什么看机会？', intent: '考察稳定性', referenceAnswer: '关注原因合理性' }],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    permissionMockState.role = null;
    // 默认字典通过
    vi.mocked(prisma.dictionary.count).mockResolvedValue(1);
    vi.mocked(prisma.dictionary.findMany).mockImplementation(async (args: any) => {
      if (args?.where?.category === 'interview_focus_type') return focusDictItems as any;
      return [];
    });
    // 历史为空
    vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interviewFeedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
    // 版本为 0
    vi.mocked(prisma.interviewQuestionOutline.count).mockResolvedValue(0);
    vi.mocked(prisma.interviewQuestionOutline.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.interviewQuestionOutline.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interviewQuestionOutline.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.interviewQuestionOutline.update).mockImplementation(async (args: any) => ({
      id: 'outline-1',
      interviewId: INT_ID,
      version: 1,
      focusType: 'hr',
      outline: args.data.outline,
      adjustNote: null,
      editedById: args.data.editedById,
      createdById: USER_ID,
      createdAt: new Date(),
    }));
    vi.mocked(prisma.interviewQuestionOutline.create).mockImplementation(async (args: any) => ({
      id: 'outline-1',
      interviewId: INT_ID,
      version: args.data.version,
      focusType: args.data.focusType,
      outline: args.data.outline,
      adjustNote: args.data.adjustNote ?? null,
      editedById: null,
      createdById: args.data.createdById,
      createdAt: new Date(),
    }));
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.candidate.count).mockResolvedValue(1);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    app = express();
    app.use(express.json());
    app.use('/api/interviews', interviewRoutes);
    app.use(errorHandler);
  });

  // ============ 401 ============

  it('无 token 时 POST /api/interviews/:id/question-outline 应返回 401', async () => {
    const res = await request(app)
      .post(`/api/interviews/${INT_ID}/question-outline`)
      .set('x-test-role', 'none')
      .send({ focusType: 'hr' });
    expect(res.status).toBe(401);
    expect(callLLM).not.toHaveBeenCalled();
  });

  // ============ 403 ============

  it('无权限角色（hr）调用应通过（hr 在权限矩阵内 → 走候选人可见性）', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    vi.mocked(callLLM).mockResolvedValue({ content: JSON.stringify(validOutlineJson) });

    const res = await request(app)
      .post(`/api/interviews/${INT_ID}/question-outline`)
      .set('x-test-role', 'hr')
      .send({ focusType: 'hr' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(1);
  });

  // ============ 正常路径 ============

  it('admin 调用 POST 生成大纲：返回新版本（version=1, focusType=hr）', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    vi.mocked(callLLM).mockResolvedValue({ content: JSON.stringify(validOutlineJson) });

    const res = await request(app)
      .post(`/api/interviews/${INT_ID}/question-outline`)
      .set('x-test-role', 'admin')
      .send({ focusType: 'hr' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.focusType).toBe('hr');
    expect(callLLM).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'interview-outline');
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          action: 'ai_question_outline',
          detail: expect.objectContaining({ success: true, version: 1, focusType: 'hr' }),
        }),
      }),
    );
  });

  it('GET /api/interviews/:id/question-outlines 返回版本列表', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue({
      id: INT_ID,
      candidateId: CAND_ID,
      interviewers: [{ id: USER_ID, name: '王老师' }],
    } as any);
    vi.mocked(prisma.interviewQuestionOutline.findMany).mockResolvedValue([
      {
        id: 'outline-1',
        interviewId: INT_ID,
        version: 1,
        focusType: 'hr',
        outline: validOutlineJson,
        adjustNote: null,
        editedById: null,
        createdById: USER_ID,
        createdAt: new Date(),
      },
    ] as any);

    const res = await request(app)
      .get(`/api/interviews/${INT_ID}/question-outlines`)
      .set('x-test-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].version).toBe(1);
  });

  it('PATCH /api/interviews/:id/question-outline/:version 手动定稿', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue({
      id: INT_ID,
      candidateId: CAND_ID,
      interviewers: [{ id: USER_ID, name: '王老师' }],
    } as any);
    vi.mocked(prisma.interviewQuestionOutline.findUnique).mockResolvedValue({
      id: 'outline-1',
      interviewId: INT_ID,
      version: 1,
      focusType: 'hr',
      outline: validOutlineJson,
      adjustNote: null,
      editedById: null,
      createdById: USER_ID,
      createdAt: new Date(),
    } as any);

    const res = await request(app)
      .patch(`/api/interviews/${INT_ID}/question-outline/1`)
      .set('x-test-role', 'admin')
      .send({ outline: validOutlineJson });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 不调 LLM（手动定稿）
    expect(callLLM).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'question_outline_edit',
          detail: expect.objectContaining({ version: 1, editedById: USER_ID }),
        }),
      }),
    );
  });

  // ============ 校验 ============

  it('POST focusType 为空 → 400（zod 拦截）', async () => {
    const res = await request(app)
      .post(`/api/interviews/${INT_ID}/question-outline`)
      .set('x-test-role', 'admin')
      .send({ focusType: '' });
    expect(res.status).toBe(400);
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('POST focusType 非字典 enabled → 400（service 层拦截）', async () => {
    const res = await request(app)
      .post(`/api/interviews/${INT_ID}/question-outline`)
      .set('x-test-role', 'admin')
      .send({ focusType: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('考察方向无效');
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('PATCH 结构不合格 outline → 400（service 层拦截）', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue({
      id: INT_ID,
      candidateId: CAND_ID,
      interviewers: [{ id: USER_ID, name: '王老师' }],
    } as any);
    const res = await request(app)
      .patch(`/api/interviews/${INT_ID}/question-outline/1`)
      .set('x-test-role', 'admin')
      .send({ outline: { sections: [] } });
    expect(res.status).toBe(400);
  });

  // ============ 面试创建/编辑带 focusType ============

  it('POST /api/interviews 带 focusType=hr 创建：service 透传入库', async () => {
    // 真实路由会调用 interview-scheduler.service.createInterview
    // 这里简单断言：mock candidate / job 让 service 走完整路径
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: CAND_ID,
      name: '张三',
      createdById: USER_ID,
    } as any);
    vi.mocked(prisma.candidate.count).mockResolvedValue(1);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      id: 'clf3stest0000000000000003',
      title: '高级前端',
    } as any);
    vi.mocked(prisma.interview.findMany).mockResolvedValue([]); // 无冲突
    vi.mocked(prisma.interview.create).mockImplementation(async (args: any) => ({
      id: 'new-int',
      ...args.data,
    }));
    vi.mocked(prisma.interviewEvaluation.createMany).mockResolvedValue({ count: 1 } as any);

    const res = await request(app)
      .post('/api/interviews')
      .set('x-test-role', 'admin')
      .send({
        candidateId: CAND_ID,
        jobId: 'clf3stest0000000000000003',
        round: '复试',
        type: '视频',
        interviewers: [{ id: USER_ID, name: '王老师' }],
        scheduledAt: '2026-09-15T10:00:00Z',
        duration: 60,
        focusType: 'hr',
      });

    expect(res.status).toBe(201);
    expect(prisma.interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ focusType: 'hr' }),
      }),
    );
  });

  it('POST /api/interviews focusType 非字典 → 400', async () => {
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: CAND_ID,
      name: '张三',
      createdById: USER_ID,
    } as any);
    vi.mocked(prisma.candidate.count).mockResolvedValue(1);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      id: 'clf3stest0000000000000003',
      title: '高级前端',
    } as any);
    vi.mocked(prisma.interview.findMany).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/interviews')
      .set('x-test-role', 'admin')
      .send({
        candidateId: CAND_ID,
        jobId: 'clf3stest0000000000000003',
        round: '复试',
        type: '视频',
        interviewers: [{ id: USER_ID, name: '王老师' }],
        scheduledAt: '2026-09-15T10:00:00Z',
        duration: 60,
        focusType: 'bogus',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('考察方向无效');
  });
});