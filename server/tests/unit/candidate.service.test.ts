import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
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
      findFirst: vi.fn(), // Pipeline 模板解析（getCandidatePipelineStages）
      createMany: vi.fn(),
    },
    pipelineTemplate: {
      findFirst: vi.fn(), // 默认模板查询
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
    user: {
      findUnique: vi.fn(),
    },
    workHistory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    candidateTag: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  };
  // $transaction 直接以同一 mock 作为 tx 执行回调，断言仍可命中各模型方法
  mock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return { default: mock };
});

import { CandidateService } from '../../src/services/candidate.service';
import prisma from '../../src/lib/prisma';

describe('CandidateService - 候选人服务单元测试', () => {
  let service: CandidateService;

  beforeEach(() => {
    service = new CandidateService();
    vi.clearAllMocks();
    vi.mocked(prisma.candidateTag.findMany).mockResolvedValue([]);
    // afterEach 的 resetAllMocks 会清掉实现，需每次重新注册 $transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked((prisma as any).$transaction).mockImplementation(async (cb: any) => cb(prisma));
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
      vi.mocked(prisma.stageRecord.findMany).mockResolvedValue([
        { candidateId: 'candidate-1', stage: '初筛', status: 'in_progress' },
      ] as any);
      vi.mocked(prisma.candidateJob.findMany).mockResolvedValue([] as any);

      const result = await service.getCandidates({ page: 1, pageSize: 10 });

      expect(result.candidates).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getCandidateById - 候选人详情', () => {
    it('应返回候选人详情（含关联数据）', async () => {
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [],
        interviewFeedbacks: [],
        offer: null,
        candidateJobs: [],
        candidateTags: [],
        createdBy: { id: 'user-1', name: '管理员', email: 'admin@test.com' },
      } as any);

      const result = await service.getCandidateById('candidate-1');

      expect(result).toHaveProperty('stageRecords');
      expect(result).toHaveProperty('interviewFeedbacks');
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue(null);

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
        createdById: 'user-1',
        stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);
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
        createdById: 'user-1',
        stageRecords: [{ stage: '初筛', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '终面',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('阶段推进必须按顺序');
    });

    it('应禁止回退阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [{ stage: '复试', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '初筛',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('不能回退到之前的阶段');
    });

    it('非创建者且非管理员应拒绝推进', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-2', role: 'member' } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '初筛',
        status: 'passed',
      }, 'user-2')).rejects.toThrow('无权操作此候选人');
      expect(prisma.stageRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('advanceStage - Pipeline 模板阶段校验', () => {
    // 校招模板：含「笔试」、无「初筛/终面/拟录用」
    const campusStages = ['入库', '笔试', '复试', 'Offer', '入职'];

    beforeEach(() => {
      // 候选人关联了指定校招模板的职位
      vi.mocked(prisma.candidateJob.findFirst).mockResolvedValue({
        job: {
          type: '校招',
          pipelineTemplate: { enabled: true, stages: campusStages },
        },
      } as any);
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);
    });

    it('模板内的自定义阶段（笔试）应允许推进', async () => {
      await service.advanceStage('candidate-1', {
        stage: '笔试',
        status: 'in_progress',
      }, 'user-1');

      expect(prisma.stageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: '笔试' }),
        })
      );
    });

    it('模板外的阶段（初筛）应返回无效阶段', async () => {
      await expect(service.advanceStage('candidate-1', {
        stage: '初筛',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('无效的阶段');
      expect(prisma.stageRecord.create).not.toHaveBeenCalled();
    });

    it('顺序校验按模板顺序（入库→笔试→复试，不可跳到 Offer）', async () => {
      await expect(service.advanceStage('candidate-1', {
        stage: 'Offer',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('阶段推进必须按顺序');
    });
  });

  describe('advanceStage - 无模板时回退默认七阶段', () => {
    it('未关联职位且库中无默认模板时，回退到 STAGE_ORDER 常量', async () => {
      // 无关联职位、无默认模板 → 走常量兼底
      vi.mocked(prisma.candidateJob.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.pipelineTemplate.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      await service.advanceStage('candidate-1', {
        stage: '初筛',
        status: 'passed',
      }, 'user-1');

      expect(prisma.stageRecord.create).toHaveBeenCalled();
    });

    it('职位未指定模板时，使用该 type 的默认模板', async () => {
      // 职位 pipelineTemplate 为空 → 查 type 默认模板
      vi.mocked(prisma.candidateJob.findFirst).mockResolvedValue({
        job: { type: '实习生', pipelineTemplate: null },
      } as any);
      vi.mocked(prisma.pipelineTemplate.findFirst).mockResolvedValue({
        type: '实习生',
        isDefault: true,
        enabled: true,
        stages: ['入库', '面试', 'Offer', '入职'],
      } as any);
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [{ stage: '入库', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);
      vi.mocked(prisma.stageRecord.create).mockResolvedValue({} as any);

      // 默认模板查询应带 type 条件
      await service.advanceStage('candidate-1', {
        stage: '面试',
        status: 'in_progress',
      }, 'user-1');

      expect(prisma.pipelineTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: '实习生', isDefault: true, enabled: true },
        })
      );
      expect(prisma.stageRecord.create).toHaveBeenCalled();
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
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.candidate.update).mockResolvedValue({
        id: 'candidate-1',
        name: '李四',
      } as any);

      const result = await service.updateCandidate('candidate-1', { name: '李四' }, 'user-1', false);

      expect(prisma.candidate.update).toHaveBeenCalled();
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.updateCandidate('non-existent', { name: '李四' }, 'user-1', false)).rejects.toThrow('候选人不存在');
    });

    it('修改手机号时检查重复', async () => {
      vi.mocked(prisma.candidate.findUnique)
        .mockResolvedValueOnce({
          id: 'candidate-1',
          phone: '13800138000',
          email: 'old@test.com',
          createdById: 'user-1',
        } as any);
      vi.mocked(prisma.candidate.count).mockResolvedValueOnce(1);

      await expect(service.updateCandidate('candidate-1', { phone: '13999999999' }, 'user-1', false)).rejects.toThrow('该手机号已被其他候选人使用');
    });

    it('修改邮箱时检查重复', async () => {
      vi.mocked(prisma.candidate.findUnique)
        .mockResolvedValueOnce({
          id: 'candidate-1',
          phone: '13800138000',
          email: 'old@test.com',
          createdById: 'user-1',
        } as any);
      vi.mocked(prisma.candidate.count).mockResolvedValueOnce(1);

      await expect(service.updateCandidate('candidate-1', { email: 'new@test.com' }, 'user-1', false)).rejects.toThrow('该邮箱已被其他候选人使用');
    });

    it('非创建者且非管理员应拒绝修改', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        phone: '13800138000',
        email: 'old@test.com',
        createdById: 'user-1',
      } as any);

      await expect(service.updateCandidate('candidate-1', { name: '李四' }, 'user-2', false)).rejects.toThrow('无权修改此候选人');
      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });

    it('管理员可修改任意候选人', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        phone: '13800138000',
        email: 'old@test.com',
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.candidate.update).mockResolvedValue({
        id: 'candidate-1',
        name: '李四',
      } as any);

      await service.updateCandidate('candidate-1', { name: '李四' }, 'user-2', true);

      expect(prisma.candidate.update).toHaveBeenCalled();
    });
  });

  describe('deleteCandidate - 删除候选人', () => {
    it('应成功软删除候选人', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        createdById: 'user-1',
        deletedAt: null,
      } as any);
      vi.mocked(prisma.candidate.update).mockResolvedValue({} as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await service.deleteCandidate('candidate-1', 'user-1', false);

      expect(prisma.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'candidate-1' },
          data: expect.objectContaining({ deletedById: 'user-1' }),
        })
      );
      expect(prisma.candidate.delete).not.toHaveBeenCalled();
    });

    it('候选人不存在时应抛出错误', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.deleteCandidate('non-existent', 'user-1', false)).rejects.toThrow('候选人不存在');
    });
  });

  describe('getCandidates - 候选人列表查询（更多筛选条件）', () => {
    it('应支持来源筛选', async () => {
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);
      vi.mocked(prisma.stageRecord.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidateJob.findMany).mockResolvedValue([] as any);

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
      vi.mocked(prisma.stageRecord.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidateJob.findMany).mockResolvedValue([] as any);

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
      vi.mocked(prisma.stageRecord.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidateJob.findMany).mockResolvedValue([] as any);

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
        createdById: 'user-1',
        stageRecords: [{ stage: '拟录用', status: 'passed', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);
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
        createdById: 'user-1',
        stageRecords: [{ stage: 'Offer', status: 'passed', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);
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
        createdById: 'user-1',
        stageRecords: [{ stage: '初筛', status: 'in_progress', enteredAt: new Date() }],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', role: 'member' } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '复试',
        status: 'rejected',
      }, 'user-1')).rejects.toThrow('淘汰时必须填写原因');
    });

    it('应拒绝无效的阶段', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [{ stage: '初筛', status: 'in_progress', enteredAt: new Date() }],
      } as any);

      await expect(service.advanceStage('candidate-1', {
        stage: '无效阶段',
        status: 'in_progress',
      }, 'user-1')).rejects.toThrow('无效的阶段');
    });
  });

  describe('数据可见性 - 候选人权限过滤', () => {
    const adminScope = { userId: 'admin-1', isAdmin: true, department: null };
    const memberScope = { userId: 'user-1', isAdmin: false, department: '技术部' };

    // 列表查询公共 mock：返回空列表
    const mockEmptyList = () => {
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);
      vi.mocked(prisma.stageRecord.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.candidateJob.findMany).mockResolvedValue([] as any);
    };

    it('admin 查看列表时仅附加软删除过滤（全量未删除）', async () => {
      mockEmptyList();

      await service.getCandidates({ page: 1, pageSize: 10 }, adminScope);

      const where = vi.mocked(prisma.candidate.findMany).mock.calls[0][0]?.where;
      expect(where?.AND).toEqual([{ deletedAt: null }, { deletedAt: null }]);
    });

    it('member 查看列表时仅包含"我创建的 + 指派给我的 + 本部门职位下"的候选人', async () => {
      mockEmptyList();

      await service.getCandidates({ page: 1, pageSize: 10 }, memberScope);

      const where = vi.mocked(prisma.candidate.findMany).mock.calls[0][0]?.where;
      expect(where?.AND).toEqual([
        { deletedAt: null },
        {
          AND: [
            {
              OR: [
                { createdById: 'user-1' },
                { stageRecords: { some: { assigneeId: 'user-1' } } },
                {
                  candidateJobs: {
                    some: { job: { departments: { array_contains: ['技术部'] } } },
                  },
                },
              ],
            },
            { deletedAt: null },
          ],
        },
      ]);
    });

    it('department 为 null 的 member 仅看"我创建的 + 指派给我的"两类', async () => {
      mockEmptyList();

      await service.getCandidates(
        { page: 1, pageSize: 10 },
        { userId: 'user-1', isAdmin: false, department: null }
      );

      const where = vi.mocked(prisma.candidate.findMany).mock.calls[0][0]?.where;
      expect(where?.AND).toEqual([
        { deletedAt: null },
        {
          AND: [
            {
              OR: [
                { createdById: 'user-1' },
                { stageRecords: { some: { assigneeId: 'user-1' } } },
              ],
            },
            { deletedAt: null },
          ],
        },
      ]);
    });

    it('member 无权查看他人候选人详情时返回 403', async () => {
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-2',
      } as any);
      // 可见性校验：不在 member 可见范围内
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);

      await expect(service.getCandidateById('candidate-1', memberScope))
        .rejects
        .toThrow('无权查看此候选人');
    });

    it('member 在可见范围内时可正常查看详情', async () => {
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-1',
        stageRecords: [],
        interviewFeedbacks: [],
        offer: null,
        candidateJobs: [],
        candidateTags: [],
        createdBy: { id: 'user-1', name: '成员', email: 'm@test.com' },
      } as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(1);

      const result = await service.getCandidateById('candidate-1', memberScope);

      expect(result.id).toBe('candidate-1');
    });

    it('admin 查看详情时仅过滤软删除、不做成员可见性校验', async () => {
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue({
        id: 'candidate-1',
        name: '张三',
        createdById: 'user-2',
        stageRecords: [],
        interviewFeedbacks: [],
        offer: null,
        candidateJobs: [],
        candidateTags: [],
        createdBy: { id: 'user-2', name: '成员', email: 'm@test.com' },
      } as any);
      vi.mocked(prisma.candidate.count).mockResolvedValue(1);

      const result = await service.getCandidateById('candidate-1', adminScope);

      expect(result.id).toBe('candidate-1');
    });

    it('跨部门不可见：member 批量打标签时仅操作可见范围内的候选人', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        role: 'member',
        department: '技术部',
      } as any);
      // 可见性过滤后仅剩 c1（c2 为他人创建且属于其他部门职位）
      vi.mocked(prisma.candidate.findMany).mockResolvedValue([{ id: 'c1' }] as any);
      vi.mocked(prisma.candidateTag.deleteMany).mockResolvedValue({ count: 0 } as any);
      vi.mocked(prisma.candidateTag.createMany).mockResolvedValue({ count: 1 } as any);

      const result = await service.batchSetTags(['c1', 'c2'], ['tag-1'], 'user-1');

      expect(result).toEqual({ success: 1, failed: 1 });
      // 可见性过滤按本部门职位条件下推到数据库
      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['c1', 'c2'] },
            AND: [
              {
                AND: [
                  {
                    OR: [
                      { createdById: 'user-1' },
                      { stageRecords: { some: { assigneeId: 'user-1' } } },
                      {
                        candidateJobs: {
                          some: { job: { departments: { array_contains: ['技术部'] } } },
                        },
                      },
                    ],
                  },
                  { deletedAt: null },
                ],
              },
            ],
          }),
        })
      );
      expect(prisma.candidateTag.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.candidateTag.deleteMany).toHaveBeenCalledWith({ where: { candidateId: 'c1' } });
    });
  });
});
