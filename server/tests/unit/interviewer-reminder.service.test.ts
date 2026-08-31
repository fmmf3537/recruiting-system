import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  interview: { findMany: vi.fn() },
  notification: { findUnique: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

const mockCreateNotification = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notification.service', () => ({
  createNotification: mockCreateNotification,
}));

import { sendInterviewer24hReminder } from '../../src/services/interviewer-reminder.service';

const now = new Date('2026-08-31T10:00:00.000Z');
const inWindowAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const hourKey = inWindowAt.toISOString().slice(0, 13);

const inWindowInterview = {
  id: 'int-1',
  candidateId: 'cand-1',
  candidate: { name: '张三' },
  scheduledAt: inWindowAt,
  interviewers: [
    { id: 'iv-1', name: '甲' },
    { id: 'iv-2', name: '乙' },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.notification.findUnique.mockResolvedValue(null);
  mockCreateNotification.mockResolvedValue({});
});

describe('sendInterviewer24hReminder', () => {
  it('24 小时窗口内的面试，每个 interviewer 收到 1 条', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([inWindowInterview]);

    const sent = await sendInterviewer24hReminder(now);

    expect(sent).toBe(2);
    expect(mockPrisma.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'scheduled',
          scheduledAt: {
            gte: new Date(now.getTime() + 23 * 60 * 60 * 1000),
            lte: new Date(now.getTime() + 25 * 60 * 60 * 1000),
          },
        },
      })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'iv-1',
        type: 'interview_24h_reminder',
        dedupeKey: `interview_24h:int-1:iv-1:${hourKey}`,
        businessId: 'int-1',
        businessType: 'interview',
      })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'iv-2',
        dedupeKey: `interview_24h:int-1:iv-2:${hourKey}`,
      })
    );
  });

  it('不在窗口内的面试不发', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([]);

    const sent = await sendInterviewer24hReminder(now);

    expect(sent).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
    const where = mockPrisma.interview.findMany.mock.calls[0][0].where;
    expect(where.scheduledAt.gte.getTime()).toBe(now.getTime() + 23 * 60 * 60 * 1000);
    expect(where.scheduledAt.lte.getTime()).toBe(now.getTime() + 25 * 60 * 60 * 1000);
  });

  it("status != 'scheduled' 的不发", async () => {
    mockPrisma.interview.findMany.mockResolvedValue([]);

    const sent = await sendInterviewer24hReminder(now);

    expect(sent).toBe(0);
    expect(mockPrisma.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'scheduled' }),
      })
    );
  });

  it('同面试同一 interviewer 同一小时不重复（dedupeKey 包含 hour）', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([inWindowInterview]);

    const first = await sendInterviewer24hReminder(now);
    expect(first).toBe(2);

    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n-exists' });
    const second = await sendInterviewer24hReminder(now);

    expect(second).toBe(0);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it('interviewers JSON 为 null 的面试不发', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([
      {
        ...inWindowInterview,
        interviewers: null,
      },
    ]);

    const sent = await sendInterviewer24hReminder(now);

    expect(sent).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
