import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import evaluationRoutes from '../../src/routes/evaluations';
import { errorHandler } from '../../src/middleware/errorHandler';

// Mock prisma（使用真实 service 层，仅替换数据库访问）
const mockPrisma = vi.hoisted(() => ({
  interviewEvaluation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock auth middleware：默认 user-1，可通过 x-test-user-id 切换用户
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      userId: (req.headers['x-test-user-id'] as string) || 'user-1',
      email: 'test@test.com',
      role: 'member',
      department: null,
    };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

// 合法的 cuid 格式 ID（路由层 zod 校验）
const EVALUATION_ID = 'clh12345678901234567890123';

const submitBody = {
  dimensions: [{ name: '专业能力', score: 4, comment: '基础扎实' }],
  overallScore: 4,
  conclusion: 'pass',
};

describe('面试评估接口（越权防护）', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/evaluations', evaluationRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();
  });

  it('面试官本人提交评估应成功', async () => {
    mockPrisma.interviewEvaluation.findUnique.mockResolvedValue({
      id: EVALUATION_ID,
      interviewerId: 'user-1',
    });
    mockPrisma.interviewEvaluation.update.mockResolvedValue({
      id: EVALUATION_ID,
      interviewerId: 'user-1',
      ...submitBody,
      submittedAt: new Date(),
    });

    const res = await request(app)
      .put(`/api/evaluations/${EVALUATION_ID}`)
      .send(submitBody)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockPrisma.interviewEvaluation.update).toHaveBeenCalled();
  });

  it('提交他人的评估应返回 403', async () => {
    // 评估归属于 user-2，当前登录用户为 user-1
    mockPrisma.interviewEvaluation.findUnique.mockResolvedValue({
      id: EVALUATION_ID,
      interviewerId: 'user-2',
    });

    const res = await request(app)
      .put(`/api/evaluations/${EVALUATION_ID}`)
      .send(submitBody)
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(mockPrisma.interviewEvaluation.update).not.toHaveBeenCalled();
  });

  it('评估记录不存在时应返回 404', async () => {
    mockPrisma.interviewEvaluation.findUnique.mockResolvedValue(null);

    await request(app).put(`/api/evaluations/${EVALUATION_ID}`).send(submitBody).expect(404);
  });

  it('缺少必填字段时应返回 400', async () => {
    await request(app)
      .put(`/api/evaluations/${EVALUATION_ID}`)
      .send({ overallScore: 4 })
      .expect(400);
  });

  it('我的评估列表只返回本人的评估', async () => {
    mockPrisma.interviewEvaluation.findMany.mockResolvedValue([]);
    mockPrisma.interviewEvaluation.count.mockResolvedValue(0);

    await request(app)
      .get('/api/evaluations/my?status=pending')
      .set('x-test-user-id', 'user-9')
      .expect(200);

    expect(mockPrisma.interviewEvaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { interviewerId: 'user-9', submittedAt: null },
      })
    );
  });
});
