import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
const mockPrisma = {
  $queryRaw: vi.fn(),
  user: {
    findMany: vi.fn(),
  },
  candidate: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  stageRecord: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  interviewFeedback: {
    count: vi.fn(),
    findMany: vi.fn(),
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
  hCRequest: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

import { StatsService } from '../../src/services/stats.service';

describe('StatsService - 统计服务单元测试', () => {
  let service: StatsService;

  beforeEach(() => {
    service = new StatsService();
    // Reset all mocks to default implementations before each test
    vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(mockPrisma.user.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.candidate.count).mockResolvedValue(0);
    vi.mocked(mockPrisma.candidate.groupBy).mockResolvedValue([]);
    vi.mocked(mockPrisma.stageRecord.count).mockResolvedValue(0);
    vi.mocked(mockPrisma.stageRecord.groupBy).mockResolvedValue([]);
    vi.mocked(mockPrisma.interviewFeedback.count).mockResolvedValue(0);
    vi.mocked(mockPrisma.interviewFeedback.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.offer.count).mockResolvedValue(0);
    vi.mocked(mockPrisma.job.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.candidateJob.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.hCRequest.count).mockResolvedValue(0);
    vi.mocked(mockPrisma.hCRequest.findMany).mockResolvedValue([]);
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
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { userId: 'user-1', userName: '张三', newCandidates: 10, stageAdvances: 5, interviews: 8, offers: 3 },
        { userId: 'user-2', userName: '李四', newCandidates: 8, stageAdvances: 3, interviews: 4, offers: 2 },
      ]);

      const result = await service.getWorkloadStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).toHaveProperty('userName');
      expect(result[0]).toHaveProperty('newCandidates');
      expect(result[0].userName).toBe('张三');
    });

    it('应过滤掉全为0的用户数据', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { userId: 'user-1', userName: '张三', newCandidates: 10, stageAdvances: 5, interviews: 8, offers: 3 },
        { userId: 'user-2', userName: '李四', newCandidates: 0, stageAdvances: 0, interviews: 0, offers: 0 },
      ]);

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
      vi.mocked(mockPrisma.candidate.groupBy)
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
      vi.mocked(mockPrisma.candidate.groupBy)
        .mockResolvedValueOnce([{ source: '招聘网站', _count: { id: 50 } }] as any)
        .mockResolvedValueOnce([] as any);

      const result = await service.getChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result[0].hiredCount).toBe(0);
      expect(result[0].conversionRate).toBe(0);
    });

    it('应按候选人数量降序排序', async () => {
      vi.mocked(mockPrisma.candidate.groupBy)
        .mockResolvedValueOnce([
          { source: '渠道A', _count: { id: 10 } },
          { source: '渠道B', _count: { id: 50 } },
        ] as any)
        .mockResolvedValueOnce([] as any);

      const result = await service.getChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result[0].source).toBe('渠道B');
      expect(result[1].source).toBe('渠道A');
    });

    it('应正确计算转化率', async () => {
      vi.mocked(mockPrisma.candidate.groupBy)
        .mockResolvedValueOnce([{ source: '招聘网站', _count: { id: 100 } }] as any)
        .mockResolvedValueOnce([{ source: '招聘网站', _count: { id: 25 } }] as any);

      const result = await service.getChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result[0].conversionRate).toBe(25);
    });

    it('候选人为0时转化率应为0', async () => {
      vi.mocked(mockPrisma.candidate.groupBy)
        .mockResolvedValue([] as any);

      const result = await service.getChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('getJobStats - 职位维度统计', () => {
    it('应返回职位统计数据', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { jobId: 'job-1', jobTitle: '前端工程师', department: '技术部', candidateCount: 10, interviewCount: 5, offerCount: 3, hiredCount: 2 },
      ]);

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
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { jobId: 'job-1', jobTitle: '前端工程师', department: '技术部', candidateCount: 5, interviewCount: 0, offerCount: 0, hiredCount: 0 },
      ]);

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
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { userId: 'user-1', userName: '张三', newCandidates: 10, stageAdvances: 5, interviews: 8, offers: 3 },
      ]);

      const result = await service.exportWorkloadStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result.headers).toEqual(['成员', '新增候选人', '阶段推进', '面试次数', '发放 Offer']);
      expect(result.rows).toHaveLength(1);
      expect(result.filename).toContain('工作量统计');
    });
  });

  describe('exportChannelStats - 导出渠道效果数据', () => {
    it('应返回正确的导出数据结构', async () => {
      vi.mocked(mockPrisma.candidate.groupBy)
        .mockResolvedValueOnce([{ source: '招聘网站', _count: { id: 50 } }] as any)
        .mockResolvedValueOnce([{ source: '招聘网站', _count: { id: 10 } }] as any);

      const result = await service.exportChannelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result.headers).toEqual(['渠道', '候选人数量', '入职数量', '转化率(%)']);
      expect(result.filename).toContain('渠道效果分析');
    });
  });

  describe('exportJobStats - 导出职位维度数据', () => {
    it('应返回正确的导出数据结构', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { jobId: 'job-1', jobTitle: '前端工程师', department: '技术部', candidateCount: 10, interviewCount: 5, offerCount: 3, hiredCount: 2 },
      ]);

      const result = await service.exportJobStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result.headers).toEqual(['职位', '部门', '候选人', '面试', 'Offer', '入职']);
      expect(result.filename).toContain('职位维度统计');
    });
  });

  describe('getDashboardStats - 数据看板', () => {
    it('应返回核心 KPI 和近 7 天趋势', async () => {
      vi.mocked(mockPrisma.candidate.count)
        .mockResolvedValueOnce(12) // newCandidatesThisMonth
        .mockResolvedValue(0); // trend days (7 calls)
      vi.mocked(mockPrisma.interviewFeedback.findMany).mockResolvedValue([
        { candidateId: 'c1' }, { candidateId: 'c2' },
      ] as any);
      vi.mocked(mockPrisma.offer.count)
        .mockResolvedValueOnce(3) // pendingOffers
        .mockResolvedValueOnce(2); // joinedThisMonth
      vi.mocked(mockPrisma.hCRequest.count)
        .mockResolvedValueOnce(5) // totalApproved
        .mockResolvedValueOnce(2) // totalFilled
        .mockResolvedValueOnce(1); // openRequests

      const result = await service.getDashboardStats();

      expect(result.kpi.newCandidatesThisMonth).toBe(12);
      expect(result.kpi.interviewingCount).toBe(2);
      expect(result.kpi.pendingOffers).toBe(3);
      expect(result.kpi.joinedThisMonth).toBe(2);
      expect(result.trend).toHaveLength(7);
      expect(result.trend[0]).toHaveProperty('date');
      expect(result.trend[0]).toHaveProperty('count');
      expect(result.hcStats.totalApproved).toBe(5);
      expect(result.hcStats.totalFilled).toBe(2);
      expect(result.hcStats.fulfillmentRate).toBe(40);
      expect(result.hcStats.openRequests).toBe(1);
    });
  });

  describe('getFunnelStats - 招聘漏斗统计', () => {
    it('应返回各阶段统计数据', async () => {
      vi.mocked(mockPrisma.candidate.count).mockResolvedValue(100);
      vi.mocked(mockPrisma.stageRecord.groupBy)
        .mockResolvedValueOnce([{ candidateId: 'c1' }, { candidateId: 'c2' }] as any)
        .mockResolvedValueOnce([{ candidateId: 'c1' }] as any)
        .mockResolvedValueOnce([{ candidateId: 'c1' }] as any);
      vi.mocked(mockPrisma.offer.count)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.getFunnelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(6);
      expect(result[0]).toEqual({ stage: '简历入库', count: 100 });
      expect(result[1]).toEqual({ stage: '初筛通过', count: 2 });
      expect(result[2]).toEqual({ stage: '复试通过', count: 1 });
      expect(result[3]).toEqual({ stage: '终面通过', count: 1 });
      expect(result[4]).toEqual({ stage: 'Offer接受', count: 5 });
      expect(result[5]).toEqual({ stage: '成功入职', count: 3 });
    });

    it('无数据时各阶段应为0', async () => {
      vi.mocked(mockPrisma.candidate.count).mockResolvedValue(0);
      vi.mocked(mockPrisma.stageRecord.groupBy).mockResolvedValue([] as any);
      vi.mocked(mockPrisma.offer.count).mockResolvedValue(0);

      const result = await service.getFunnelStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(result).toHaveLength(6);
      expect(result.every((item) => item.count === 0)).toBe(true);
    });
  });
});
