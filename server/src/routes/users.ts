import { Router, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { getFromCache, setCache, clearListCache } from '../lib/redis';
import { authenticate, authorize } from '../middleware/auth';
import { validate, commonSchemas } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router: RouterType = Router();

// 更新用户信息验证 schema
const updateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'member']).optional(),
  department: z.string().optional().nullable(),
});

// 分页查询验证 schema
const listQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('10').transform(Number),
  search: z.string().optional(),
});

/**
 * GET /api/users
 * 获取成员列表（仅管理员）
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, search } = req.query as unknown as { page: number; limit: number; search?: string };
    const cacheKey = `users:list:${JSON.stringify({ page, limit, search })}`;
    const cached = await getFromCache<{ success: boolean; data: unknown; pagination: unknown }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const skip = (page - 1) * limit;

    // 构建查询条件
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // 并行查询数据和总数
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          department: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const result = {
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await setCache(cacheKey, result, 60);
    res.json(result);
  })
);

/**
 * GET /api/users/:id
 * 获取单个成员信息
 */
router.get(
  '/:id',
  authenticate,
  validate(commonSchemas.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 非管理员只能查看自己的信息
    if (req.user?.role !== 'admin' && req.user?.userId !== id) {
      throw new AppError('没有权限查看此用户信息', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('用户不存在', 404);
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

/**
 * PUT /api/users/:id
 * 更新成员信息
 */
router.put(
  '/:id',
  authenticate,
  validate(commonSchemas.idParam, 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role, department } = req.body;

    // 非管理员只能修改自己的信息
    if (req.user?.role !== 'admin' && req.user?.userId !== id) {
      throw new AppError('没有权限修改此用户信息', 403);
    }

    // 非管理员不能修改角色
    if (role && req.user?.role !== 'admin') {
      throw new AppError('没有权限修改角色', 403);
    }

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new AppError('用户不存在', 404);
    }

    // 如果修改邮箱，检查是否已被其他用户使用
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
      });
      if (emailTaken) {
        throw new AppError('该邮箱已被其他用户使用', 409);
      }
    }

    // 构建更新数据
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        department: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await clearListCache('users:list:*');

    res.json({
      success: true,
      message: '用户信息更新成功',
      data: updatedUser,
    });
  })
);

/**
 * DELETE /api/users/:id
 * 删除成员（仅管理员）
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(commonSchemas.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 不能删除自己
    if (req.user?.userId === id) {
      throw new AppError('不能删除自己的账号', 400);
    }

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new AppError('用户不存在', 404);
    }

    await prisma.user.delete({
      where: { id },
    });

    await clearListCache('users:list:*');

    res.json({
      success: true,
      message: '用户删除成功',
    });
  })
);

export default router;
