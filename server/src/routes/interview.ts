import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router: RouterType = Router();

// 用人经理（hiring_manager）作为面试官参场时也需要工作台/评估入口；
// service 层有「该场面试官」精确校验，role 放开不产生越权
const interviewerGuard = [
  authenticate,
  requireRole('admin', 'interviewer', 'hiring_manager'),
] as const;

/**
 * 从面试列表中筛出 interviewers JSON 含指定 userId 的面试 id（纯函数，供单测）
 */
export function getVisibleInterviewIds(
  interviews: Array<{ id: string; interviewers: unknown }>,
  userId: string
): string[] {
  const ids = new Set<string>();
  for (const i of interviews) {
    const list = Array.isArray(i.interviewers)
      ? (i.interviewers as Array<{ id?: string }>)
      : [];
    if (list.some((u) => u.id === userId)) ids.add(i.id);
  }
  return Array.from(ids);
}

async function loadVisibleInterviewIds(userId: string): Promise<string[]> {
  const interviews = await prisma.interview.findMany({
    select: { id: true, interviewers: true },
  });
  return getVisibleInterviewIds(interviews, userId);
}

async function interviewerInterviewWhere(
  userId: string,
  isAdminUser: boolean,
  extra: Prisma.InterviewWhereInput
): Promise<Prisma.InterviewWhereInput> {
  if (isAdminUser) return extra;
  const ids = await loadVisibleInterviewIds(userId);
  return { ...extra, id: { in: ids } };
}

function isUnsubmitted(evaluations: Array<{ submittedAt: Date | null }>): boolean {
  // 面试创建时会预生成待填评估行，故「没填」= 无行或 submittedAt 为空
  if (evaluations.length === 0) return true;
  return evaluations.every((e) => e.submittedAt == null);
}

function hasSubmitted(evaluations: Array<{ submittedAt: Date | null }>): boolean {
  return evaluations.some((e) => e.submittedAt != null);
}

// P-1 骨架：保留以免破坏 role-middleware 用例
router.get('/my', ...interviewerGuard, async (_req, res, next) => {
  try {
    res.json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
});

// 今日面试
router.get('/today', ...interviewerGuard, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const isAdminUser = req.user!.role === 'admin';
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const where = await interviewerInterviewWhere(userId, isAdminUser, {
      status: 'scheduled',
      scheduledAt: { gte: todayStart, lte: todayEnd },
    });

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({ success: true, data: interviews });
  } catch (err) {
    next(err);
  }
});

// 待填评估：已结束且本人尚未提交
router.get('/pending-evaluations', ...interviewerGuard, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const isAdminUser = req.user!.role === 'admin';
    const where = await interviewerInterviewWhere(userId, isAdminUser, {
      status: 'completed',
    });

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
        evaluations: { where: { interviewerId: userId } },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    const pending = interviews.filter((i) => isUnsubmitted(i.evaluations));
    res.json({ success: true, data: pending });
  } catch (err) {
    next(err);
  }
});

// 历史面试（已填评估）
router.get('/history', ...interviewerGuard, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const isAdminUser = req.user!.role === 'admin';
    const where = await interviewerInterviewWhere(userId, isAdminUser, {
      status: 'completed',
    });

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
        evaluations: { where: { interviewerId: userId } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });

    const evaluated = interviews.filter((i) => hasSubmitted(i.evaluations));
    res.json({ success: true, data: evaluated });
  } catch (err) {
    next(err);
  }
});

// 兼容旧客户端：新流程统一使用 PUT /api/evaluations/:id，不再允许按面试 ID upsert 评估。
router.put('/:id/evaluation', ...interviewerGuard, async (_req, _res, next) => {
  try {
    throw new AppError('该评估接口已废弃，请使用 /api/evaluations/:id', 410);
  } catch (err) {
    next(err);
  }
});

export default router;
