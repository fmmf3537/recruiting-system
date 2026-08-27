import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    candidate: {
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
  };
  return { default: mock };
});

import { WorkHistoryService } from '../../src/services/work-history.service';
import prisma from '../../src/lib/prisma';

describe('WorkHistoryService - 工作经历服务单元测试', () => {
  let service: WorkHistoryService;

  beforeEach(() => {
    service = new WorkHistoryService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createWorkHistory - 创建工作经历', () => {
    it('应成功创建一条记录', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.workHistory.create).mockResolvedValue({
        id: 'wh-1',
        candidateId: 'candidate-1',
        company: 'ABC公司',
        position: '工程师',
      } as any);

      const result = await service.createWorkHistory({
        candidateId: 'candidate-1',
        company: 'ABC公司',
        position: '工程师',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('wh-1');
      expect(prisma.workHistory.create).toHaveBeenCalled();
    });

    it('候选人不存在时应抛出 404', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

      await expect(service.createWorkHistory({
        candidateId: 'non-existent',
        company: 'ABC公司',
        position: '工程师',
      })).rejects.toThrow('候选人不存在');
    });
  });

  describe('createWorkHistories - 批量创建工作经历', () => {
    it('应批量创建并按 startDate desc 返回', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue({ id: 'candidate-1' } as any);
      vi.mocked(prisma.workHistory.createMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.workHistory.findMany).mockResolvedValue([
        { id: 'wh-2', company: 'B公司', position: '主管', startDate: new Date('2024-01-01') },
        { id: 'wh-1', company: 'A公司', position: '工程师', startDate: new Date('2022-01-01') },
      ] as any);

      const result = await service.createWorkHistories('candidate-1', [
        { company: 'A公司', position: '工程师', startDate: '2022-01-01' },
        { company: 'B公司', position: '主管', startDate: '2024-01-01' },
      ]);

      expect(prisma.workHistory.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.any(Array) })
      );
      expect(prisma.workHistory.findMany).toHaveBeenCalledWith({
        where: { candidateId: 'candidate-1' },
        orderBy: { startDate: 'desc' },
      });
      expect(result[0].company).toBe('B公司');
      expect(result[1].company).toBe('A公司');
    });

    it('传入空数组时应返回 [] 且不报错', async () => {
      const result = await service.createWorkHistories('candidate-1', []);

      expect(result).toEqual([]);
      expect(prisma.candidate.findUnique).not.toHaveBeenCalled();
      expect(prisma.workHistory.createMany).not.toHaveBeenCalled();
    });
  });

  describe('updateWorkHistory - 更新工作经历', () => {
    it('工作经历不存在时应抛出 404', async () => {
      vi.mocked(prisma.workHistory.findUnique).mockResolvedValue(null);

      await expect(service.updateWorkHistory('non-existent', { company: 'B公司' }))
        .rejects.toThrow('工作经历不存在');
    });
  });

  describe('deleteWorkHistory - 删除工作经历', () => {
    it('工作经历不存在时应抛出 404', async () => {
      vi.mocked(prisma.workHistory.findUnique).mockResolvedValue(null);

      await expect(service.deleteWorkHistory('non-existent')).rejects.toThrow('工作经历不存在');
    });
  });

  describe('getWorkHistories - 获取工作经历列表', () => {
    it('应按 startDate desc 返回', async () => {
      vi.mocked(prisma.workHistory.findMany).mockResolvedValue([
        { id: 'wh-2', company: 'B公司', position: '主管', startDate: new Date('2024-01-01') },
        { id: 'wh-1', company: 'A公司', position: '工程师', startDate: new Date('2022-01-01') },
      ] as any);

      const result = await service.getWorkHistories('candidate-1');

      expect(prisma.workHistory.findMany).toHaveBeenCalledWith({
        where: { candidateId: 'candidate-1' },
        orderBy: { startDate: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('wh-2');
    });
  });
});
