import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { body } from 'express-validator';
import { asyncHandler, createError } from '@middleware/error';
import { authenticate, authorize } from '@middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 获取候选人列表
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { status, keyword } = req.query;

    const where: {
      status?: { equals: string };
      user?: {
        OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; email?: { contains: string; mode: 'insensitive' } }>;
      };
    } = {};

    if (status) {
      where.status = { equals: status as string };
    }

    if (keyword) {
      where.user = {
        OR: [
          { name: { contains: keyword as string, mode: 'insensitive' } },
          { email: { contains: keyword as string, mode: 'insensitive' } },
        ],
      };
    }

    const candidates = await prisma.candidate.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            phone: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    res.json({
      success: true,
      data: candidates,
    });
  })
);

// 获取单个候选人
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const candidateId = parseInt(req.params.id, 10);

    if (Number.isNaN(candidateId)) {
      throw createError('无效的候选人ID', 400);
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            phone: true,
          },
        },
        interviews: {
          include: {
            job: true,
            interviewer: {
              include: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!candidate) {
      throw createError('候选人不存在', 404);
    }

    res.json({
      success: true,
      data: candidate,
    });
  })
);

// 更新候选人信息
router.put(
  '/:id',
  authenticate,
  [
    body('resume').optional().trim(),
    body('skills').optional().isArray(),
    body('experience').optional().isInt(),
    body('education').optional().trim(),
    body('status').optional().isIn(['ACTIVE', 'INTERVIEWING', 'HIRED', 'REJECTED', 'ARCHIVED']),
  ],
  asyncHandler(async (req, res) => {
    const candidateId = parseInt(req.params.id, 10);

    if (Number.isNaN(candidateId)) {
      throw createError('无效的候选人ID', 400);
    }

    const existingCandidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!existingCandidate) {
      throw createError('候选人不存在', 404);
    }

    // 候选人只能修改自己的信息
    if (
      req.user!.role === 'CANDIDATE' &&
      existingCandidate.userId !== req.user!.userId
    ) {
      throw createError('没有权限', 403);
    }

    const { resume, skills, experience, education, status } = req.body;

    const candidate = await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        ...(resume !== undefined && { resume }),
        ...(skills && { skills }),
        ...(experience !== undefined && { experience }),
        ...(education && { education }),
        ...(status && { status }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            phone: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: '更新成功',
      data: candidate,
    });
  })
);

// 删除候选人（仅管理员）
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const candidateId = parseInt(req.params.id, 10);

    if (Number.isNaN(candidateId)) {
      throw createError('无效的候选人ID', 400);
    }

    const existingCandidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!existingCandidate) {
      throw createError('候选人不存在', 404);
    }

    await prisma.candidate.delete({
      where: { id: candidateId },
    });

    res.json({
      success: true,
      message: '删除成功',
    });
  })
);

export default router;
