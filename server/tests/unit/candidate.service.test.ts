import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => ({
  default: {
    candidate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    candidateJob: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    stageRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    interviewFeedback: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    offer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { CandidateService } from '../../src/services/candidate.service';
import prisma from '../../src/lib/prisma';

describe('CandidateService - 候选人服务单元测试', () => {
  let service: CandidateService;

  beforeEach(() => {
    service = new CandidateService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createCandidate - 创建候选人', () => {
    const createData = {
      name: '张三',
      phone: '13800138000',
      email: 'zhangsan@test.com',
      gender: '男',
      age: 28,
      education: '本科',
      source: '招聘网站',
    };

    it('应成功创建候选人（无重复）', async () => {
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.candidate.create).mockResolvedValue({
        id: 'candidate-1',
        ...createData,
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      const result = await service.createCandidate(createData, 'user-1');

      expect(result.candidate).toBeDefined();
      expect(result.warning).toBeUndefined();
      expect(result.duplicates).toBeUndefined();
      expect(prisma.candidate.create).toHaveBeenCalled();
    });

    it('应检测到手机号重复并返回警告', async () => {
      const existingCandidate = {
        id: 'candidate-existing',
        name: '张三',
        phone: '13800138000',
        email: 'old@test.com',
        createdAt: new Date(),
        stageRecords: [{ stage: '初筛', status: 'in_progress' }],
      };
      vi.mocked(prisma.candidate.findFirst)
        .mockResolvedValueOnce(existingCandidate as any)
        .mockResolvedValueOnce(null);

      vi.mocked(prisma.candidate.create).mockResolvedValue({
        id: 'candidate-1',
        ...createData,
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      const result = await service.createCandidate(createData, 'user-1');

      expect(result.warning).toBe('发现重复候选人');
      expect(result.duplicates).toHaveLength(1);
    });

    it('应检测到邮箱重复并返回警告', async () => {
      const existingCandidate = {
        id: 'candidate-existing',
        name: '张三',
        phone: '13999999999',
        email: 'zhangsan@test.com',
        createdAt: new Date(),
        stageRecords: [{ stage: '复试', status: 'passed' }],
      };
      vi.mocked(prisma.candidate.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingCandidate as any);

      vi.mocked(prisma.candidate.create).mockResolvedValue({
        id: 'candidate-1',
        ...createData,
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      const result = await service.createCandidate(createData, 'user-1');

      expect(result.warning).toBe('发现重复候选人');
      expect(result.duplicates).toHaveLength(1);
    });
  });

  describe('getCandidates - 候选人列表查询', () => {
    it('应返回分页列表', async () => {
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([
        {
          id: 'candidate-1',
          name: '张三',
          stageRecords: [{ stage: '初筛', status: 'in_progress' }],
          candidateJobs: [],
        },
      ] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(1);

      const result = await service.getCandidates({ page: 1, pageSize: 10 });

      expect(result.candidates).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getCandidateById - 候选人详情', () => {
    it('应返回候选人详情（含关联数据）', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [],
        interviewFeedbacks: [],
        offer: null,
        candidateJobs: [],
        createdBy: { id: 'user-1', name: '管理员', email: 'admin@test.com' },
      } as any);

      const result = await service.getCandidateById('candidate-1');

      expect(result).toHaveProperty('stageRecords');
      expect(result).toHaveProperty('interviewFeedbacks');
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.getCandidateById('non-existent'))
        .rejects
        .toThrow('候选人不存在');
    });
  });

  describe('advanceStage - 流程推进（顺序验证）', () => {
    it('应允许推进到下一个阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      await service.advanceStage('candidate-1', {
        stage: '初筛',
        status: 'passed',
      }, 'user-1');

      expect(prisma.stageRecord.create).toHaveBeenCalled();
    });

    it('应禁止跳过阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: '初筛', status: 'in_progress', enteredAt: new Date() }],
      } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '终面',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('阶段推进必须按顺序');
    });

    it('应禁止回退阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: '复试', status: 'in_progress', enteredAt: new Date() }],
      } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '初筛',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('不能回退到之前的阶段');
    });
  });

  describe('addInterviewFeedback - 添加面试反馈', () => {
    it('应成功添加反馈', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.interviewFeedback.create).mockResolvedValue({} as any);

      await service.addInterviewFeedback('candidate-1', {
        round: '初试',
        interviewerName: '李四',
        interviewTime: '2024-01-15T10:00:00Z',
        conclusion: 'pass',
        feedbackContent: '技术能力不错',
      }, 'user-1');

      expect(prisma.interviewFeedback.create).toHaveBeenCalled();
    });

    it('淘汰时必须填写原因', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);

      await expect(service.addInterviewFeedback('candidate-1', {
        round: '初试',
        interviewerName: '李四',
        interviewTime: '2024-01-15T10:00:00Z',
        conclusion: 'reject',
        feedbackContent: '技术能力不足',
      }, 'user-1')).rejects.toThrow('淘汰时必须填写原因');
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.addInterviewFeedback('non-existent', {
        round: '初试',
        interviewerName: '李四',
        interviewTime: '2024-01-15T10:00:00Z',
        conclusion: 'pass',
        feedbackContent: '技术能力不错',
      }, 'user-1')).rejects.toThrow('候选人不存在');
    });
  });

  describe('getInterviewFeedbacks - 获取面试反馈列表', () => {
    it('应返回面试反馈列表', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.interviewFeedback.findMany).mockResolvedValue([
        {
          id: 'feedback-1',
          round: '初试',
          interviewerName: '李四',
          conclusion: 'pass',
          createdBy: { id: 'user-1', name: '管理员' },
        },
      ] as any);

      const result = await service.getInterviewFeedbacks('candidate-1');

      expect(result).toHaveLength(1);
      expect(prisma.interviewFeedback.findMany).toHaveBeenCalled();
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.getInterviewFeedbacks('non-existent')).rejects.toThrow('候选人不存在');
    });
  });

  describe('updateCandidate - 更新候选人', () => {
    it('应成功更新候选人', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        phone: '13800138000',
        email: 'old@test.com',
      } as any);
      vi.mocked(prisma.candidate.update).mockResolvedValue({
        id: 'candidate-1',
        name: '李四',
      } as any);

      const result = await service.updateCandidate('candidate-1', { name: '李四' });

      expect(prisma.candidate.update).toHaveBeenCalled();
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.updateCandidate('non-existent', { name: '李四' })).rejects.toThrow('候选人不存在');
    });

    it('修改手机号时检查重复', async () => {
      vi.mocked(prisma.candidate.findUnique)
        .mockResolvedValueOnce({
          id: 'candidate-1',
          phone: '13800138000',
          email: 'old@test.com',
        } as any);
      vi.mocked(prisma.candidate.findFirst).mockResolvedValueOnce({
        id: 'candidate-2',
        phone: '13999999999',
      } as any);

      await expect(service.updateCandidate('candidate-1', { phone: '13999999999' })).rejects.toThrow('该手机号已被其他候选人使用');
    });

    it('修改邮箱时检查重复', async () => {
      vi.mocked(prisma.candidate.findUnique)
        .mockResolvedValueOnce({
          id: 'candidate-1',
          phone: '13800138000',
          email: 'old@test.com',
        } as any);
      vi.mocked(prisma.candidate.findFirst).mockResolvedValueOnce({
        id: 'candidate-2',
        email: 'new@test.com',
      } as any);

      await expect(service.updateCandidate('candidate-1', { email: 'new@test.com' })).rejects.toThrow('该邮箱已被其他候选人使用');
    });
  });

  describe('deleteCandidate - 删除候选人', () => {
    it('应成功删除候选人', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.candidate.delete).mockResolvedValue({} as any);

      await service.deleteCandidate('candidate-1');

      expect(prisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'candidate-1' } });
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.deleteCandidate('non-existent')).rejects.toThrow('候选人不存在');
    });
  });

  describe('getCandidates - 候选人列表查询（更多筛选条件）', () => {
    it('应支持来源筛选', async () => {
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);

      await service.getCandidates({ source: '招聘网站' });

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: '招聘网站',
          }),
        })
      );
    });

    it('应支持学历筛选', async () => {
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);

      await service.getCandidates({ education: '本科' });

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            education: '本科',
          }),
        })
      );
    });

    it('应支持工作年限范围筛选', async () => {
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);

      await service.getCandidates({ workYearsMin: 3, workYearsMax: 5 });

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workYears: expect.objectContaining({
              gte: 3,
              lte: 5,
            }),
          }),
        })
      );
    });
  });

  describe('advanceStage - 流程推进（更多验证）', () => {
    it('应自动创建Offer记录当推进到Offer阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: '拟录用', status: 'passed', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.offer.create).mockResolvedValue({} as any);

      await service.advanceStage('candidate-1', {
        stage: 'Offer',
        status: 'passed',
      }, 'user-1');

      expect(prisma.offer.create).toHaveBeenCalled();
    });

    it('应自动更新Offer记录当推进到入职阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: 'Offer', status: 'passed', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);
      vi.mocked(prisma.offer.findUnique).mockResolvedValue({
        id: 'offer-1',
        result: 'accepted',
      } as any);
      vi.mocked(prisma.offer.update).mockResolvedValue({} as any);

      await service.advanceStage('candidate-1', {
        stage: '入职',
        status: 'passed',
      }, 'user-1');

      expect(prisma.offer.update).toHaveBeenCalled();
    });

    it('淘汰时必须填写原因', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: '初筛', status: 'in_progress', enteredAt: new Date() }],
      } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '复试',
        status: 'rejected',
      }, 'user-1')).rejects.toThrow('淘汰时必须填写原因');
    });

    it('应拒绝无效的阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        stageRecords: [{ stage: '初筛', status: 'in_progress', enteredAt: new Date() }],
      } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '无效阶段',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('无效的阶段');
    });
  });
});
