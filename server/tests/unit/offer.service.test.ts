import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => ({
  default: {
    offer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    candidate: {
      findUnique: vi.fn(),
    },
    stageRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { OfferService } from '../../src/services/offer.service';
import prisma from '../../src/lib/prisma';

describe('OfferService - Offer 服务单元测试', () => {
  let service: OfferService;

  beforeEach(() => {
    service = new OfferService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createOffer - 创建 Offer', () => {
    const createData = {
      candidateId: 'candidate-1',
      salary: '25000元/月',
      offerDate: '2024-01-20T00:00:00Z',
      expectedJoinDate: '2024-02-01T00:00:00Z',
      note: '期待加入',
    };

    it('应成功创建 Offer', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        offer: null,
      } as any);
      vi.mocked(prisma.offer.create).mockResolvedValue({
        id: 'offer-1',
        ...createData,
        result: 'pending',
        joined: false,
      } as any);

      const result = await service.createOffer(createData);

      expect(result).toBeDefined();
      expect(result.salary).toBe(createData.salary);
      expect(result.result).toBe('pending');
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.createOffer(createData))
        .rejects
        .toThrow('候选人不存在');
    });

    it('候选人已有 Offer 时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        offer: { id: 'existing-offer' },
      } as any);

      await expect(service.createOffer(createData))
        .rejects
        .toThrow('该候选人已有 Offer');
    });
  });

  describe('updateOffer - 更新 Offer（自动推进入职）', () => {
    it('应成功更新 Offer 薪资', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1' } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({
        id: 'offer-1',
        salary: '30000元/月',
      } as any);

      const result = await service.updateOffer('candidate-1', { salary: '30000元/月' });

      expect(result.salary).toBe('30000元/月');
    });

    it('result=accepted 时应自动设置 joined 和入职日期', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', result: 'pending' } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({
        id: 'offer-1',
        result: 'accepted',
        joined: true,
        actualJoinDate: new Date(),
      } as any);
      vi.mocked(prisma.stageRecord.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      const result = await service.updateOffer('candidate-1', { result: 'accepted' });

      expect(result.result).toBe('accepted');
      expect(result.joined).toBe(true);
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.updateOffer('non-existent', { salary: '30000' }))
        .rejects
        .toThrow('候选人不存在');
    });
  });

  describe('markAsJoined - 标记入职', () => {
    it('应成功标记入职', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        result: 'accepted',
      } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({
        id: 'offer-1',
        joined: true,
        actualJoinDate: new Date('2024-02-01'),
      } as any);

      const result = await service.markAsJoined('candidate-1', '2024-02-01T00:00:00Z');

      expect(result.joined).toBe(true);
    });

    it('候选人未接受 Offer 时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        result: 'pending',
      } as any);

      await expect(service.markAsJoined('candidate-1', '2024-02-01T00:00:00Z'))
        .rejects
        .toThrow('候选人尚未接受 Offer，无法标记入职');
    });
  });

  describe('getOffers - Offer 列表', () => {
    it('应返回分页列表', async () => {
      vi.mocked(prisma.offer.findMany).mockResolvedValue([
        {
          id: 'offer-1',
          salary: '25000元/月',
          result: 'pending',
          candidate: {
            id: 'candidate-1',
            name: '张三',
            email: 'zhangsan@test.com',
            phone: '13800138000',
          },
        },
      ] as any);
      vi.mocked(prisma.offer.count).mockResolvedValue(1);

      const result = await service.getOffers({ page: 1, pageSize: 10 });

      expect(result.offers).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getOfferByCandidateId - 获取候选人 Offer', () => {
    it('应返回 Offer 详情（含候选人信息）', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        salary: '25000元/月',
        candidate: {
          id: 'candidate-1',
          name: '张三',
          email: 'zhangsan@test.com',
          phone: '13800138000',
          candidateJobs: [{ job: { id: 'job-1', title: '前端工程师' } }],
        },
      } as any);

      const result = await service.getOfferByCandidateId('candidate-1');

      expect(result).toBeDefined();
      expect(result.candidate).toBeDefined();
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.getOfferByCandidateId('non-existent'))
        .rejects
        .toThrow('候选人不存在');
    });
  });

  describe('deleteOffer - 删除 Offer', () => {
    it('应成功删除 Offer', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1' } as any);
      vi.mocked(prisma.offer.delete).mockResolvedValue({} as any);

      await service.deleteOffer('candidate-1');

      expect(prisma.offer.delete).toHaveBeenCalled();
    });
  });
});
