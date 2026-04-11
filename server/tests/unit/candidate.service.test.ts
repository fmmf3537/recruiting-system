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
  });
});
