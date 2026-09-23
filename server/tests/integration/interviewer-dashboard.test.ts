import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import interviewWorkbenchRoutes from '../../src/routes/interview';
import evaluationRoutes from '../../src/routes/evaluations';
import { errorHandler } from '../../src/middleware/errorHandler';

const mockPrisma = vi.hoisted(() => ({
  interview: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  interviewEvaluation: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
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
}));

const ASSIGNED_ID = 'clhinterview0000000000001';
const OTHER_ID = 'clhinterview0000000000002';
const ASSIGNED_EVALUATION_ID = 'clhevaluation000000000001';
const OTHER_EVALUATION_ID = 'clhevaluation000000000002';
const EVAL_BODY = {
  dimensions: [{ name: '技术能力', score: 4, comment: '' }],
  overallScore: 4,
  conclusion: 'pass',
};

const WORKBENCH_GETS = [
  '/api/interview/today',
  '/api/interview/pending-evaluations',
  '/api/interview/history',
];

function isVisibilityQuery(args: { select?: { interviewers?: boolean } } | undefined): boolean {
  return Boolean(args?.select?.interviewers);
}

describe('interviewer 工作台', () => {
  let app: express.Application;
  let submitted: boolean;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/interview', interviewWorkbenchRoutes);
    app.use('/api/evaluations', evaluationRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();
    submitted = false;

    mockPrisma.interview.findMany.mockImplementation(async (args: {
      select?: { interviewers?: boolean };
      include?: { evaluations?: unknown };
    }) => {
      if (isVisibilityQuery(args)) {
        return [
          { id: ASSIGNED_ID, interviewers: [{ id: 'user-1', name: '甲' }] },
          { id: OTHER_ID, interviewers: [{ id: 'user-2', name: '乙' }] },
        ];
      }
      const evaluations = submitted
        ? [{ interviewerId: 'user-1', submittedAt: new Date(), overallScore: 4, conclusion: 'pass' }]
        : [{ interviewerId: 'user-1', submittedAt: null, overallScore: null, conclusion: null }];
      return [
        {
          id: ASSIGNED_ID,
          status: 'completed',
          scheduledAt: new Date(),
          duration: 60,
          candidate: { id: 'c1', name: '张三' },
          job: { id: 'j1', title: '前端' },
          evaluations,
        },
      ];
    });

    mockPrisma.interview.findUnique.mockResolvedValue({
      id: ASSIGNED_ID,
      status: 'completed',
      feedbackStatus: 'pending',
    });
    mockPrisma.interviewEvaluation.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      interviewId: where.id === ASSIGNED_EVALUATION_ID ? ASSIGNED_ID : OTHER_ID,
      interviewerId: where.id === ASSIGNED_EVALUATION_ID ? 'user-1' : 'user-2',
    }));
    mockPrisma.interviewEvaluation.count.mockResolvedValue(1);
    mockPrisma.interviewEvaluation.update.mockImplementation(async ({ data }: { data: { overallScore: number } }) => {
      submitted = true;
      return {
        id: ASSIGNED_EVALUATION_ID,
        interviewId: ASSIGNED_ID,
        interviewerId: 'user-1',
        overallScore: data.overallScore,
        conclusion: 'pass',
        submittedAt: new Date(),
      };
    });
  });

  it('interviewer 访问 4 个端点都返回 200', async () => {
    for (const path of WORKBENCH_GETS) {
      const res = await request(app).get(path).set('x-test-role', 'interviewer').expect(200);
      expect(res.body.success).toBe(true);
    }
    const putRes = await request(app)
      .put(`/api/evaluations/${ASSIGNED_EVALUATION_ID}`)
      .set('x-test-role', 'interviewer')
      .send(EVAL_BODY)
      .expect(200);
    expect(putRes.body.success).toBe(true);
  });

  it('interviewer 只能看到自己被指派的面试（不被指派 → 空数组）', async () => {
    await request(app)
      .get('/api/interview/today')
      .set('x-test-role', 'interviewer')
      .expect(200);

    const listCalls = mockPrisma.interview.findMany.mock.calls.filter(
      (call: [{ select?: unknown }]) => !isVisibilityQuery(call[0])
    );
    expect(listCalls[0][0].where.id).toEqual({ in: [ASSIGNED_ID] });

    mockPrisma.interview.findMany.mockImplementation(async (args: {
      select?: { interviewers?: boolean };
    }) => {
      if (isVisibilityQuery(args)) {
        return [{ id: OTHER_ID, interviewers: [{ id: 'user-2' }] }];
      }
      return [];
    });

    const emptyRes = await request(app)
      .get('/api/interview/today')
      .set('x-test-role', 'interviewer')
      .expect(200);
    expect(emptyRes.body.data).toEqual([]);
  });

  it('hr 不能访问面试工作台，但评估归属本人时可提交；hiring_manager 可访问工作台', async () => {
    // 工作台按角色控制，评估提交按预生成的评估记录归属控制。
    for (const path of WORKBENCH_GETS) {
      await request(app).get(path).set('x-test-role', 'hr').expect(403);
      await request(app).get(path).set('x-test-role', 'hiring_manager').expect(200);
    }
    await request(app)
      .put(`/api/evaluations/${ASSIGNED_EVALUATION_ID}`)
      .set('x-test-role', 'hr')
      .send(EVAL_BODY)
      .expect(200);
    await request(app)
      .put(`/api/evaluations/${ASSIGNED_EVALUATION_ID}`)
      .set('x-test-role', 'hiring_manager')
      .send(EVAL_BODY)
      .expect(200);
  });

  it('interviewer 试图评估不被指派的面试返回 403', async () => {
    const res = await request(app)
      .put(`/api/evaluations/${OTHER_EVALUATION_ID}`)
      .set('x-test-role', 'interviewer')
      .send(EVAL_BODY)
      .expect(403);
    expect(res.body.error).toBe('只能提交本人的面试评估');
    expect(mockPrisma.interviewEvaluation.update).not.toHaveBeenCalled();
  });

  it('interviewer 评估后，pending 列表少一条、history 多一条', async () => {
    const pendingBefore = await request(app)
      .get('/api/interview/pending-evaluations')
      .set('x-test-role', 'interviewer')
      .expect(200);
    expect(pendingBefore.body.data).toHaveLength(1);

    const historyBefore = await request(app)
      .get('/api/interview/history')
      .set('x-test-role', 'interviewer')
      .expect(200);
    expect(historyBefore.body.data).toHaveLength(0);

    await request(app)
      .put(`/api/evaluations/${ASSIGNED_EVALUATION_ID}`)
      .set('x-test-role', 'interviewer')
      .send(EVAL_BODY)
      .expect(200);

    const pendingAfter = await request(app)
      .get('/api/interview/pending-evaluations')
      .set('x-test-role', 'interviewer')
      .expect(200);
    expect(pendingAfter.body.data).toHaveLength(0);

    const historyAfter = await request(app)
      .get('/api/interview/history')
      .set('x-test-role', 'interviewer')
      .expect(200);
    expect(historyAfter.body.data).toHaveLength(1);
  });

  it('interviewer 改自己已填的评估，overallScore 更新', async () => {
    submitted = true;
    const res = await request(app)
      .put(`/api/evaluations/${ASSIGNED_EVALUATION_ID}`)
      .set('x-test-role', 'interviewer')
      .send({ ...EVAL_BODY, overallScore: 5 })
      .expect(200);

    expect(res.body.data.overallScore).toBe(5);
    expect(mockPrisma.interviewEvaluation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSIGNED_EVALUATION_ID },
        data: expect.objectContaining({ overallScore: 5 }),
      })
    );
  });
});
