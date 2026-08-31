import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import offerRoutes from '../../src/routes/offers';
import communicationRoutes from '../../src/routes/communications';
import interviewRoutes from '../../src/routes/interviews';
import onboardingTaskRoutes from '../../src/routes/onboarding-task';
import candidateRoutes from '../../src/routes/candidates';
import { errorHandler } from '../../src/middleware/errorHandler';

// Mock prisma（使用真实 service 层，仅替换数据库访问）
const mockPrisma = vi.hoisted(() => ({
  candidate: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  stageRecord: {
    findMany: vi.fn(),
  },
  candidateJob: {
    findMany: vi.fn(),
  },
  candidateTag: {
    findMany: vi.fn(),
  },
  offer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  communicationLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  interview: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  onboardingTask: {
    findMany: vi.fn(),
    count: vi.fn(),
    createMany: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock redis：缓存一律未命中
vi.mock('../../src/lib/redis', () => ({
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  clearListCache: vi.fn().mockResolvedValue(undefined),
  clearStatsCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock 副作用服务（通知/自动邮件），避免引入邮件等外部依赖
vi.mock('../../src/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/services/email-auto-sender.service', () => ({
  autoSendEmailOnStageTransition: vi.fn(),
}));

// Mock auth middleware：默认 admin；x-test-role 透传 member / hiring_manager / interviewer 等
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    const header = req.headers['x-test-role'];
    const role = typeof header === 'string' ? header : 'admin';
    req.user = {
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department: role === 'admin' ? null : '技术部',
    };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

// member（user-1 / 技术部）的可见性条件，与 candidate-visibility.service 的规则一致
const memberVisibilityWhere = {
  AND: [
    {
      OR: [
        { createdById: 'user-1' },
        { stageRecords: { some: { assigneeId: 'user-1' } } },
        { candidateJobs: { some: { job: { departments: { array_contains: ['技术部'] } } } } },
      ],
    },
    { deletedAt: null },
  ],
};

// 范围外候选人（他人创建、非本部门职位、未指派给当前 member）
const OUT_OF_SCOPE_CANDIDATE_ID = 'clh12345678901234567890123';

describe('关联模块数据可见性（member 越权访问防护）', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/offers', offerRoutes);
    app.use('/api/communications', communicationRoutes);
    app.use('/api/interviews', interviewRoutes);
    app.use('/api/onboarding-tasks', onboardingTaskRoutes);
    app.use('/api/candidates', candidateRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();
    // 默认：候选人存在，但不在 member 可见范围内
    mockPrisma.candidate.findUnique.mockResolvedValue({
      id: OUT_OF_SCOPE_CANDIDATE_ID,
      name: '张三',
      createdById: 'user-2',
      candidateJobs: [],
      offer: null,
    });
    mockPrisma.candidate.findFirst.mockResolvedValue({
      id: OUT_OF_SCOPE_CANDIDATE_ID,
      name: '张三',
      createdById: 'user-2',
      candidateJobs: [],
      offer: null,
      stageRecords: [],
      interviewFeedbacks: [],
      createdBy: { id: 'user-2', name: '他人', email: 'other@test.com' },
      workHistories: [],
      candidateTags: [],
    });
    mockPrisma.candidate.findMany.mockResolvedValue([]);
    mockPrisma.candidate.count.mockResolvedValue(0);
    mockPrisma.stageRecord.findMany.mockResolvedValue([]);
    mockPrisma.candidateJob.findMany.mockResolvedValue([]);
    mockPrisma.candidateTag.findMany.mockResolvedValue([]);
    mockPrisma.offer.findMany.mockResolvedValue([]);
    mockPrisma.offer.count.mockResolvedValue(0);
    mockPrisma.communicationLog.findMany.mockResolvedValue([]);
    mockPrisma.communicationLog.count.mockResolvedValue(0);
    mockPrisma.interview.findMany.mockResolvedValue([]);
    mockPrisma.interview.count.mockResolvedValue(0);
  });

  describe('Offer 模块', () => {
    it('member 获取 Offer 列表时注入可见性过滤', async () => {
      const res = await request(app).get('/api/offers').set('x-test-role', 'member').expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPrisma.offer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ candidate: memberVisibilityWhere }),
        })
      );
    });

    it('member 访问范围外候选人的 Offer 应返回 403', async () => {
      const res = await request(app)
        .get(`/api/offers/${OUT_OF_SCOPE_CANDIDATE_ID}`)
        .set('x-test-role', 'member')
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('member 为范围外候选人创建 Offer 应返回 403', async () => {
      await request(app)
        .post('/api/offers')
        .set('x-test-role', 'member')
        .send({
          candidateId: OUT_OF_SCOPE_CANDIDATE_ID,
          salary: '25000元/月',
          offerDate: '2026-01-20T00:00:00Z',
        })
        .expect(403);
    });

    it('admin 访问范围外候选人的 Offer 不受成员可见性限制', async () => {
      mockPrisma.candidate.count.mockResolvedValue(1);
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        candidateId: OUT_OF_SCOPE_CANDIDATE_ID,
        salary: '25000元/月',
        result: 'pending',
        candidate: { id: OUT_OF_SCOPE_CANDIDATE_ID, name: '张三' },
      });

      const res = await request(app).get(`/api/offers/${OUT_OF_SCOPE_CANDIDATE_ID}`).expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('沟通记录模块', () => {
    it('member 获取沟通记录列表时注入可见性过滤', async () => {
      const res = await request(app)
        .get('/api/communications')
        .set('x-test-role', 'member')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPrisma.communicationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ candidate: memberVisibilityWhere }),
        })
      );
    });

    it('member 为范围外候选人新增沟通记录应返回 403', async () => {
      await request(app)
        .post('/api/communications')
        .set('x-test-role', 'member')
        .send({
          candidateId: OUT_OF_SCOPE_CANDIDATE_ID,
          type: '电话',
          content: '电话沟通了薪资期望',
        })
        .expect(403);

      expect(mockPrisma.communicationLog.create).not.toHaveBeenCalled();
    });
  });

  describe('面试安排模块', () => {
    it('member 获取面试列表时注入可见性过滤', async () => {
      const res = await request(app)
        .get('/api/interviews')
        .set('x-test-role', 'member')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPrisma.interview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ candidate: memberVisibilityWhere }),
        })
      );
    });

    it('member 为范围外候选人创建面试应返回 403', async () => {
      await request(app)
        .post('/api/interviews')
        .set('x-test-role', 'member')
        .send({
          candidateId: OUT_OF_SCOPE_CANDIDATE_ID,
          round: '初试',
          type: '视频',
          interviewers: [{ id: 'user-1', name: '李四' }],
          scheduledAt: '2026-01-15T10:00:00Z',
        })
        .expect(403);

      expect(mockPrisma.interview.create).not.toHaveBeenCalled();
    });

    it('member 取消范围外候选人的面试应返回 403', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'clh99999999999999999999999',
        candidateId: OUT_OF_SCOPE_CANDIDATE_ID,
        status: 'scheduled',
        notes: null,
      });

      await request(app)
        .post('/api/interviews/clh99999999999999999999999/cancel')
        .set('x-test-role', 'member')
        .send({ reason: '时间冲突' })
        .expect(403);
    });
  });

  describe('入职任务模块', () => {
    it('member 查看范围外候选人的入职任务应返回 403', async () => {
      await request(app)
        .get(`/api/onboarding-tasks/candidates/${OUT_OF_SCOPE_CANDIDATE_ID}`)
        .set('x-test-role', 'member')
        .expect(403);

      expect(mockPrisma.onboardingTask.findMany).not.toHaveBeenCalled();
    });

    it('member 为范围外候选人批量生成入职任务应返回 403', async () => {
      await request(app)
        .post(`/api/onboarding-tasks/candidates/${OUT_OF_SCOPE_CANDIDATE_ID}/generate`)
        .set('x-test-role', 'member')
        .expect(403);

      expect(mockPrisma.onboardingTask.createMany).not.toHaveBeenCalled();
    });

    it('member 为范围外候选人创建入职任务应返回 403', async () => {
      await request(app)
        .post('/api/onboarding-tasks')
        .set('x-test-role', 'member')
        .send({
          candidateId: OUT_OF_SCOPE_CANDIDATE_ID,
          title: '收集身份证复印件',
          category: '材料收集',
        })
        .expect(403);
    });
  });

  describe('hiring_manager / interviewer 可见性与写权限', () => {
    it('hiring_manager 列表仅注入本部门可见性过滤', async () => {
      const res = await request(app)
        .get('/api/candidates')
        .set('x-test-role', 'hiring_manager')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPrisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ deletedAt: null }, memberVisibilityWhere],
          }),
        })
      );
    });

    it('hiring_manager 试图 PATCH 候选人返回 403', async () => {
      const res = await request(app)
        .patch(`/api/candidates/${OUT_OF_SCOPE_CANDIDATE_ID}`)
        .set('x-test-role', 'hiring_manager')
        .send({ name: '李四' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('没有权限：candidate:update');
    });

    it('interviewer 列表仅包含自己被指派面试的候选人', async () => {
      const assignedId = 'clh11111111111111111111111';
      mockPrisma.interview.findMany.mockResolvedValue([
        {
          candidateId: assignedId,
          interviewers: [{ id: 'user-1', name: '面试官甲' }],
        },
        {
          candidateId: 'clh22222222222222222222222',
          interviewers: [{ id: 'user-2', name: '面试官乙' }],
        },
      ]);

      const res = await request(app)
        .get('/api/candidates')
        .set('x-test-role', 'interviewer')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPrisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              { deletedAt: null },
              { AND: [{ id: { in: [assignedId] } }, { deletedAt: null }] },
            ],
          }),
        })
      );
    });

    it('interviewer 访问不相关候选人详情返回 403', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([
        {
          candidateId: 'clh11111111111111111111111',
          interviewers: [{ id: 'user-1', name: '面试官甲' }],
        },
      ]);

      const res = await request(app)
        .get(`/api/candidates/${OUT_OF_SCOPE_CANDIDATE_ID}`)
        .set('x-test-role', 'interviewer')
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/无权/);
    });
  });
});
