import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma（vi.hoisted 避免提升后访问未初始化变量）
const mockPrisma = vi.hoisted(() => ({
  candidateJob: {
    findFirst: vi.fn(),
  },
  pipelineTemplate: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

import {
  getCandidatePipelineStages,
  getDefaultPipelineStages,
  parseStages,
} from '../../src/services/pipeline-template.service';

// 历史七阶段兜底常量
const FALLBACK = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('parseStages - 阶段数组解析', () => {
  it('应过滤非字符串元素', () => {
    expect(parseStages(['入库', 1, '笔试', null])).toEqual(['入库', '笔试']);
    expect(parseStages('not-array')).toEqual([]);
    expect(parseStages(null)).toEqual([]);
  });
});

describe('getCandidatePipelineStages - 候选人适用阶段解析', () => {
  it('职位指定了启用模板时，使用职位模板阶段', async () => {
    mockPrisma.candidateJob.findFirst.mockResolvedValue({
      job: {
        type: '校招',
        pipelineTemplate: { enabled: true, stages: ['入库', '笔试', '复试', 'Offer', '入职'] },
      },
    });

    const stages = await getCandidatePipelineStages('candidate-1');

    expect(stages).toEqual(['入库', '笔试', '复试', 'Offer', '入职']);
    // 命中职位模板后不再查询默认模板
    expect(mockPrisma.pipelineTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('职位未指定模板时，回退该 type 的默认模板', async () => {
    mockPrisma.candidateJob.findFirst.mockResolvedValue({
      job: { type: '实习生', pipelineTemplate: null },
    });
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue({
      stages: ['入库', '面试', 'Offer', '入职'],
    });

    const stages = await getCandidatePipelineStages('candidate-1');

    expect(stages).toEqual(['入库', '面试', 'Offer', '入职']);
    expect(mockPrisma.pipelineTemplate.findFirst).toHaveBeenCalledWith({
      where: { type: '实习生', isDefault: true, enabled: true },
    });
  });

  it('未关联职位时，使用全局默认模板', async () => {
    mockPrisma.candidateJob.findFirst.mockResolvedValue(null);
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue({
      stages: ['入库', '初试', 'Offer'],
    });

    const stages = await getCandidatePipelineStages('candidate-1');

    expect(stages).toEqual(['入库', '初试', 'Offer']);
    // 不带 type 的全局默认查询
    expect(mockPrisma.pipelineTemplate.findFirst).toHaveBeenCalledWith({
      where: { isDefault: true, enabled: true },
    });
  });

  it('库中无任何模板时，兜底为历史七阶段常量', async () => {
    mockPrisma.candidateJob.findFirst.mockResolvedValue(null);
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue(null);

    const stages = await getCandidatePipelineStages('candidate-1');

    expect(stages).toEqual(FALLBACK);
  });

  it('职位模板被禁用时，回退默认模板', async () => {
    mockPrisma.candidateJob.findFirst.mockResolvedValue({
      job: {
        type: '社招',
        pipelineTemplate: { enabled: false, stages: ['入库', '自定义'] },
      },
    });
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue(null);

    const stages = await getCandidatePipelineStages('candidate-1');

    expect(stages).toEqual(FALLBACK);
  });
});

describe('getDefaultPipelineStages - 全局默认阶段', () => {
  it('有默认模板时返回其阶段', async () => {
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue({
      stages: ['入库', '笔试', 'Offer'],
    });

    expect(await getDefaultPipelineStages()).toEqual(['入库', '笔试', 'Offer']);
  });

  it('无默认模板时兜底为七阶段常量', async () => {
    mockPrisma.pipelineTemplate.findFirst.mockResolvedValue(null);

    expect(await getDefaultPipelineStages()).toEqual(FALLBACK);
  });
});
