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
    user: {
      findUnique: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  },
}));

// Mock 站内通知服务，避免审批通知影响主流程断言
// 注意：用普通函数而非 vi.fn，因为 afterEach 的 resetAllMocks 会清空 mock 实现
vi.mock('../../src/services/notification.service', () => ({
  createNotification: () => Promise.resolve({}),
  createNotificationForUsers: () => Promise.resolve([]),
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
      // 历史 Offer（status=sent）可直接录入答复，不受审批流限制
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', result: 'pending', status: 'sent' } as any);
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

    it('Offer 未审批通过时录入候选人答复应被拒绝', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        result: 'pending',
        status: 'pending_approval',
      } as any);

      await expect(service.updateOffer('candidate-1', { result: 'accepted' }))
        .rejects
        .toThrow('Offer 审批通过后才能录入候选人答复');
    });
  });

  describe('submitOfferApproval - 提交审批', () => {
    it('草稿状态应成功提交审批并写入操作日志', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'draft' } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'admin-1' } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({
        id: 'offer-1',
        status: 'pending_approval',
        approverId: 'admin-1',
      } as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await service.submitOfferApproval('candidate-1', 'admin-1', 'user-1');

      expect(result.status).toBe('pending_approval');
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'offer_submitted', targetType: 'Offer' }),
        })
      );
    });

    it('已驳回状态可重新提交审批', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'rejected' } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'admin-1' } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({ id: 'offer-1', status: 'pending_approval' } as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await service.submitOfferApproval('candidate-1', 'admin-1', 'user-1');

      expect(result.status).toBe('pending_approval');
    });

    it('非法状态跳转（approved → pending_approval）应被拒绝', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'approved' } as any);

      await expect(service.submitOfferApproval('candidate-1', 'admin-1', 'user-1'))
        .rejects
        .toThrow('仅草稿或已驳回的 Offer 可提交审批');
    });

    it('审批人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'draft' } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(service.submitOfferApproval('candidate-1', 'admin-x', 'user-1'))
        .rejects
        .toThrow('审批人不存在');
    });
  });

  describe('approveOffer - 审批通过', () => {
    const pendingMocks = () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        status: 'pending_approval',
        approverId: 'admin-1',
      } as any);
    };

    it('admin 应能审批通过', async () => {
      pendingMocks();
      vi.mocked(prisma.offer.update).mockResolvedValue({ id: 'offer-1', status: 'approved' } as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await service.approveOffer('candidate-1', 'other-admin', true, '同意');

      expect(result.status).toBe('approved');
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'offer_approved' }),
        })
      );
    });

    it('被指定的审批人（非 admin）应能审批通过', async () => {
      pendingMocks();
      vi.mocked(prisma.offer.update).mockResolvedValue({ id: 'offer-1', status: 'approved' } as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await service.approveOffer('candidate-1', 'admin-1', false);

      expect(result.status).toBe('approved');
    });

    it('非审批人且非 admin 审批应被拒绝（403）', async () => {
      pendingMocks();

      await expect(service.approveOffer('candidate-1', 'user-2', false))
        .rejects
        .toThrow('仅管理员或指定审批人可以审批');
    });

    it('非法状态跳转（draft 直接审批）应被拒绝', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'draft' } as any);

      await expect(service.approveOffer('candidate-1', 'admin-1', true))
        .rejects
        .toThrow('仅审批中的 Offer 可以审批');
    });
  });

  describe('rejectOffer - 审批驳回', () => {
    it('应成功驳回并写入操作日志', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        status: 'pending_approval',
        approverId: 'admin-1',
      } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({ id: 'offer-1', status: 'rejected' } as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await service.rejectOffer('candidate-1', 'admin-1', false, '薪资超预算');

      expect(result.status).toBe('rejected');
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'offer_rejected' }),
        })
      );
    });

    it('驳回未填写意见应被拒绝', async () => {
      await expect(service.rejectOffer('candidate-1', 'admin-1', true, ''))
        .rejects
        .toThrow('驳回必须填写审批意见');
    });

    it('非审批人且非 admin 驳回应被拒绝（403）', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        status: 'pending_approval',
        approverId: 'admin-1',
      } as any);

      await expect(service.rejectOffer('candidate-1', 'user-2', false, '不同意'))
        .rejects
        .toThrow('仅管理员或指定审批人可以审批');
    });
  });

  describe('markOfferSent - 标记已发送', () => {
    it('审批通过后应成功标记为已发送', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'approved' } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({ id: 'offer-1', status: 'sent' } as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await service.markOfferSent('candidate-1', 'user-1');

      expect(result.status).toBe('sent');
    });

    it('非法状态跳转（draft 直接标记发送）应被拒绝', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({ id: 'offer-1', status: 'draft' } as any);

      await expect(service.markOfferSent('candidate-1', 'user-1'))
        .rejects
        .toThrow('仅审批通过的 Offer 可标记为已发送');
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

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.deleteOffer('non-existent')).rejects.toThrow('候选人不存在');
    });

    it('候选人暂无 Offer 时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue(null);

      await expect(service.deleteOffer('candidate-1')).rejects.toThrow('该候选人暂无 Offer');
    });
  });
});
