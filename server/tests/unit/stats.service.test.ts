import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => ({
  default: {
    user: {
      findMany: vi.fn(),
    },
    candidate: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    stageRecord: {
      count: vi.fn(),
    },
    interviewFeedback: {
      count: vi.fn(),
    },
    offer: {
      count: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
    },
    candidateJob: {
      findMany: vi.fn(),
    },
  },
}));

import { StatsService } from '../../src/services/stats.service';
import prisma from '../../src/lib/prisma';

describe('StatsService - 统计服务单元测试', () => {
  let service: StatsService;

  beforeEach(() => {
    service = new StatsService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('parseDateRange - 解析日期范围', () => {
    it('应正确解析日期字符串', () => {
      const result = service.parseDateRange('2024-01-01', '2024-01-31');

      expect(result.startDate).toEqual(new Date('2024-01-01'));
      expect(result.endDate).toEqual(new Date('2024-01-31'));
    });

    it('无参数时应返回默认日期范围（当年）', () => {
      const result = service.parseDateRange();
      const now = new Date();

      expect(result.startDate.getFullYear()).toBe(now.getFullYear());
      expect(result.startDate.getMonth()).toBe(0);
      expect(result.startDate.getDate()).toBe(1);
    });
  });

  describe('getWorkloadStats - 工作量统计', () => {
    it('应返回用户工作量统计', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'user-1', name: '张三' },
        { id: 'user-2', name: '李四' },
      ] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(10);
      vi.mocked(prisma.stageRecord.count).mockResolvedValue(5);
      vi.mocked(prisma.interviewFeedback.count).mockResolvedValue(8);
      vi.mocked(prisma.offer.count).mockResolvedValue(3);

      const result = await service.getWorkloadStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).toHaveProperty('userName');
      expect(result[0]).toHaveProperty('newCandidates');
    });

    it('应过滤掉全为0的用户数据', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'user-1', name: '张三' },
        { id: 'user-2', name: '李四' },
      ] as any);
      vi.mocked(prisma.candidate.count)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);
      vi.mocked(prisma.stageRecord.count).mockResolvedValue(0);
      vi.mocked(prisma.interviewFeedback.count).mockResolvedValue(0);
      vi.mocked(prisma.offer.count).mockResolvedValue(0);

      const result = await service.getWorkloadStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].userName).toBe('张三');
    });
  });

  describe('getChannelStats - 渠道效果分析', () => {
    it('应返回渠道统计数据（含转化率）', async () => {
      vi.mocked(prisma.candidate.groupBy)
        .mockResolvedValueOnce([
          { source: '招聘网站', _count: { id: 50 } },
          { source: '内部推荐', _count: { id: 20 } },
        ] as any)
        .mockResolvedValueOnce([
          { source: '招聘网站', _count: { id: 10 } },
          { source: '内部推荐', _count: { id: 8 } },
        ] as any);

      const result = await service.getChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('source');
      expect(result[0]).toHaveProperty('candidateCount');
      expect(result[0]).toHaveProperty('hiredCount');
      expect(result[0]).toHaveProperty('conversionRate');
    });

    it('无入职数据时转化率应为0', async () => {
      vi.mocked(prisma.candidate.groupBy)
        .mockResolvedValueOnce([
          { source: '招聘网站', _count: { id: 50 } },
        ] as any)
        .mockResolvedValueOnce([] as any);

      const result = await service.getChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result[0].hiredCount).toBe(0);
      expect(result[0].conversionRate).toBe(0);
    });
  });

  describe('getJobStats - 职位维度统计', () => {
    it('应返回职位统计数据', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([
        {
          id: 'job-1',
          title: '前端工程师',
          departments: JSON.stringify(['技术部']),
        },
      ] as any);
      vi.mocked(prisma.candidateJob.findMany).mockResolvedValue([
        { candidateId: 'c1' },
        { candidateId: 'c2' },
      ] as any);
      vi.mocked(prisma.interviewFeedback.count).mockResolvedValue(5);
      vi.mocked(prisma.offer.count).mockResolvedValue(2);

      const result = await service.getJobStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('jobId');
      expect(result[0]).toHaveProperty('jobTitle');
      expect(result[0]).toHaveProperty('department');
    });

    it('应过滤掉没有候选人的职位', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([
        {
          id: 'job-1',
          title: '前端工程师',
          departments: JSON.stringify(['技术部']),
        },
        {
          id: 'job-2',
          title: '后端工程师',
          departments: JSON.stringify(['技术部']),
        },
      ] as any);
      vi.mocked(prisma.candidateJob.findMany)
        .mockResolvedValueOnce([{ candidateId: 'c1' }])
        .mockResolvedValueOnce([]);

      const result = await service.getJobStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].jobTitle).toBe('前端工程师');
    });
  });

  describe('exportWorkloadStats - 导出工作量统计', () => {
    it('应返回正确的导出数据结构', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'user-1', name: '张三' },
      ] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(10);
      vi.mocked(prisma.stageRecord.count).mockResolvedValue(5);
      vi.mocked(prisma.interviewFeedback.count).mockResolvedValue(8);
      vi.mocked(prisma.offer.count).mockResolvedValue(3);

      const result = await service.exportWorkloadStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result.headers).toEqual(['成员', '新增候选人', '阶段推进', '面试次数', '发放 Offer']);
      expect(result.rows).toHaveLength(1);
      expect(result.filename).toContain('工作量统计');
    });
  });
});
