import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma（vi.hoisted 避免提升后访问未初始化变量）
const mockPrisma = vi.hoisted(() => ({
  candidate: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  operationLog: {
    create: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock 文件系统，验证简历物理文件删除
const mockUnlink = vi.hoisted(() => vi.fn());
vi.mock('fs/promises', () => ({
  default: { unlink: mockUnlink },
}));

import { anonymizeExpiredCandidates } from '../../src/services/anonymize.service';

describe('anonymizeExpiredCandidates - 候选人数据匿名化（个保法合规）', () => {
  // 固定"当前时间"，2 年前 cutoff 为 2024-06-01
  const now = new Date('2026-06-01T03:00:00Z');

  // 淘汰超过 2 年且未入职：应被匿名化
  const expiredRejected = {
    id: 'candidate-expired',
    name: '张三',
    phone: '13800138000',
    email: 'zhangsan@test.com',
    resumeUrl: '/api/files/0f6f0e1a-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
    createdById: 'user-1',
    anonymizedAt: null,
    stageRecords: [{ stage: '初筛', status: 'rejected', enteredAt: new Date('2023-01-01') }],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.candidate.update.mockResolvedValue({});
    mockPrisma.operationLog.create.mockResolvedValue({});
    mockUnlink.mockResolvedValue(undefined);
  });

  it('应清空姓名/手机号/邮箱并写入匿名化时间', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([expiredRejected]);

    const count = await anonymizeExpiredCandidates(now);

    expect(count).toBe(1);
    expect(mockPrisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'candidate-expired' },
      data: {
        name: '已匿名',
        phone: '',
        email: '',
        resumeUrl: null,
        anonymizedAt: now,
      },
    });
  });

  it('应保留统计所需字段（来源/学历/阶段记录等不改动）', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([expiredRejected]);

    await anonymizeExpiredCandidates(now);

    const updateData = mockPrisma.candidate.update.mock.calls[0][0].data;
    // 统计字段不出现在更新 payload 中，即保持原值
    expect(updateData).not.toHaveProperty('source');
    expect(updateData).not.toHaveProperty('education');
    expect(updateData).not.toHaveProperty('stageRecords');
    expect(updateData).not.toHaveProperty('createdAt');
  });

  it('应删除简历物理文件', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([expiredRejected]);

    await anonymizeExpiredCandidates(now);

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink.mock.calls[0][0]).toContain('0f6f0e1a-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf');
  });

  it('应写入 OperationLog 审计日志', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([expiredRejected]);

    await anonymizeExpiredCandidates(now);

    expect(mockPrisma.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'Candidate',
        targetId: 'candidate-expired',
        action: 'candidate_anonymized',
      }),
    });
  });

  it('最新阶段非淘汰（淘汰后又推进）的候选人不应被匿名化', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([
      {
        ...expiredRejected,
        id: 'candidate-reactivated',
        // 存在 2 年前的淘汰记录，但最新阶段为进行中
        stageRecords: [{ stage: '复试', status: 'in_progress', enteredAt: new Date('2025-01-01') }],
      },
    ]);

    const count = await anonymizeExpiredCandidates(now);

    expect(count).toBe(0);
    expect(mockPrisma.candidate.update).not.toHaveBeenCalled();
  });

  it('淘汰未满 2 年的候选人不应被匿名化', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([
      {
        ...expiredRejected,
        id: 'candidate-recent',
        stageRecords: [{ stage: '终面', status: 'rejected', enteredAt: new Date('2025-06-01') }],
      },
    ]);

    const count = await anonymizeExpiredCandidates(now);

    expect(count).toBe(0);
    expect(mockPrisma.candidate.update).not.toHaveBeenCalled();
  });

  it('单个候选人匿名化失败不影响其他候选人', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([
      { ...expiredRejected, id: 'candidate-1' },
      { ...expiredRejected, id: 'candidate-2' },
    ]);
    // 第一条更新失败，第二条正常
    mockPrisma.candidate.update
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({});

    const count = await anonymizeExpiredCandidates(now);

    expect(count).toBe(1);
    expect(mockPrisma.candidate.update).toHaveBeenCalledTimes(2);
  });

  it('无简历文件时不尝试删除物理文件', async () => {
    mockPrisma.candidate.findMany.mockResolvedValue([{ ...expiredRejected, resumeUrl: null }]);

    await anonymizeExpiredCandidates(now);

    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
