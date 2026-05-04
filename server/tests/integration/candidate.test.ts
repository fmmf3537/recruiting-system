import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import candidateRoutes from '../../src/routes/candidates';
import { candidateService } from '../../src/services/candidate.service';
import { errorHandler } from '../../src/middleware/errorHandler';

// Mock candidate service
vi.mock('../../src/services/candidate.service', () => ({
  candidateService: {
    createCandidate: vi.fn(),
    getCandidates: vi.fn(),
    getCandidateById: vi.fn(),
    updateCandidate: vi.fn(),
    advanceStage: vi.fn(),
    addInterviewFeedback: vi.fn(),
    getInterviewFeedbacks: vi.fn(),
    deleteCandidate: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'test@test.com', role: 'admin' };
    next();
  },
  authorize: () => (req: any, res: any, next: any) => next(),
  getUserDepartment: () => undefined,
}));

describe('候选人模块 API 测试', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/candidates', candidateRoutes);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  describe('POST /api/candidates - 创建候选人', () => {
    const validCandidate = {
      name: '张三',
      phone: '13800138000',
      email: 'zhangsan@test.com',
      gender: '男',
      age: 28,
      education: '本科',
      source: '招聘网站',
    };

    it('应成功创建候选人（无重复）', async () => {
      const mockResult = {
        candidate: {
          id: 'candidate-1',
          ...validCandidate,
          createdById: 'user-1',
          createdAt: new Date().toISOString(),
        },
      };
      vi.mocked(candidateService.createCandidate).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/candidates')
        .send(validCandidate)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(candidateService.createCandidate).toHaveBeenCalledWith(
        expect.objectContaining(validCandidate),
        'user-1'
      );
    });

    it('应成功创建候选人但返回重复警告', async () => {
      const mockResult = {
        candidate: {
          id: 'candidate-1',
          ...validCandidate,
          createdById: 'user-1',
          createdAt: new Date().toISOString(),
        },
        warning: '发现重复候选人',
        duplicates: [
          {
            id: 'candidate-existing',
            name: '张三',
            phone: '13800138000',
            email: 'zhangsan@test.com',
            currentStage: '初筛',
            status: 'in_progress',
            createdAt: new Date(),
          },
        ],
      };
      vi.mocked(candidateService.createCandidate).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/candidates')
        .send(validCandidate)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.warning).toBe('发现重复候选人');
      expect(res.body.duplicates).toHaveLength(1);
    });

    it('创建接口不校验必填字段（由Service处理）', async () => {
      vi.mocked(candidateService.createCandidate).mockResolvedValue({
        candidate: { id: 'candidate-1', name: '张' },
      } as any);

      const res = await request(app)
        .post('/api/candidates')
        .send({ name: '张' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/candidates - 候选人列表', () => {
    it('应返回候选人列表（含分页）', async () => {
      const mockResult = {
        candidates: [
          {
            id: 'candidate-1',
            name: '张三',
            phone: '13800138000',
            email: 'zhangsan@test.com',
            currentStage: '初筛',
            stageStatus: 'in_progress',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };
      vi.mocked(candidateService.getCandidates).mockResolvedValue(mockResult);

      const res = await request(app)
        .get('/api/candidates?page=1&pageSize=10')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('应支持关键词搜索', async () => {
      vi.mocked(candidateService.getCandidates).mockResolvedValue({
        candidates: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      await request(app)
        .get('/api/candidates?keyword=zhangsan')
        .expect(200);

      expect(candidateService.getCandidates).toHaveBeenCalled();
    });

    it('应支持阶段筛选', async () => {
      await request(app)
        .get('/api/candidates?stage=screening')
        .expect(200);

      expect(candidateService.getCandidates).toHaveBeenCalled();
    });

    it('应支持分页参数', async () => {
      await request(app)
        .get('/api/candidates?page=2&pageSize=20')
        .expect(200);

      expect(candidateService.getCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 })
      );
    });
  });

  describe('GET /api/candidates/:id - 候选人详情', () => {
    it('应返回候选人详情（含关联数据）', async () => {
      const mockCandidate = {
        id: 'clh12345678901234567890123',
        name: '张三',
        phone: '13800138000',
        email: 'zhangsan@test.com',
        stageRecords: [
          {
            id: 'sr-1',
            stage: '入库',
            status: 'passed',
            rejectReason: null,
            assignee: null,
            enteredAt: new Date(),
            completedAt: new Date(),
            note: null,
          },
        ],
        interviewFeedbacks: [],
        offer: null,
        jobs: [],
      };
      vi.mocked(candidateService.getCandidateById).mockResolvedValue(mockCandidate as any);

      const res = await request(app)
        .get('/api/candidates/clh12345678901234567890123')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('stageRecords');
      expect(res.body.data).toHaveProperty('interviewFeedbacks');
      expect(res.body.data).toHaveProperty('jobs');
    });

    it('应验证候选人ID格式', async () => {
      const res = await request(app)
        .get('/api/candidates/invalid-id')
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应处理候选人不存在', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(candidateService.getCandidateById).mockRejectedValue(
        new AppError('候选人不存在', 404)
      );

      const res = await request(app)
        .get('/api/candidates/clh12345678901234567890123')
        .expect(404);

      expect(res.body).toBeDefined();
    });
  });

  describe('POST /api/candidates/:id/stage - 流程推进', () => {
    it('应成功推进到下一阶段', async () => {
      vi.mocked(candidateService.advanceStage).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '初筛',
          status: 'passed',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('应验证阶段顺序（不能跳过）', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(candidateService.advanceStage).mockRejectedValue(
        new AppError('阶段推进必须按顺序：入库→初筛→复试→终面→拟录用→Offer→入职', 400)
      );

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '终面', // 跳过初筛和复试
          status: 'in_progress',
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证不能回退阶段', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(candidateService.advanceStage).mockRejectedValue(
        new AppError('不能回退到之前的阶段', 400)
      );

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '入库', // 回退
          status: 'in_progress',
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证淘汰时必须填写原因', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(candidateService.advanceStage).mockRejectedValue(
        new AppError('淘汰时必须填写原因', 400)
      );

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '初筛',
          status: 'rejected',
          // 缺少 rejectReason
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应成功淘汰候选人（含原因）', async () => {
      vi.mocked(candidateService.advanceStage).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '初筛',
          status: 'rejected',
          rejectReason: '技术能力不足',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('应验证阶段枚举值', async () => {
      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '无效阶段',
          status: 'in_progress',
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证状态枚举值', async () => {
      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/stage')
        .send({
          stage: '初筛',
          status: 'invalid_status',
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });

  describe('POST /api/candidates/:id/feedback - 添加面试反馈', () => {
    it('应成功添加面试反馈', async () => {
      vi.mocked(candidateService.addInterviewFeedback).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/feedback')
        .send({
          round: '初试',
          interviewerName: '李四',
          interviewTime: '2024-01-15T10:00:00Z',
          conclusion: 'pass',
          feedbackContent: '技术能力不错，沟通良好',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('应支持淘汰反馈', async () => {
      vi.mocked(candidateService.addInterviewFeedback).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/feedback')
        .send({
          round: '复试',
          interviewerName: '王五',
          interviewTime: '2024-01-16T14:00:00Z',
          conclusion: 'reject',
          feedbackContent: '技术深度不够',
          rejectReason: '算法能力不足',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('应验证反馈必填字段', async () => {
      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/feedback')
        .send({
          round: '初试',
          // 缺少其他必填字段
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证轮次枚举值', async () => {
      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/feedback')
        .send({
          round: '第四轮', // 无效值
          interviewerName: '李四',
          interviewTime: '2024-01-15T10:00:00Z',
          conclusion: 'pass',
          feedbackContent: '测试',
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证结论枚举值', async () => {
      const res = await request(app)
        .post('/api/candidates/clh12345678901234567890123/feedback')
        .send({
          round: '初试',
          interviewerName: '李四',
          interviewTime: '2024-01-15T10:00:00Z',
          conclusion: 'unknown', // 无效值
          feedbackContent: '测试',
        })
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/candidates/:id/feedback - 获取面试反馈', () => {
    it('应返回面试反馈列表', async () => {
      const mockFeedbacks = [
        {
          id: 'feedback-1',
          round: '初试',
          interviewerName: '李四',
          interviewTime: new Date('2024-01-15T10:00:00Z'),
          conclusion: 'pass',
          feedbackContent: '技术不错',
          rejectReason: null,
          createdBy: { id: 'user-1', name: '管理员' },
          createdAt: new Date(),
        },
      ];
      vi.mocked(candidateService.getInterviewFeedbacks).mockResolvedValue(mockFeedbacks as any);

      const res = await request(app)
        .get('/api/candidates/clh12345678901234567890123/feedback')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('round');
      expect(res.body.data[0]).toHaveProperty('conclusion');
    });
  });

  describe('PATCH /api/candidates/:id - 更新候选人', () => {
    it('应成功更新候选人信息', async () => {
      vi.mocked(candidateService.updateCandidate).mockResolvedValue({
        id: 'clh12345678901234567890123',
        name: '张三 Updated',
      } as any);

      const res = await request(app)
        .patch('/api/candidates/clh12345678901234567890123')
        .send({ name: '张三 Updated' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/candidates/:id - 删除候选人', () => {
    it('应成功删除候选人', async () => {
      vi.mocked(candidateService.deleteCandidate).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/candidates/clh12345678901234567890123')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
