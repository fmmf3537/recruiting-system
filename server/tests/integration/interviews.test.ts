import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  interview: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  interviewEvaluation: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  candidate: { count: vi.fn(), findUnique: vi.fn() },
  operationLog: { create: vi.fn() },
  notification: { create: vi.fn() },
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

import interviewRoutes from '../../src/routes/interviews';
import { errorHandler } from '../../src/middleware/errorHandler';

const INTERVIEW_ID = 'clhinterview0000000000001';
const CANDIDATE_ID = 'clhcandidate0000000000001';

function scheduledRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERVIEW_ID,
    round: '初试',
    type: '现场',
    interviewers: [{ id: 'u1', name: '甲' }],
    scheduledAt: new Date('2026-09-20T02:00:00.000Z'),
    duration: 60,
    location: '会议室A',
    notes: null,
    status: 'scheduled',
    focusType: null,
    candidateId: CANDIDATE_ID,
    jobId: null,
    createdById: 'user-hr',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    candidate: { id: CANDIDATE_ID, name: '张三', createdById: 'user-hr' },
    job: null,
    createdBy: { id: 'user-hr', name: 'HR' },
    evaluations: [],
    ...overrides,
  };
}

describe('INTV-EDIT 面试修改/取消接口权限', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/interviews', interviewRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();
    mockPrisma.candidate.count.mockResolvedValue(1);
    mockPrisma.candidate.findUnique.mockResolvedValue({
      id: CANDIDATE_ID,
      name: '张三',
      createdById: 'user-hr',
    });
    mockPrisma.interview.findMany.mockResolvedValue([]);
    mockPrisma.interview.count.mockResolvedValue(0);
    mockPrisma.interviewEvaluation.findMany.mockResolvedValue([]);
    mockPrisma.operationLog.create.mockResolvedValue({});
    mockPrisma.notification.create.mockResolvedValue({});
  });

  describe('PATCH /api/interviews/:id', () => {
    function mockUpdatable() {
      mockPrisma.interview.findUnique.mockResolvedValue(scheduledRow());
      mockPrisma.interview.update.mockResolvedValue(
        scheduledRow({ location: '会议室B' })
      );
    }

    it('admin 可修改 scheduled 面试', async () => {
      mockUpdatable();
      const res = await request(app)
        .patch(`/api/interviews/${INTERVIEW_ID}`)
        .send({ location: '会议室B' })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(mockPrisma.interview.update).toHaveBeenCalled();
    });

    it('hr 可修改 scheduled 面试', async () => {
      mockUpdatable();
      const res = await request(app)
        .patch(`/api/interviews/${INTERVIEW_ID}`)
        .set('x-test-role', 'hr')
        .send({ location: '会议室B' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('hiring_manager → 403', async () => {
      mockUpdatable();
      const res = await request(app)
        .patch(`/api/interviews/${INTERVIEW_ID}`)
        .set('x-test-role', 'hiring_manager')
        .send({ location: '会议室B' })
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(mockPrisma.interview.update).not.toHaveBeenCalled();
    });

    it('interviewer → 403', async () => {
      mockUpdatable();
      await request(app)
        .patch(`/api/interviews/${INTERVIEW_ID}`)
        .set('x-test-role', 'interviewer')
        .send({ location: '会议室B' })
        .expect(403);
      expect(mockPrisma.interview.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/interviews/:id/cancel', () => {
    function mockCancellable() {
      mockPrisma.interview.findUnique.mockResolvedValue(scheduledRow());
      mockPrisma.interview.update.mockResolvedValue(scheduledRow({ status: 'cancelled' }));
    }

    it('admin 可取消', async () => {
      mockCancellable();
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .send({ reason: '候选人改期' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('hr 可取消', async () => {
      mockCancellable();
      const res = await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'hr')
        .send({ reason: '候选人改期' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('hiring_manager → 403', async () => {
      mockCancellable();
      await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'hiring_manager')
        .expect(403);
      expect(mockPrisma.interview.update).not.toHaveBeenCalled();
    });

    it('interviewer → 403', async () => {
      mockCancellable();
      await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'interviewer')
        .expect(403);
    });
  });

  describe('取消后列表状态', () => {
    it('scheduled → cancelled 后按 status=cancelled 筛选可见', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(scheduledRow());
      mockPrisma.interview.update.mockResolvedValue(scheduledRow({ status: 'cancelled' }));

      await request(app)
        .post(`/api/interviews/${INTERVIEW_ID}/cancel`)
        .set('x-test-role', 'hr')
        .send({ reason: '改期' })
        .expect(200);

      mockPrisma.interview.findMany.mockResolvedValue([
        scheduledRow({ status: 'cancelled' }),
      ]);
      mockPrisma.interview.count.mockResolvedValue(1);

      const listRes = await request(app)
        .get('/api/interviews')
        .query({ status: 'cancelled' })
        .set('x-test-role', 'hr')
        .expect(200);

      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].status).toBe('cancelled');
    });
  });
});
