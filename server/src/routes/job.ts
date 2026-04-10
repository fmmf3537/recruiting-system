import type { Request, Response } from 'express';
import { Router, type Router as RouterType } from 'express';
import { PrismaClient, type JobStatus } from '@prisma/client';
import { body } from 'express-validator';
import { asyncHandler, createError } from '@middleware/error';
import { authenticate, authorize } from '@middleware/auth';

const router: RouterType = Router();
const prisma = new PrismaClient();

// 获取职位列表
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { status, department } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) {
      where.status = status as JobStatus;
    }

    if (department) {
      where.department = { contains: department as string, mode: 'insensitive' };
    }

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: jobs,
    });
  })
);

// 获取单个职位
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = parseInt(req.params.id, 10);

    if (Number.isNaN(jobId)) {
      throw createError('无效的职位ID', 400);
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw createError('职位不存在', 404);
    }

    res.json({
      success: true,
      data: job,
    });
  })
);

// 创建职位（仅 ADMIN/HR）
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'HR'),
  [
    body('title').trim().notEmpty().withMessage('请输入职位名称'),
    body('description').trim().notEmpty().withMessage('请输入职位描述'),
    body('department').trim().notEmpty().withMessage('请输入部门'),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { title, description, department, location, salaryMin, salaryMax, requirements } =
      req.body;

    const job = await prisma.job.create({
      data: {
        title,
        description,
        department,
        location,
        salaryMin,
        salaryMax,
        requirements: requirements || [],
        createdBy: req.user!.userId,
      },
    });

    res.status(201).json({
      success: true,
      message: '职位创建成功',
      data: job,
    });
  })
);

// 更新职位
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'HR'),
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = parseInt(req.params.id, 10);

    if (Number.isNaN(jobId)) {
      throw createError('无效的职位ID', 400);
    }

    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!existingJob) {
      throw createError('职位不存在', 404);
    }

    const { title, description, department, location, salaryMin, salaryMax, requirements, status } =
      req.body;

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(department && { department }),
        ...(location !== undefined && { location }),
        ...(salaryMin !== undefined && { salaryMin }),
        ...(salaryMax !== undefined && { salaryMax }),
        ...(requirements && { requirements }),
        ...(status && { status }),
      },
    });

    res.json({
      success: true,
      message: '职位更新成功',
      data: job,
    });
  })
);

// 删除职位
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'HR'),
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = parseInt(req.params.id, 10);

    if (Number.isNaN(jobId)) {
      throw createError('无效的职位ID', 400);
    }

    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!existingJob) {
      throw createError('职位不存在', 404);
    }

    await prisma.job.delete({
      where: { id: jobId },
    });

    res.json({
      success: true,
      message: '职位删除成功',
    });
  })
);

export default router;
