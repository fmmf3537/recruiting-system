import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import statsRoutes from '../../src/routes/stats';
import { statsService } from '../../src/services/stats.service';
import prisma from '../../src/lib/prisma';
import { errorHandler } from '../../src/middleware/errorHandler';

// Mock stats service
vi.mock('../../src/services/stats.service', () => ({
  statsService: {
    getWorkloadStats: vi.fn(),
    getChannelStats: vi.fn(),
    getJobStats: vi.fn(),
    getFunnelStats: vi.fn(),
    exportWorkloadStats: vi.fn(),
    exportChannelStats: vi.fn(),
    exportJobStats: vi.fn(),
    parseDateRange: vi.fn((start, end) => ({
      startDate: start ? new Date(start) : new Date('2024-01-01'),
      endDate: end ? new Date(end) : new Date('2024-01-31'),
    })),
  },
}));

// Mock prisma for export routes
vi.mock('../../src/lib/prisma', () => ({
  default: {
    user: {
      findMany: vi.fn(),
    },
    candidate: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

// Mock auth middleware
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'test@test.com', role: 'admin' };
    next();
  },
}));

describe('统计模块 API 测试', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/stats', statsRoutes);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  describe('GET /api/stats/workload - 工作量统计', () => {
    it('应返回工作量统计数据', async () => {
      const mockStats = [
        {
          userId: 'user-1',
          userName: '张三',
          newCandidates: 10,
          stageAdvances: 5,
          interviews: 8,
          offers: 3,
        },
        {
          userId: 'user-2',
          userName: '李四',
          newCandidates: 5,
          stageAdvances: 3,
          interviews: 4,
          offers: 1,
        },
      ];
      vi.mocked(statsService.getWorkloadStats).mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/stats/workload')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('应支持日期范围查询', async () => {
      vi.mocked(statsService.getWorkloadStats).mockResolvedValue([] as any);

      await request(app)
        .get('/api/stats/workload?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(statsService.getWorkloadStats).toHaveBeenCalled();
    });

    it('应验证日期格式', async () => {
      const res = await request(app)
        .get('/api/stats/workload?startDate=invalid&endDate=2024-01-31')
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/stats/workload/export - 导出工作量统计', () => {
    it('应导出 CSV 文件', async () => {
      const mockUsers = [
        { id: 'user-1', name: '张三' },
        { id: 'user-2', name: '李四' },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(5);

      const res = await request(app)
        .get('/api/stats/workload/export')
        .expect(200);

      expect(res.headers['content-type']).toBeDefined();
    });
  });

  describe('GET /api/stats/channel - 渠道效果分析', () => {
    it('应返回渠道效果统计数据', async () => {
      const mockStats = [
        {
          source: '招聘网站',
          candidateCount: 50,
          hiredCount: 10,
          conversionRate: 20.00,
        },
        {
          source: '内部推荐',
          candidateCount: 20,
          hiredCount: 8,
          conversionRate: 40.00,
        },
      ];
      vi.mocked(statsService.getChannelStats).mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/stats/channel')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('应支持日期范围查询', async () => {
      vi.mocked(statsService.getChannelStats).mockResolvedValue([] as any);

      await request(app)
        .get('/api/stats/channel?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(statsService.getChannelStats).toHaveBeenCalled();
    });
  });

  describe('GET /api/stats/channel/export - 导出渠道效果分析', () => {
    it('应导出 CSV 文件', async () => {
      const mockStats = [
        { source: '招聘网站', candidateCount: 50, hiredCount: 10, conversionRate: 20.00 },
      ];
      vi.mocked(statsService.getChannelStats).mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/stats/channel/export?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(res.headers['content-type']).toBeDefined();
    });
  });

  describe('GET /api/stats/jobs - 职位维度统计', () => {
    it('应返回职位统计数据', async () => {
      const mockStats = [
        {
          jobId: 'job-1',
          jobTitle: '前端工程师',
          department: '技术部',
          candidateCount: 15,
          interviewCount: 10,
          offerCount: 5,
          hiredCount: 3,
        },
        {
          jobId: 'job-2',
          jobTitle: '后端工程师',
          department: '技术部',
          candidateCount: 10,
          interviewCount: 6,
          offerCount: 3,
          hiredCount: 2,
        },
      ];
      vi.mocked(statsService.getJobStats).mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/stats/jobs')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('应支持日期范围查询', async () => {
      vi.mocked(statsService.getJobStats).mockResolvedValue([] as any);

      await request(app)
        .get('/api/stats/jobs?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(statsService.getJobStats).toHaveBeenCalled();
    });
  });

  describe('GET /api/stats/jobs/export - 导出职位维度统计', () => {
    it('应导出 CSV 文件', async () => {
      const mockStats = [
        {
          jobId: 'job-1',
          jobTitle: '前端工程师',
          department: '技术部',
          candidateCount: 15,
          interviewCount: 10,
          offerCount: 5,
          hiredCount: 3,
        },
      ];
      vi.mocked(statsService.getJobStats).mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/stats/jobs/export?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(res.headers['content-type']).toBeDefined();
    });
  });

  describe('GET /api/stats/funnel - 招聘漏斗统计', () => {
    it('应返回漏斗统计数据', async () => {
      const mockStats = [
        { stage: '简历入库', count: 100 },
        { stage: '初筛通过', count: 60 },
        { stage: '复试通过', count: 30 },
        { stage: '终面通过', count: 15 },
        { stage: 'Offer接受', count: 8 },
        { stage: '成功入职', count: 5 },
      ];
      vi.mocked(statsService.getFunnelStats).mockResolvedValue(mockStats as any);

      const res = await request(app)
        .get('/api/stats/funnel')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(6);
      expect(res.body.data[0].stage).toBe('简历入库');
    });

    it('应支持日期范围查询', async () => {
      vi.mocked(statsService.getFunnelStats).mockResolvedValue([] as any);

      await request(app)
        .get('/api/stats/funnel?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(statsService.getFunnelStats).toHaveBeenCalled();
    });

    it('应验证日期格式', async () => {
      const res = await request(app)
        .get('/api/stats/funnel?startDate=invalid&endDate=2024-01-31')
        .expect(400);

      expect(res.body).toBeDefined();
    });
  });
});
