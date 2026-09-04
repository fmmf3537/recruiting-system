import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  interview: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  interviewEvaluation: { upsert: vi.fn() },
  candidate: { count: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/llm', () => ({
  callLLM: vi.fn(),
  extractResumeInfo: vi.fn(),
}));

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

vi.mock('../../src/services/hr-score-event.service', () => ({
  emitScoreEvent: vi.fn(),
}));

// 不 mock requireRole：cancel / 工作台 guard 需走真实角色校验
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
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

import userRoutes from '../../src/routes/users';
import interviewWorkbenchRoutes from '../../src/routes/interview';
import interviewRoutes from '../../src/routes/interviews';
import { errorHandler } from '../../src/middleware/errorHandler';

const INTERVIEW_ID = 'clhinterview0000000000001';
const CANDIDATE_ID = 'clhcandidate0000000000001';

const EVAL_BODY = {
  dimensions: [{ name: '技术能力', score: 4, comment: '' }],
  overallScore: 4,
  conclusion: 'pass',
};

function isVisibilityQuery(args: { select?: { interviewers?: boolean } } | undefined): boolean {
  return Boolean(args?.select?.interviewers);
}

describe('INTV-S 面试权限修正', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/users', userRoutes);
    app.use('/api/interview', interviewWorkbenchRoutes);
    app.use('/api/interviews', interviewRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();

    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-int', name: '面试官甲', department: '技术部' },
      { id: 'u-hr', name: 'HR乙', department: '人力部' },
      { id: 'u-hm', name: '用人经理丙', department: '产品部' },
      { id: 'u-admin', name: '管理员丁', department: null },
    ]);

    mockPrisma.interview.findMany.mockResolvedValue([]);
    mockPrisma.interview.findUnique.mockResolvedValue(null);
    mockPrisma.interview.update.mockResolvedValue({ id: INTERVIEW_ID, status: 'completed' });
    mockPrisma.interviewEvaluation.upsert.mockResolvedValue({
      interviewId: INTERVIEW_ID,
      interviewerId: 'user-1',
      overallScore: 4,
      conclusion: 'pass',
      submittedAt: new Date(),
    });
    mockPrisma.candidate.count.mockResolvedValue(1);
  });

  describe('GET /api/users/interviewer-options', () => {
    it('无 token → 401', async () => {
      await request(app).get('/api/users/interviewer-options').set('x-test-role', 'none').expect(401);
    });

    it('hr 登录 → 200，仅 id/name/department，不含 email/phone', async () => {
      const res = await request(app)
        .get('/api/users/interviewer-options')
        .set('x-test-role', 'hr')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      for (const u of res.body.data) {
        expect(u).toHaveProperty('id');
        expect(u).toHaveProperty('name');
        expect(u).toHaveProperty('department');
        expect(u).not.toHaveProperty('email');
        expect(u).not.toHaveProperty('phone');
        expect(u).not.toHaveProperty('password');
      }
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ['interviewer', 'hr', 'hiring_manager', 'admin'] } },
        select: { id: true, name: true, department: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('GET /api/interview/today', () => {
    it('hiring_manager → 200（原 403 修复）', async () => {
      const res = await request(app)
        .get('/api/interview/today')
        .set('x-test-role', 'hiring_manager')
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('interviewer → 200', async () => {
      const res = await request(app)
        .get('/api/interview/today')
        .set('x-test-role', 'interviewer')
        .expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/interview/:id/evaluation', () => {
    it('hiring_manager 且是该场面试官 → 200', async () => {
      mockPrisma.interview.findMany.mockImplementation(async (args: {
        select?: { interviewers?: boolean };
      }) => {
        if (isVisibilityQuery(args)) {
          return [{ id: INTERVIEW_ID, interviewers: [{ id: 'user-1', name: '丙' }] }];
        }
        return [];
      });
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: INTERVIEW_ID,
        status: 'completed',
        interviewers: [{ id: 'user-1', name: '丙' }],
      });

      const res = await request(app)
        .put(`/api/interview/${INTERVIEW_ID}/evaluation`)
        .set('x-test-role', 'hiring_manager')
        .send(EVAL_BODY)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('hiring_manager 但不是该场面试官 → 403', async () => {
      mockPrisma.interview.findMany.mockImplementation(async (args: {
        select?: { interviewers?: boolean };
      }) => {
        if (isVisibilityQuery(args)) {
          return [{ id: INTERVIEW_ID, interviewers: [{ id: 'other-user', name: '乙' }] }];
        }
        return [];
      });

      const res = await request(app)
        .put(`/api/interview/${INTERVIEW_ID}/evaluation`)
        .set('x-test-role', 'hiring_manager')
        .send(EVAL_BODY)
        .expect(403);
      expect(res.body.error).toContain('无权评估');
    });
  });

  describe('POST /api/interviews/:id/complete', () => {
    function mockScheduledInterview(interviewers: Array<{ id: string; name: string }>) {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: INTERVIEW_ID,
        interviewers,
        status: 'scheduled',
        candidateId: CANDIDATE_ID,
        createdById: 'user-hr',
        notes: null,
      });
      mockPrisma.interview.update.mockResolvedValue({
        id: INTERVIEW_ID,
        status: 'completed',
        interviewers,
      });
    }

    it('该场 interviewer → 200', async () => {
      mockScheduledInterview([{ id: 'user-1', name: '甲' }]);
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/complete`)
        .set('x-test-role', 'interviewer')
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('不在 interviewers 里的 interviewer → 403', async () => {
      mockScheduledInterview([{ id: 'other-user', name: '乙' }]);
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/complete`)
        .set('x-test-role', 'interviewer')
        .expect(403);
      expect(res.body.error).toContain('仅参与本次面试的面试官可标记完成');
    });

    it('hiring_manager 是该场面试官 → 200', async () => {
      mockScheduledInterview([{ id: 'user-1', name: '丙' }]);
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/complete`)
        .set('x-test-role', 'hiring_manager')
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('admin → 200', async () => {
      mockScheduledInterview([{ id: 'other-user', name: '乙' }]);
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/complete`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/interviews/:id/cancel', () => {
    function mockCancellableInterview() {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: INTERVIEW_ID,
        interviewers: [{ id: 'user-1', name: '甲' }],
        status: 'scheduled',
        candidateId: CANDIDATE_ID,
        notes: null,
      });
      mockPrisma.interview.update.mockResolvedValue({
        id: INTERVIEW_ID,
        status: 'cancelled',
      });
      mockPrisma.candidate.count.mockResolvedValue(1);
    }

    it('hr → 200', async () => {
      mockCancellableInterview();
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'hr')
        .send({ reason: '候选人改期' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('admin → 200', async () => {
      mockCancellableInterview();
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('interviewer（即使该场面试官）→ 403', async () => {
      mockCancellableInterview();
      await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'interviewer')
        .expect(403);
    });

    it('hiring_manager → 403（cancel 仅 hr/admin）', async () => {
      mockCancellableInterview();
      await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'hiring_manager')
        .expect(403);
    });
  });
});
