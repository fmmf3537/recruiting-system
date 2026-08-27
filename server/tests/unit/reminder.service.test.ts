import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma（vi.hoisted 避免提升后访问未初始化变量）
const mockPrisma = vi.hoisted(() => ({
  communicationLog: {
    findMany: vi.fn(),
  },
  interview: {
    findMany: vi.fn(),
  },
  stageRecord: {
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  notification: {
    findUnique: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock 通知服务，验证通知写入参数
const mockCreateNotification = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notification.service', () => ({
  createNotification: mockCreateNotification,
}));

import { logger } from '../../src/lib/logger';
import {
  sendFollowUpReminders,
  sendInterviewReminders,
  sendStageOverdueReminders,
  runReminderScan,
  INTERVIEW_REMIND_WINDOW_MS,
} from '../../src/services/reminder.service';

// 固定"当前时间"，便于断言扫描窗口
const now = new Date('2026-06-01T03:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
  // 默认：无历史提醒（dedupeKey 不存在），通知创建成功
  mockPrisma.notification.findUnique.mockResolvedValue(null);
  mockCreateNotification.mockResolvedValue({});
});

describe('sendFollowUpReminders - 跟进到期提醒', () => {
  const followUpLog = {
    id: 'log-1',
    candidateId: 'cand-1',
    createdById: 'user-1',
    followUpAt: new Date('2026-05-31T10:00:00Z'),
    candidate: { name: '张三' },
  };

  it('followUpAt 已过的沟通记录应给创建人发站内通知', async () => {
    mockPrisma.communicationLog.findMany.mockResolvedValue([followUpLog]);

    const count = await sendFollowUpReminders(now);

    expect(count).toBe(1);
    // 扫描条件：followUpAt 非空且不晚于当前时间
    expect(mockPrisma.communicationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { followUpAt: { not: null, lte: now } },
      })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'followup_reminder:log-1',
        recipientId: 'user-1',
        type: 'followup_reminder',
        businessId: 'cand-1',
        businessType: 'candidate',
      })
    );
  });

  it('已生成过提醒（dedupeKey 已存在）时不重复发送', async () => {
    mockPrisma.communicationLog.findMany.mockResolvedValue([followUpLog]);
    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'noti-exists' });

    const count = await sendFollowUpReminders(now);

    expect(count).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe('sendInterviewReminders - 面试前提醒', () => {
  const upcomingInterview = {
    id: 'int-1',
    candidateId: 'cand-1',
    createdById: 'creator-1',
    round: '初试',
    status: 'scheduled',
    scheduledAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 小时后
    // 面试官与创建人有重叠，验证收件人去重
    interviewers: [
      { id: 'iv-1', name: '面试官A' },
      { id: 'iv-2', name: '面试官B' },
      { id: 'creator-1', name: '创建人' },
    ],
    candidate: { name: '李四' },
  };

  it('未来 2 小时内的面试应给创建人及所有面试官发通知（收件人去重）', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([upcomingInterview]);

    const count = await sendInterviewReminders(now);

    // 创建人 + 2 位面试官 = 3 条（创建人与面试官重叠部分去重）
    expect(count).toBe(3);
    // 扫描条件：scheduled 状态，scheduledAt 在 (now, now+2h] 窗口内
    expect(mockPrisma.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'scheduled',
          scheduledAt: { gt: now, lte: new Date(now.getTime() + INTERVIEW_REMIND_WINDOW_MS) },
        },
      })
    );
    const recipientIds = mockCreateNotification.mock.calls.map((call) => call[0].recipientId);
    expect(recipientIds.sort()).toEqual(['creator-1', 'iv-1', 'iv-2']);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'interview_reminder:int-1:iv-1',
        type: 'interview_reminder',
        businessId: 'int-1',
        businessType: 'interview',
      })
    );
  });

  it('已生成过提醒（dedupeKey 已存在）时不重复发送', async () => {
    mockPrisma.interview.findMany.mockResolvedValue([upcomingInterview]);
    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'noti-exists' });

    const count = await sendInterviewReminders(now);

    expect(count).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe('sendStageOverdueReminders - 阶段停留超时提醒', () => {
  const overdueRecord = {
    id: 'sr-1',
    candidateId: 'cand-2',
    stage: '复试',
    status: 'in_progress',
    enteredAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 天前进入
    assigneeId: 'assignee-1',
    candidate: { name: '王五' },
    assignee: { id: 'assignee-1', department: '技术部' },
  };

  it('停留超过阈值的阶段应给 assignee 和同部门 admin 发通知', async () => {
    mockPrisma.stageRecord.findMany.mockResolvedValue([overdueRecord]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

    const count = await sendStageOverdueReminders(now, 7);

    expect(count).toBe(2);
    // 扫描条件：in_progress、有负责人、enteredAt 不晚于 7 天前
    expect(mockPrisma.stageRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'in_progress',
          assigneeId: { not: null },
          enteredAt: { lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      })
    );
    // 部门管理者：同部门 admin
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'admin', department: '技术部' },
      select: { id: true },
    });
    const recipientIds = mockCreateNotification.mock.calls.map((call) => call[0].recipientId);
    expect(recipientIds.sort()).toEqual(['admin-1', 'assignee-1']);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'stage_overdue_reminder:sr-1:assignee-1',
        type: 'stage_overdue_reminder',
        businessId: 'cand-2',
        businessType: 'candidate',
      })
    );
  });

  it('负责人无部门时仅通知 assignee 本人', async () => {
    mockPrisma.stageRecord.findMany.mockResolvedValue([
      { ...overdueRecord, assignee: { id: 'assignee-1', department: null } },
    ]);

    const count = await sendStageOverdueReminders(now, 7);

    expect(count).toBe(1);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('已生成过提醒（dedupeKey 已存在）时不重复发送', async () => {
    mockPrisma.stageRecord.findMany.mockResolvedValue([overdueRecord]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);
    mockPrisma.notification.findUnique.mockResolvedValue({ id: 'noti-exists' });

    const count = await sendStageOverdueReminders(now, 7);

    expect(count).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe('runReminderScan - 统一扫描入口', () => {
  it('单类扫描失败不影响其他类，且不抛出异常', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    mockPrisma.communicationLog.findMany.mockRejectedValue(new Error('DB 连接失败'));
    mockPrisma.interview.findMany.mockResolvedValue([]);
    mockPrisma.stageRecord.findMany.mockResolvedValue([]);

    const result = await runReminderScan(now);

    expect(result).toEqual({ followUp: 0, interview: 0, stageOverdue: 0 });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('三类扫描均正常时返回各自发送计数', async () => {
    mockPrisma.communicationLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        candidateId: 'cand-1',
        createdById: 'user-1',
        followUpAt: new Date('2026-05-31T10:00:00Z'),
        candidate: { name: '张三' },
      },
    ]);
    mockPrisma.interview.findMany.mockResolvedValue([]);
    mockPrisma.stageRecord.findMany.mockResolvedValue([]);

    const result = await runReminderScan(now);

    expect(result.followUp).toBe(1);
    expect(result.interview).toBe(0);
    expect(result.stageOverdue).toBe(0);
  });
});
