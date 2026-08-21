import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { env } from '../lib/env';
import * as notificationService from './notification.service';

/**
 * 统一提醒调度服务
 * 扫描库中已有的提醒数据基础，生成站内通知：
 * 1. 跟进到期：CommunicationLog.followUpAt 已过且未提醒过 → 通知创建人
 * 2. 面试前提醒：Interview.scheduledAt 在未来 2 小时内且未提醒过 → 通知创建人及所有面试官
 * 3. 阶段停留超时：StageRecord 处于 in_progress 且 enteredAt 超过阈值（默认 7 天，STAGE_OVERDUE_DAYS 可配）
 *    → 通知 assignee 和其部门管理者
 * 防重复：每条提醒通过 Notification.dedupeKey 幂等去重（唯一索引兜底）
 */

// 面试前提醒窗口：开始前 2 小时内触发
export const INTERVIEW_REMIND_WINDOW_MS = 2 * 60 * 60 * 1000;

// 阶段停留超时默认阈值（天）
export const DEFAULT_STAGE_OVERDUE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Interview.interviewers 为 Json 字段，结构约定为 [{ id, name }]
interface InterviewerEntry {
  id?: string;
  name?: string;
}

/**
 * 幂等创建提醒通知：dedupeKey 已存在则跳过；
 * 并发场景下由 dedupeKey 唯一索引兜底（P2002 视为已发送，不重复通知）
 * 返回 true 表示本次新创建
 */
async function createReminderOnce(
  input: notificationService.CreateNotificationInput & { dedupeKey: string }
): Promise<boolean> {
  const exists = await prisma.notification.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });
  if (exists) {
    return false;
  }

  try {
    await notificationService.createNotification(input);
    return true;
  } catch (error) {
    // 唯一索引冲突：其他扫描实例已写入同一条提醒，视为已发送
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

/**
 * 跟进到期提醒：followUpAt 已过的沟通记录，给创建人发站内通知
 * now 可注入便于测试
 */
export async function sendFollowUpReminders(now: Date = new Date()): Promise<number> {
  const logs = await prisma.communicationLog.findMany({
    where: { followUpAt: { not: null, lte: now } },
    include: { candidate: { select: { name: true } } },
  });

  let sent = 0;
  for (const log of logs) {
    const created = await createReminderOnce({
      dedupeKey: `followup_reminder:${log.id}`,
      recipientId: log.createdById,
      title: `跟进提醒：${log.candidate.name}`,
      content: `您记录的与候选人「${log.candidate.name}」的沟通已到下次跟进时间，请及时跟进。`,
      type: 'followup_reminder',
      businessId: log.candidateId,
      businessType: 'candidate',
    });
    if (created) {
      sent += 1;
    }
  }
  return sent;
}

/**
 * 面试前提醒：scheduledAt 在未来 2 小时内的面试，给创建人及所有面试官发站内通知
 * now 可注入便于测试
 */
export async function sendInterviewReminders(now: Date = new Date()): Promise<number> {
  const interviews = await prisma.interview.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { gt: now, lte: new Date(now.getTime() + INTERVIEW_REMIND_WINDOW_MS) },
    },
    include: { candidate: { select: { name: true } } },
  });

  let sent = 0;
  for (const interview of interviews) {
    // 收件人：创建人 + 所有面试官（去重）
    const recipientIds = new Set<string>([interview.createdById]);
    const interviewers = (interview.interviewers as InterviewerEntry[] | null) ?? [];
    interviewers.forEach((interviewer) => {
      if (interviewer.id) {
        recipientIds.add(interviewer.id);
      }
    });

    for (const recipientId of recipientIds) {
      const created = await createReminderOnce({
        dedupeKey: `interview_reminder:${interview.id}:${recipientId}`,
        recipientId,
        title: `面试即将开始：${interview.candidate.name}`,
        content: `候选人「${interview.candidate.name}」的${interview.round}将于 2 小时内开始，请提前准备。`,
        type: 'interview_reminder',
        businessId: interview.id,
        businessType: 'interview',
      });
      if (created) {
        sent += 1;
      }
    }
  }
  return sent;
}

/**
 * 阶段停留超时提醒：in_progress 且 enteredAt 超过阈值的阶段记录，
 * 给 assignee 和其部门管理者发站内通知
 * now / overdueDays 可注入便于测试
 */
export async function sendStageOverdueReminders(
  now: Date = new Date(),
  overdueDays: number = DEFAULT_STAGE_OVERDUE_DAYS
): Promise<number> {
  const cutoff = new Date(now.getTime() - overdueDays * DAY_MS);
  const records = await prisma.stageRecord.findMany({
    where: {
      status: 'in_progress',
      assigneeId: { not: null },
      enteredAt: { lte: cutoff },
    },
    include: {
      candidate: { select: { name: true } },
      assignee: { select: { id: true, department: true } },
    },
  });

  let sent = 0;
  for (const record of records) {
    if (!record.assignee) {
      continue;
    }

    // 收件人：负责人 + 部门管理者（User 模型无独立「主管」角色，按现有模型取同部门 admin）
    const recipientIds = new Set<string>([record.assignee.id]);
    if (record.assignee.department) {
      const managers = await prisma.user.findMany({
        where: { role: 'admin', department: record.assignee.department },
        select: { id: true },
      });
      managers.forEach((manager) => recipientIds.add(manager.id));
    }

    const stayedDays = Math.floor((now.getTime() - record.enteredAt.getTime()) / DAY_MS);
    for (const recipientId of recipientIds) {
      const created = await createReminderOnce({
        dedupeKey: `stage_overdue_reminder:${record.id}:${recipientId}`,
        recipientId,
        title: `阶段停留超时：${record.candidate.name}`,
        content: `候选人「${record.candidate.name}」在「${record.stage}」阶段已停留 ${stayedDays} 天（阈值 ${overdueDays} 天），请尽快处理。`,
        type: 'stage_overdue_reminder',
        businessId: record.candidateId,
        businessType: 'candidate',
      });
      if (created) {
        sent += 1;
      }
    }
  }
  return sent;
}

export interface ReminderScanResult {
  followUp: number;
  interview: number;
  stageOverdue: number;
}

/**
 * 统一扫描入口：依次执行三类提醒，任一类失败不影响其他类
 */
export async function runReminderScan(now: Date = new Date()): Promise<ReminderScanResult> {
  const result: ReminderScanResult = { followUp: 0, interview: 0, stageOverdue: 0 };

  const scans: Array<[keyof ReminderScanResult, () => Promise<number>]> = [
    ['followUp', () => sendFollowUpReminders(now)],
    ['interview', () => sendInterviewReminders(now)],
    // 阈值由 STAGE_OVERDUE_DAYS 环境变量配置
    ['stageOverdue', () => sendStageOverdueReminders(now, env.STAGE_OVERDUE_DAYS)],
  ];

  for (const [key, scan] of scans) {
    try {
      result[key] = await scan();
    } catch (error) {
      // 单类扫描失败仅记录日志，不阻断其他类提醒
      console.error(`[提醒任务] ${key} 扫描失败:`, error);
    }
  }

  return result;
}
