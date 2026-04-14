import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import offerRoutes from '../../src/routes/offers';
import { offerService } from '../../src/services/offer.service';
import { errorHandler } from '../../src/middleware/errorHandler';

// Mock offer service
vi.mock('../../src/services/offer.service', () => ({
  offerService: {
    getOffers: vi.fn(),
    getOfferByCandidateId: vi.fn(),
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
    updateOfferResult: vi.fn(),
    markAsJoined: vi.fn(),
    deleteOffer: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'test@test.com', role: 'admin' };
    next();
  },
}));

describe('Offer 模块 API 测试', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/offers', offerRoutes);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  describe('POST /api/offers - 创建 Offer', () => {
    const validOffer = {
      candidateId: 'clh12345678901234567890123',
      salary: '25000元/月',
      offerDate: '2024-01-20T00:00:00Z',
      expectedJoinDate: '2024-02-01T00:00:00Z',
      note: '期待加入',
    };

    it('应成功创建 Offer', async () => {
      const mockOffer = {
        id: 'offer-1',
        candidateId: validOffer.candidateId,
        salary: validOffer.salary,
        offerDate: new Date(validOffer.offerDate),
        expectedJoinDate: new Date(validOffer.expectedJoinDate),
        note: validOffer.note,
        result: 'pending',
        joined: false,
        createdAt: new Date().toISOString(),
      };
      vi.mocked(offerService.createOffer).mockResolvedValue(mockOffer as any);

      const res = await request(app)
        .post('/api/offers')
        .send(validOffer)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.result).toBe('pending');
      expect(offerService.createOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: validOffer.candidateId,
          salary: validOffer.salary,
        })
      );
    });

    it('应验证候选人ID格式', async () => {
      const res = await request(app)
        .post('/api/offers')
        .send({ ...validOffer, candidateId: 'invalid-id' })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证必填字段（薪资）', async () => {
      const res = await request(app)
        .post('/api/offers')
        .send({ ...validOffer, salary: '' })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证日期格式', async () => {
      const res = await request(app)
        .post('/api/offers')
        .send({ ...validOffer, offerDate: 'invalid-date' })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应处理候选人不存在', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(offerService.createOffer).mockRejectedValue(new AppError('候选人不存在', 404));

      const res = await request(app)
        .post('/api/offers')
        .send(validOffer)
        .expect(404);

      expect(res.body).toBeDefined();
    });

    it('应处理候选人已有 Offer', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(offerService.createOffer).mockRejectedValue(new AppError('该候选人已有 Offer', 409));

      const res = await request(app)
        .post('/api/offers')
        .send(validOffer)
        .expect(409);

      expect(res.body).toBeDefined();
    });
  });

  describe('PATCH /api/offers/:candidateId - 更新 Offer', () => {
    it('应成功更新 Offer 信息', async () => {
      const mockOffer = {
        id: 'offer-1',
        salary: '28000元/月',
        offerDate: new Date(),
        result: 'pending',
      };
      vi.mocked(offerService.updateOffer).mockResolvedValue(mockOffer as any);

      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123')
        .send({ salary: '28000元/月' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(offerService.updateOffer).toHaveBeenCalledWith(
        'clh12345678901234567890123',
        expect.objectContaining({ salary: '28000元/月' })
      );
    });

    it('应支持更新薪资', async () => {
      vi.mocked(offerService.updateOffer).mockResolvedValue({} as any);

      await request(app)
        .patch('/api/offers/clh12345678901234567890123')
        .send({ salary: '30000元/月' })
        .expect(200);

      expect(offerService.updateOffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ salary: '30000元/月' })
      );
    });

    it('应支持更新预计入职日期', async () => {
      vi.mocked(offerService.updateOffer).mockResolvedValue({} as any);

      await request(app)
        .patch('/api/offers/clh12345678901234567890123')
        .send({ expectedJoinDate: '2024-03-01T00:00:00Z' })
        .expect(200);

      expect(offerService.updateOffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ expectedJoinDate: '2024-03-01T00:00:00Z' })
      );
    });

    it('更新为 accepted 时应自动推进入职阶段', async () => {
      const mockOffer = {
        id: 'offer-1',
        result: 'accepted',
        joined: true,
        actualJoinDate: new Date(),
      };
      vi.mocked(offerService.updateOffer).mockResolvedValue(mockOffer as any);

      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123')
        .send({ result: 'accepted' })
        .expect(200);

      expect(res.body.success).toBe(true);
      // 验证服务层被调用时包含 result: accepted
      expect(offerService.updateOffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ result: 'accepted' })
      );
    });

    it('应验证 result 枚举值', async () => {
      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123')
        .send({ result: 'invalid' })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应验证日期格式', async () => {
      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123')
        .send({ offerDate: 'not-a-date' })
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });

  describe('PATCH /api/offers/:candidateId/result - 更新 Offer 结果', () => {
    it('应成功更新结果为 accepted', async () => {
      vi.mocked(offerService.updateOfferResult).mockResolvedValue({ result: 'accepted' } as any);

      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123/result')
        .send({ result: 'accepted' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(offerService.updateOfferResult).toHaveBeenCalledWith(
        'clh12345678901234567890123',
        'accepted'
      );
    });

    it('应成功更新结果为 rejected', async () => {
      vi.mocked(offerService.updateOfferResult).mockResolvedValue({ result: 'rejected' } as any);

      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123/result')
        .send({ result: 'rejected' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('应验证 result 枚举值', async () => {
      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123/result')
        .send({ result: 'unknown' })
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });

  describe('PATCH /api/offers/:candidateId/join - 标记入职', () => {
    it('应成功标记入职', async () => {
      const mockOffer = {
        id: 'offer-1',
        joined: true,
        actualJoinDate: new Date('2024-02-01'),
      };
      vi.mocked(offerService.markAsJoined).mockResolvedValue(mockOffer as any);

      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123/join')
        .send({ actualJoinDate: '2024-02-01T00:00:00Z' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(offerService.markAsJoined).toHaveBeenCalledWith(
        'clh12345678901234567890123',
        '2024-02-01T00:00:00Z'
      );
    });

    it('应验证日期格式', async () => {
      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123/join')
        .send({ actualJoinDate: 'invalid-date' })
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应处理候选人未接受 Offer', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(offerService.markAsJoined).mockRejectedValue(
        new AppError('候选人尚未接受 Offer，无法标记入职', 400)
      );

      const res = await request(app)
        .patch('/api/offers/clh12345678901234567890123/join')
        .send({ actualJoinDate: '2024-02-01T00:00:00Z' })
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/offers - Offer 列表', () => {
    it('应返回 Offer 列表（含分页）', async () => {
      const mockResult = {
        offers: [
          {
            id: 'offer-1',
            candidateId: 'candidate-1',
            salary: '25000元/月',
            result: 'pending',
            candidate: {
              id: 'candidate-1',
              name: '张三',
              email: 'zhangsan@test.com',
              phone: '13800138000',
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };
      vi.mocked(offerService.getOffers).mockResolvedValue(mockResult as any);

      const res = await request(app)
        .get('/api/offers?page=1&pageSize=10')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('应支持按结果筛选', async () => {
      vi.mocked(offerService.getOffers).mockResolvedValue({
        offers: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      } as any);

      await request(app)
        .get('/api/offers?result=accepted')
        .expect(200);

      expect(offerService.getOffers).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'accepted' })
      );
    });

    it('应支持分页参数', async () => {
      await request(app)
        .get('/api/offers?page=2&pageSize=20')
        .expect(200);

      expect(offerService.getOffers).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 })
      );
    });
  });

  describe('GET /api/offers/:candidateId - 获取候选人 Offer', () => {
    it('应返回候选人 Offer 详情', async () => {
      const mockOffer = {
        id: 'offer-1',
        salary: '25000元/月',
        result: 'pending',
        candidate: {
          id: 'candidate-1',
          name: '张三',
          email: 'zhangsan@test.com',
          phone: '13800138000',
          candidateJobs: [{ job: { id: 'job-1', title: '前端工程师' } }],
        },
      };
      vi.mocked(offerService.getOfferByCandidateId).mockResolvedValue(mockOffer as any);

      const res = await request(app)
        .get('/api/offers/clh12345678901234567890123')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.candidate).toBeDefined();
      expect(res.body.data.candidate.candidateJobs).toBeDefined();
    });

    it('应验证候选人ID格式', async () => {
      const res = await request(app)
        .get('/api/offers/invalid-id')
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应处理 Offer 不存在', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(offerService.getOfferByCandidateId).mockRejectedValue(
        new AppError('该候选人暂无 Offer', 404)
      );

      const res = await request(app)
        .get('/api/offers/clh12345678901234567890123')
        .expect(404);

      expect(res.body).toBeDefined();
    });
  });

  describe('DELETE /api/offers/:candidateId - 删除 Offer', () => {
    it('应成功删除 Offer', async () => {
      vi.mocked(offerService.deleteOffer).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/offers/clh12345678901234567890123')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('应验证候选人ID格式', async () => {
      const res = await request(app)
        .delete('/api/offers/invalid-id')
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('应处理 Offer 不存在', async () => {
      const { AppError } = await import('../../src/middleware/errorHandler');
      vi.mocked(offerService.deleteOffer).mockRejectedValue(
        new AppError('该候选人暂无 Offer', 404)
      );

      const res = await request(app)
        .delete('/api/offers/clh12345678901234567890123')
        .expect(404);

      expect(res.body).toBeDefined();
    });
  });
});
