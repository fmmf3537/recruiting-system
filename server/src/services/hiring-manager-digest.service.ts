import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import * as notificationService from './notification.service';

interface DigestMetrics {
  openJobs: number;
  activeCandidates: number;
  pendingOffers: number;
  scheduledInterviewsToday: number;
  overdueStages: number;
}

const OVERDUE_MS = 7 * 24 * 60 * 60 * 1000;

function buildDigestJobFilter(role: string, department: string | null): Prisma.JobWhereInput {
  if (role === 'admin') return {};
  if (!department) return { id: { in: [] } };
  return { departments: { array_contains: [department] } };
}

async function createNotificationOnce(
  input: notificationService.CreateNotificationInput & { dedupeKey: string }
): Promise<boolean> {
  const exists = await prisma.notification.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });
  if (exists) return false;
  try {
    await notificationService.createNotification(input);
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

function formatDigest(m: DigestMetrics, dept: string | null, isAdmin: boolean): string {
  const scope = isAdmin ? '全公司' : (dept ? `部门 ${dept}` : '部门 (未设置)');
  return [
    `数据范围：${scope}`,
    `- 开放职位：${m.openJobs}`,
    `- 活跃候选人：${m.activeCandidates}`,
    `- 待审批 Offer：${m.pendingOffers}`,
    `- 今日面试：${m.scheduledInterviewsToday}`,
    `- 阶段超时（7+ 天）：${m.overdueStages}`,
  ].join('\n');
}

/**
 * 给所有 hiring_manager + admin 发部门日报
 */
export async function sendHiringManagerDailyDigest(now: Date = new Date()): Promise<number> {
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['admin', 'hiring_manager'] } },
    select: { id: true, role: true, department: true },
  });

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const overdueCutoff = new Date(now.getTime() - OVERDUE_MS);

  let sent = 0;
  for (const recipient of recipients) {
    const isAdmin = recipient.role === 'admin';
    const jobFilter = buildDigestJobFilter(recipient.role, recipient.department);
    const candidateScope: Prisma.CandidateWhereInput = {
      deletedAt: null,
      ...(isAdmin ? {} : { candidateJobs: { some: { job: jobFilter } } }),
    };

    try {
      const metrics: DigestMetrics = {
        openJobs: await prisma.job.count({ where: { ...jobFilter, status: 'open' } }),
        activeCandidates: await prisma.candidateJob.count({
          where: {
            ...(isAdmin ? {} : { job: jobFilter }),
            candidate: { deletedAt: null },
          },
        }),
        pendingOffers: await prisma.offer.count({
          where: { status: 'pending_approval', candidate: candidateScope },
        }),
        scheduledInterviewsToday: await prisma.interview.count({
          where: {
            status: 'scheduled',
            scheduledAt: { gte: todayStart, lte: todayEnd },
            ...(isAdmin ? {} : { job: jobFilter }),
          },
        }),
        overdueStages: await prisma.stageRecord.count({
          where: {
            status: 'in_progress',
            enteredAt: { lte: overdueCutoff },
            candidate: candidateScope,
          },
        }),
      };

      const dateKey = now.toISOString().split('T')[0];
      const created = await createNotificationOnce({
        dedupeKey: `hiring_digest:${recipient.id}:${dateKey}`,
        recipientId: recipient.id,
        title: `招聘日报 ${dateKey}`,
        content: formatDigest(metrics, recipient.department, isAdmin),
        type: 'hiring_digest',
        businessId: recipient.id,
        businessType: 'user',
      });
      if (created) sent += 1;
    } catch (e) {
      logger.error({ err: e, userId: recipient.id }, 'hiring digest failed');
    }
  }
  return sent;
}
