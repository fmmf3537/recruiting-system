import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import * as notificationService from './notification.service';

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

/**
 * 给面试官发「面试前 24h」提醒（与现有 2h 提醒互补）
 */
export async function sendInterviewer24hReminder(now: Date = new Date()): Promise<number> {
  const start = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const interviews = await prisma.interview.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      candidateId: true,
      candidate: { select: { name: true } },
      interviewers: true,
      scheduledAt: true,
    },
  });

  let sent = 0;
  for (const interview of interviews) {
    const interviewerList = Array.isArray(interview.interviewers)
      ? (interview.interviewers as Array<{ id?: string; name?: string }>)
      : [];
    const hourKey = new Date(interview.scheduledAt).toISOString().slice(0, 13);

    for (const interviewer of interviewerList) {
      if (!interviewer.id) continue;
      try {
        const created = await createNotificationOnce({
          dedupeKey: `interview_24h:${interview.id}:${interviewer.id}:${hourKey}`,
          recipientId: interviewer.id,
          title: `面试提醒：${interview.candidate.name}`,
          content: `您明天有面试安排：${new Date(interview.scheduledAt).toLocaleString('zh-CN')}，请提前准备。`,
          type: 'interview_24h_reminder',
          businessId: interview.id,
          businessType: 'interview',
        });
        if (created) sent += 1;
      } catch (e) {
        logger.error({ err: e, interviewId: interview.id }, 'interviewer 24h reminder failed');
      }
    }
  }
  return sent;
}
