import { randomInt } from 'crypto';
import { Router, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { redis, getFromCache, setCache, clearListCache } from '../lib/redis';
import { authenticate, authorize } from '../middleware/auth';
import { validate, commonSchemas, passwordSchema } from '../middleware/validate';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router: RouterType = Router();

// 生成 12 位随机临时密码：保证至少含一个字母和一个数字，满足密码策略
function generateTempPassword(): string {
  // 去除易混淆字符（0/O、1/l/I 等）
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [
    letters[randomInt(letters.length)],
    digits[randomInt(digits.length)],
  ];
  for (let i = chars.length; i < 12; i += 1) {
    chars.push(all[randomInt(all.length)]);
  }
  // 打乱顺序，避免固定前两位模式
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// 更新用户信息验证 schema
const updateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().max(254).optional(),
  password: passwordSchema.optional(),
  role: z.enum(['admin', 'member']).optional(),
  department: z.string().max(50).optional().nullable(),
});

// 分页查询验证 schema
const listQuerySchema = z.object({
  page: z.string().max(10).optional().default('1').transform(Number),
  limit: z.string().max(10).optional().default('10').transform(Number),
  search: z.string().max(100).optional(),
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
 * GET /api/users/approver-options
 * 获取可选审批人列表（管理员基础信息），供 Offer 提交审批时选择审批人
 * 权限：登录用户（仅返回 id/name/email，不含敏感信息）
 * 注意：必须注册在 /:id 之前，避免被当作 id 匹配
 */
router.get(
  '/approver-options',
  authenticate,
  asyncHandler(async (_req, res) => {
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: admins,
    });
  })
);

/**
 * GET /api/users/interviewer-options
 * 可选面试官列表（interviewer / hr / hiring_manager / admin），供面试安排选择面试官
 * 权限：登录用户（仅返回 id/name/department，无敏感信息）
 * 注意：注册在 /:id 之前，避免被当作 id 匹配
 */
router.get(
  '/interviewer-options',
  authenticate,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { role: { in: ['interviewer', 'hr', 'hiring_manager', 'admin'] } },
      select: { id: true, name: true, department: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: users });
  }),
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

    // 非管理员不能修改部门（部门用于数据隔离，防止成员自行提权）
    if (department !== undefined && req.user?.role !== 'admin') {
      throw new AppError('没有权限修改部门', 403);
    }

    // 非管理员不能通过此接口修改密码，防止会话被劫持后静默改密；
    // 修改密码请走 /auth/change-password（需验证旧密码）
    if (req.user?.role !== 'admin' && password) {
      throw new AppError('请通过"修改密码"功能修改密码', 403);
    }

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new AppError('用户不存在', 404);
    }

    // 非管理员不能修改登录邮箱（与密码同理，防止会话被劫持后接管账号）
    if (req.user?.role !== 'admin' && email && email !== existingUser.email) {
      throw new AppError('修改邮箱请联系管理员', 403);
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
      // 管理员直接改密同样 tokenVersion +1，强制该用户重新登录
      updateData.tokenVersion = { increment: 1 };
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
 * POST /api/users/:id/reset-password
 * 管理员重置成员密码：生成 12 位随机临时密码（仅本次返回，不落明文）
 */
router.post(
  '/:id/reset-password',
  authenticate,
  authorize('admin'),
  validate(commonSchemas.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 检查用户是否存在
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      throw new AppError('用户不存在', 404);
    }

    // 生成临时密码并加密存储（明文仅在本次响应中返回给管理员）
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 重置密码同时 tokenVersion +1，强制该用户所有端重新登录
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword, tokenVersion: { increment: 1 } },
    });
    try {
      await redis.del(`auth:user:${id}`);
    } catch (error) {
      console.error('Failed to invalidate auth user cache:', error);
    }

    // 写入操作日志
    await prisma.operationLog.create({
      data: {
        userId: req.user!.userId,
        targetType: 'User',
        targetId: id,
        action: 'password_reset',
        detail: { targetEmail: targetUser.email, targetName: targetUser.name },
      },
    });

    res.json({
      success: true,
      message: '密码已重置，请将临时密码告知该成员',
      data: { tempPassword },
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
