import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  job: { count: vi.fn() },
  candidateJob: { count: vi.fn() },
  offer: { count: vi.fn() },
  interview: { count: vi.fn() },
  stageRecord: { count: vi.fn() },
  notification: { findUnique: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

const mockCreateNotification = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notification.service', () => ({
  createNotification: mockCreateNotification,
}));

import { sendHiringManagerDailyDigest } from '../../src/services/hiring-manager-digest.service';

const now = new Date('2026-08-31T01:00:00.000Z');
const dateKey = '2026-08-31';
const emptyJobFilter = { id: { in: [] } };

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.notification.findUnique.mockResolvedValue(null);
  mockCreateNotification.mockResolvedValue({});
  mockPrisma.job.count.mockResolvedValue(0);
  mockPrisma.candidateJob.count.mockResolvedValue(0);
  mockPrisma.offer.count.mockResolvedValue(0);
  mockPrisma.interview.count.mockResolvedValue(0);
  mockPrisma.stageRecord.count.mockResolvedValue(0);
});

describe('sendHiringManagerDailyDigest', () => {
  it('admin 收到 1 条日报（scope = company）', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', role: 'admin', department: null },
    ]);
    mockPrisma.job.count.mockResolvedValue(2);
    mockPrisma.candidateJob.count.mockResolvedValue(3);

    const sent = await sendHiringManagerDailyDigest(now);

    expect(sent).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'admin-1',
        type: 'hiring_digest',
        title: `招聘日报 ${dateKey}`,
        dedupeKey: `hiring_digest:admin-1:${dateKey}`,
        content: expect.stringContaining('全公司'),
      })
    );
  });

  it('hiring_manager 有 department 收到 1 条（scope = department）', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'hm-1', role: 'hiring_manager', department: '技术部' },
    ]);
    mockPrisma.job.count.mockResolvedValue(1);

    const sent = await sendHiringManagerDailyDigest(now);

    expect(sent).toBe(1);
    expect(mockPrisma.job.count).toHaveBeenCalledWith({
      where: { departments: { array_contains: ['技术部'] }, status: 'open' },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'hm-1',
        type: 'hiring_digest',
        dedupeKey: `hiring_digest:hm-1:${dateKey}`,
        content: expect.stringContaining('部门 技术部'),
      })
    );
  });

  it('hiring_manager 无 department（null）收到 1 条（metrics 全为 0）', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'hm-2', role: 'hiring_manager', department: null },
    ]);

    const sent = await sendHiringManagerDailyDigest(now);

    expect(sent).toBe(1);
    expect(mockPrisma.job.count).toHaveBeenCalledWith({
      where: { ...emptyJobFilter, status: 'open' },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'hm-2',
        content: expect.stringMatching(/开放职位：0[\s\S]*活跃候选人：0[\s\S]*待审批 Offer：0[\s\S]*今日面试：0[\s\S]*阶段超时（7\+ 天）：0/),
      })
    );
  });

  it('同一天同一人不重复发送（dedupeKey 幂等）', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', role: 'admin', department: null },
    ]);

    const first = await sendHiringManagerDailyDigest(now);
    expect(first).toBe(1);

    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n-exists' });
    const second = await sendHiringManagerDailyDigest(now);

    expect(second).toBe(0);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('第二天同一用户能收到新日报（新 dedupeKey）', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', role: 'admin', department: null },
    ]);

    const day1 = await sendHiringManagerDailyDigest(now);
    const day2 = await sendHiringManagerDailyDigest(new Date('2026-09-01T01:00:00.000Z'));

    expect(day1).toBe(1);
    expect(day2).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'hiring_digest:admin-1:2026-08-31' })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'hiring_digest:admin-1:2026-09-01' })
    );
  });
});
