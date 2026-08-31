import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router: RouterType = Router();

export function isAdmin(role: string): boolean {
  return role === 'admin';
}

/**
 * 工作台职位范围：admin 不限；无部门时匹配空集；否则本部门 JSON 数组包含
 */
export function buildHiringJobFilter(
  role: string,
  department: string | null
): Prisma.JobWhereInput {
  if (isAdmin(role)) return {};
  if (!department) return { id: { in: [] } };
  return { departments: { array_contains: [department] } };
}

function buildHiringCandidateWhere(
  role: string,
  jobFilter: Prisma.JobWhereInput
): Prisma.CandidateWhereInput {
  const where: Prisma.CandidateWhereInput = { deletedAt: null };
  if (!isAdmin(role)) {
    where.candidateJobs = { some: { job: jobFilter } };
  }
  return where;
}

function assertOfferInDepartmentScope(
  candidateJobs: Array<{ job: { departments: Prisma.JsonValue } }>,
  role: string,
  department: string | null
): void {
  if (isAdmin(role)) return;
  if (!department) {
    throw new AppError('无权审批该 Offer', 403);
  }
  const inDept = candidateJobs.some((cj) => {
    const depts = cj.job.departments;
    return Array.isArray(depts) && depts.includes(department);
  });
  if (!inDept) {
    throw new AppError('无权审批该 Offer', 403);
  }
}

const hiringGuard = [authenticate, requireRole('admin', 'hiring_manager')] as const;

// 总览：本部门招聘概览
router.get('/overview', ...hiringGuard, async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = buildHiringJobFilter(role, department);
    const candidateWhere = buildHiringCandidateWhere(role, jobFilter);
    const interviewWhere: Prisma.InterviewWhereInput = {
      status: 'scheduled',
      scheduledAt: { gte: new Date() },
      ...(isAdmin(role) ? {} : { job: jobFilter }),
    };

    const [openJobs, activeCandidates, pendingOffers, scheduledInterviews] = await Promise.all([
      prisma.job.count({
        where: { ...jobFilter, status: 'open' },
      }),
      prisma.candidateJob.count({
        where: {
          ...(isAdmin(role) ? {} : { job: jobFilter }),
          candidate: { deletedAt: null },
        },
      }),
      prisma.offer.count({
        where: {
          status: 'pending_approval',
          candidate: candidateWhere,
        },
      }),
      prisma.interview.count({ where: interviewWhere }),
    ]);

    res.json({
      success: true,
      data: {
        scope: isAdmin(role) ? 'company' : 'department',
        department,
        openJobs,
        activeCandidates,
        pendingOffers,
        scheduledInterviews,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 待审批 Offer 列表（Offer 无 job 外键，经 candidateJobs 过滤并回填职位）
router.get('/approvals', ...hiringGuard, async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = buildHiringJobFilter(role, department);
    const candidateWhere = buildHiringCandidateWhere(role, jobFilter);

    const offers = await prisma.offer.findMany({
      where: {
        status: 'pending_approval',
        candidate: candidateWhere,
      },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            candidateJobs: {
              take: 1,
              include: { job: { select: { id: true, title: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const data = offers.map((o) => ({
      ...o,
      job: o.candidate.candidateJobs[0]?.job ?? null,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 审批 Offer（按 Offer id；hiring_manager 仅本部门）
router.post('/approvals/:id/approve', ...hiringGuard, async (req, res, next) => {
  try {
    const offerId = req.params.id;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const department = req.user!.department;

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        candidate: {
          select: {
            candidateJobs: {
              include: { job: { select: { departments: true } } },
            },
          },
        },
      },
    });
    if (!offer) throw new AppError('Offer 不存在', 404);
    if (offer.status !== 'pending_approval') {
      throw new AppError('Offer 状态不允许审批', 400);
    }
    assertOfferInDepartmentScope(offer.candidate.candidateJobs, role, department);

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: {
        status: 'approved',
        approverId: userId,
        approvedAt: new Date(),
      },
    });
    res.json({ success: true, data: updated, message: 'Offer 审批通过' });
  } catch (err) {
    next(err);
  }
});

// 本部门候选人列表（不含详情）
router.get('/candidates', ...hiringGuard, async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = buildHiringJobFilter(role, department);

    const candidates = await prisma.candidateJob.findMany({
      where: {
        ...(isAdmin(role) ? {} : { job: jobFilter }),
        candidate: { deletedAt: null },
      },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            currentPosition: true,
            currentCompany: true,
            education: true,
            workYears: true,
            stageRecords: {
              orderBy: { enteredAt: 'desc' },
              take: 1,
              select: { stage: true, status: true },
            },
          },
        },
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: candidates });
  } catch (err) {
    next(err);
  }
});

// 本部门即将到来的面试
router.get('/interviews', ...hiringGuard, async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = buildHiringJobFilter(role, department);
    const interviewWhere: Prisma.InterviewWhereInput = {
      status: 'scheduled',
      scheduledAt: { gte: new Date() },
      ...(isAdmin(role) ? {} : { job: jobFilter }),
    };

    const interviews = await prisma.interview.findMany({
      where: interviewWhere,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });

    res.json({ success: true, data: interviews });
  } catch (err) {
    next(err);
  }
});

export default router;
