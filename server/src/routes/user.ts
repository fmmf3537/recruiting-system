import type { Request, Response } from 'express';
import { Router, type Router as RouterType } from 'express';
import { PrismaClient } from '@prisma/client';
import { body } from 'express-validator';
import { asyncHandler, createError } from '@middleware/error';
import { authenticate, authorize } from '@middleware/auth';

const router: RouterType = Router();
const prisma = new PrismaClient();

// 获取用户列表（仅管理员）
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'HR'),
  asyncHandler(async (_req: Request, res: Response) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: users,
    });
  })
);

// 获取单个用户
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);

    if (Number.isNaN(userId)) {
      throw createError('无效的用户ID', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw createError('用户不存在', 404);
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

// 更新用户信息
router.put(
  '/:id',
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('avatar').optional().trim(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);

    if (Number.isNaN(userId)) {
      throw createError('无效的用户ID', 400);
    }

    // 只能修改自己的信息，管理员可以修改任何人
    if (req.user!.userId !== userId && !['ADMIN', 'HR'].includes(req.user!.role)) {
      throw createError('没有权限', 403);
    }

    const { name, phone, avatar } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(avatar !== undefined && { avatar }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      message: '更新成功',
      data: user,
    });
  })
);

export default router;
