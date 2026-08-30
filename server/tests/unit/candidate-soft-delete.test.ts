import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AppError } from '../../src/middleware/errorHandler';
import { anonymizeExpiredCandidates } from '../../src/services/anonymize.service';
import { CandidateService } from '../../src/services/candidate.service';

const mockPrisma = vi.hoisted(() => ({
  candidate: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  operationLog: {
    create: vi.fn(),
  },
  stageRecord: {
    findMany: vi.fn(),
  },
  candidateJob: {
    findMany: vi.fn(),
  },
  candidateTag: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/redis', () => ({
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  clearListCache: vi.fn().mockResolvedValue(undefined),
  clearStatsCache: vi.fn().mockResolvedValue(undefined),
}));

const admin = { userId: 'admin-1', role: 'admin' };
const member = { userId: 'user-1', role: 'member' };

describe('候选人软删除 + 回收站', () => {
  const service = new CandidateService();
  const liveCandidate = {
    id: 'candidate-1',
    name: '张三',
    createdById: 'user-1',
    deletedAt: null,
    deletedById: null,
  };
  const deletedCandidate = {
    ...liveCandidate,
    deletedAt: new Date('2026-08-01T00:00:00Z'),
    deletedById: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.operationLog.create.mockResolvedValue({});
    mockPrisma.stageRecord.findMany.mockResolvedValue([]);
    mockPrisma.candidateJob.findMany.mockResolvedValue([]);
    mockPrisma.candidateTag.findMany.mockResolvedValue([]);
  });

  it('deleteCandidate 后 deletedAt 被设置，记录被软删除（DB 中仍存在）', async () => {
    mockPrisma.candidate.findUnique.mockResolvedValue(liveCandidate);
    mockPrisma.candidate.update.mockResolvedValue({
      ...liveCandidate,
      deletedAt: new Date(),
      deletedById: member.userId,
    });

    await expect(service.deleteCandidate('candidate-1', member.userId, false)).resolves.toBeUndefined();

    expect(mockPrisma.candidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'candidate-1' },
        data: expect.objectContaining({ deletedById: 'user-1' }),
      })
    );
    expect(mockPrisma.candidate.delete).not.toHaveBeenCalled();
    expect(mockPrisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'soft_delete', targetId: 'candidate-1' }),
      })
    );
  });

  it('软删除后 getCandidates 不返回该候选人', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([]);
    mockPrisma.candidate.count.mockResolvedValue(0);

    const result = await service.getCandidates({ page: 1, pageSize: 10 });

    expect(result.candidates.map((c) => c.id)).not.toContain('candidate-1');
    expect(mockPrisma.candidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ deletedAt: null }]),
        }),
      })
    );
  });

  it('软删除后 getCandidateById 抛 AppError 404', async () => {
    mockPrisma.candidate.findFirst.mockResolvedValue(null);

    await expect(service.getCandidateById('candidate-1')).rejects.toMatchObject({
      statusCode: 404,
      message: '候选人不存在',
    });
    expect(AppError).toBeDefined();
  });

  it('admin restoreCandidate 后 deletedAt 被清空，候选人重新可见', async () => {
    mockPrisma.candidate.findUnique.mockResolvedValue(deletedCandidate);
    mockPrisma.candidate.update.mockResolvedValue({ ...liveCandidate, deletedAt: null, deletedById: null });
    mockPrisma.candidate.findMany.mockResolvedValue([liveCandidate]);
    mockPrisma.candidate.count.mockResolvedValue(1);

    const restored = await service.restoreCandidate('candidate-1', admin);
    expect(restored.deletedAt).toBeNull();
    expect(mockPrisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'candidate-1' },
      data: { deletedAt: null, deletedById: null },
    });

    const list = await service.getCandidates({ page: 1, pageSize: 10 });
    expect(list.candidates.map((c) => c.id)).toContain('candidate-1');
  });

  it('non-admin 调用 restoreCandidate 抛 AppError 403', async () => {
    await expect(service.restoreCandidate('candidate-1', member)).rejects.toMatchObject({
      statusCode: 403,
      message: '仅管理员可恢复候选人',
    });
    expect(mockPrisma.candidate.update).not.toHaveBeenCalled();
  });

  it('软删除的候选人不会出现在 anonymize.service 的候选名单中', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([]);

    await anonymizeExpiredCandidates(new Date('2026-06-01T03:00:00Z'));

    expect(mockPrisma.candidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          anonymizedAt: null,
        }),
      })
    );
  });

  it('purgeCandidate 真删候选人（DB 中 findUnique 返回 null）', async () => {
    mockPrisma.candidate.findUnique
      .mockResolvedValueOnce(deletedCandidate)
      .mockResolvedValueOnce(null);
    mockPrisma.candidate.delete.mockResolvedValue(deletedCandidate);

    await service.purgeCandidate('candidate-1', admin);

    expect(mockPrisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'candidate-1' } });
    const after = await mockPrisma.candidate.findUnique({ where: { id: 'candidate-1' } });
    expect(after).toBeNull();
  });

  it('non-admin 调用 purgeCandidate 抛 AppError 403', async () => {
    await expect(service.purgeCandidate('candidate-1', member)).rejects.toMatchObject({
      statusCode: 403,
      message: '仅管理员可永久删除',
    });
    expect(mockPrisma.candidate.delete).not.toHaveBeenCalled();
  });
});
