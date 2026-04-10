import type { Request, Response } from 'express';
import { Router, type Router as RouterType } from 'express';
import { PrismaClient, type InterviewStatus, type InterviewType } from '@prisma/client';
import { body } from 'express-validator';
import { asyncHandler, createError } from '@middleware/error';
import { authenticate, authorize } from '@middleware/auth';

const router: RouterType = Router();
const prisma = new PrismaClient();

// 获取面试列表
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { status, candidateId, interviewerId } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) {
      where.status = status as InterviewStatus;
    }

    if (candidateId) {
      where.candidateId = parseInt(candidateId as string, 10);
    }

    if (interviewerId) {
      where.interviewerId = parseInt(interviewerId as string, 10);
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        interviewer: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        job: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({
      success: true,
      data: interviews,
    });
  })
);

// 获取单个面试
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = parseInt(req.params.id, 10);

    if (Number.isNaN(interviewId)) {
      throw createError('无效的面试ID', 400);
    }

    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        interviewer: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        job: true,
        comments: {
          include: {
            candidate: true,
            interviewer: true,
          },
        },
      },
    });

    if (!interview) {
      throw createError('面试不存在', 404);
    }

    res.json({
      success: true,
      data: interview,
    });
  })
);

// 创建面试
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'HR'),
  [
    body('candidateId').isInt().withMessage('请选择候选人'),
    body('interviewerId').isInt().withMessage('请选择面试官'),
    body('jobId').isInt().withMessage('请选择职位'),
    body('scheduledAt').isISO8601().withMessage('请选择有效的时间'),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { candidateId, interviewerId, jobId, scheduledAt, duration, type, location, meetingLink } =
      req.body;

    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: parseInt(candidateId, 10) },
    });

    if (!candidate) {
      throw createError('候选人不存在', 404);
    }

    // 验证面试官是否存在
    const interviewer = await prisma.interviewer.findUnique({
      where: { id: parseInt(interviewerId, 10) },
    });

    if (!interviewer) {
      throw createError('面试官不存在', 404);
    }

    // 验证职位是否存在
    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId, 10) },
    });

    if (!job) {
      throw createError('职位不存在', 404);
    }

    const interview = await prisma.interview.create({
      data: {
        candidateId: parseInt(candidateId, 10),
        interviewerId: parseInt(interviewerId, 10),
        jobId: parseInt(jobId, 10),
        scheduledAt: new Date(scheduledAt),
        duration: duration || 60,
        type: type || 'FACE_TO_FACE',
        location,
        meetingLink,
      },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        interviewer: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        job: true,
      },
    });

    res.status(201).json({
      success: true,
      message: '面试安排成功',
      data: interview,
    });
  })
);

// 更新面试
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = parseInt(req.params.id, 10);

    if (Number.isNaN(interviewId)) {
      throw createError('无效的面试ID', 400);
    }

    const existingInterview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!existingInterview) {
      throw createError('面试不存在', 404);
    }

    const {
      scheduledAt,
      duration,
      type,
      location,
      meetingLink,
      status,
      feedback,
      score,
    } = req.body;

    const interview = await prisma.interview.update({
      where: { id: interviewId },
      data: {
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
        ...(duration && { duration }),
        ...(type && { type: type as InterviewType }),
        ...(location !== undefined && { location }),
        ...(meetingLink !== undefined && { meetingLink }),
        ...(status && { status: status as InterviewStatus }),
        ...(feedback !== undefined && { feedback }),
        ...(score !== undefined && { score }),
      },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        interviewer: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        job: true,
      },
    });

    res.json({
      success: true,
      message: '更新成功',
      data: interview,
    });
  })
);

// 删除面试
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'HR'),
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = parseInt(req.params.id, 10);

    if (Number.isNaN(interviewId)) {
      throw createError('无效的面试ID', 400);
    }

    const existingInterview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!existingInterview) {
      throw createError('面试不存在', 404);
    }

    await prisma.interview.delete({
      where: { id: interviewId },
    });

    res.json({
      success: true,
      message: '删除成功',
    });
  })
);

export default router;
