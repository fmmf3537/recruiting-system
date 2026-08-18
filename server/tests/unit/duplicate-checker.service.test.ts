import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma（vi.hoisted 避免提升后访问未初始化变量）
const mockPrisma = vi.hoisted(() => ({
  candidate: {
    findFirst: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

import { checkDuplicate } from '../../src/services/duplicate-checker.service';

describe('checkDuplicate - 重复候选人检查（数据可见性脱敏）', () => {
  const memberScope = { userId: 'user-1', isAdmin: false, department: '技术部' };

  const existingCandidate = {
    id: 'candidate-1',
    name: '张三',
    phone: '13800138000',
    email: 'zhangsan@test.com',
    createdAt: new Date('2024-01-01'),
    stageRecords: [{ stage: '初筛', status: 'in_progress' }],
  };

  beforeEach(() => {
    // resetAllMocks 同时清除 mockResolvedValueOnce 队列，避免跨用例残留
    vi.resetAllMocks();
  });

  it('不传 scope 时维持现有行为（返回重复明细）', async () => {
    mockPrisma.candidate.findFirst
      .mockResolvedValueOnce(existingCandidate)
      .mockResolvedValueOnce(null);

    const result = await checkDuplicate('13800138000', 'zhangsan@test.com');

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].name).toBe('张三');
    expect(result.hasHiddenDuplicate).toBe(false);
    // 无 scope 时不做可见性校验
    expect(mockPrisma.candidate.count).not.toHaveBeenCalled();
  });

  it('重复候选人在 member 可见范围内时正常返回明细', async () => {
    mockPrisma.candidate.findFirst
      .mockResolvedValueOnce(existingCandidate)
      .mockResolvedValueOnce(null);
    // 可见性校验通过
    mockPrisma.candidate.count.mockResolvedValue(1);

    const result = await checkDuplicate('13800138000', undefined, undefined, memberScope);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].phone).toBe('13800138000');
    expect(result.hasHiddenDuplicate).toBe(false);
  });

  it('重复候选人在 member 可见范围外时脱敏：不返回姓名/手机号/邮箱', async () => {
    mockPrisma.candidate.findFirst
      .mockResolvedValueOnce(existingCandidate)
      .mockResolvedValueOnce(null);
    // 可见性校验不通过
    mockPrisma.candidate.count.mockResolvedValue(0);

    const result = await checkDuplicate('13800138000', undefined, undefined, memberScope);

    expect(result.duplicates).toHaveLength(0);
    expect(result.hasHiddenDuplicate).toBe(true);
    // 确认没有泄露任何明细字段
    expect(JSON.stringify(result.duplicates)).not.toContain('张三');
    expect(JSON.stringify(result.duplicates)).not.toContain('13800138000');
  });

  it('手机号与邮箱命中同一范围外候选人时只标记一次', async () => {
    mockPrisma.candidate.findFirst.mockResolvedValue(existingCandidate);
    mockPrisma.candidate.count.mockResolvedValue(0);

    const result = await checkDuplicate('13800138000', 'zhangsan@test.com', undefined, memberScope);

    expect(result.duplicates).toHaveLength(0);
    expect(result.hasHiddenDuplicate).toBe(true);
    // 同一候选人只校验一次可见性
    expect(mockPrisma.candidate.count).toHaveBeenCalledTimes(1);
  });

  it('无重复时返回空列表且不标记脱敏', async () => {
    mockPrisma.candidate.findFirst.mockResolvedValue(null);

    const result = await checkDuplicate('13999999999', 'nobody@test.com', undefined, memberScope);

    expect(result.duplicates).toHaveLength(0);
    expect(result.hasHiddenDuplicate).toBe(false);
  });
});
