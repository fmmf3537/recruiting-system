import { randomInt } from 'crypto';
import { Router, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { getFromCache, setCache, clearListCache } from '../lib/redis';
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

// 成员管理可分配角色：member 为历史遗留值，新建/编辑不再开放，统一用 hr
const MANAGEABLE_USER_ROLES = ['admin', 'hr', 'hiring_manager', 'interviewer'] as const;

// 创建用户验证 schema（E2E-P2.5）
const createUserSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址').max(254),
  password: passwordSchema,
  name: z.string().min(2, '姓名至少2位字符').max(50, '姓名最多50位字符'),
  role: z.enum(MANAGEABLE_USER_ROLES),
  department: z.string().max(50).optional().nullable(),
});

// 更新用户信息验证 schema
const updateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().max(254).optional(),
  password: passwordSchema.optional(),
  role: z.enum(MANAGEABLE_USER_ROLES).optional(),
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
        orderBy: { createdAt: 'asc' },
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
 * POST /api/users
 * 创建成员（仅管理员，E2E-P2.5 补齐）
 * - 修复前端 createUser 报 404 的 bug
 * - 邮箱唯一、密码策略校验、OperationLog + 列表缓存失效
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, role, department } = req.body;

    // 邮箱唯一校验
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError('该邮箱已被注册', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        // 约定：undefined / 空串 → 存 null
        department: department === undefined || department === '' ? null : department,
      },
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

    // 操作日志（失败仅记录，不阻断主流程）
    try {
      await prisma.operationLog.create({
        data: {
          userId: req.user!.userId,
          targetType: 'User',
          targetId: user.id,
          action: 'user_create',
          detail: { email: user.email, name: user.name, role: user.role },
        },
      });
    } catch (logErr) {
      console.error('用户创建 OperationLog 写入失败:', logErr);
    }

    // 列表缓存失效
    await clearListCache('users:list:*');

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: user,
    });
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
        department: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('用户不存在', 404);
    }

    res.json({ success: true, data: user });
  })
);

/**
 * PUT /api/users/:id
 * 更新成员信息
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(commonSchemas.idParam, 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new AppError('用户不存在', 404);
    }

    // 如果要更新邮箱，检查新邮箱是否已被其他用户使用
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailUser = await prisma.user.findUnique({ where: { email: updateData.email } });
      if (emailUser && emailUser.id !== id) {
        throw new AppError('该邮箱已被其他用户使用', 409);
      }
    }

    // 如果要更新密码，加密
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
      // 修改密码后递增 tokenVersion，使所有设备 token 失效
      await prisma.user.update({
        where: { id },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    // 规范化 department 字段
    if ('department' in updateData) {
      updateData.department =
        updateData.department === undefined || updateData.department === '' ? null : updateData.department;
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

    // 操作日志
    try {
      await prisma.operationLog.create({
        data: {
          userId: req.user!.userId,
          targetType: 'User',
          targetId: id,
          action: 'user_update',
          detail: { updatedFields: Object.keys(updateData) },
        },
      });
    } catch (logErr) {
      console.error('用户更新 OperationLog 写入失败:', logErr);
    }

    // 清除列表缓存
    await clearListCache('users:list:*');

    res.json({
      success: true,
      message: '用户更新成功',
      data: updatedUser,
    });
  })
);

/**
 * POST /api/users/:id/reset-password
 * 重置用户密码（仅管理员）
 * 生成 12 位随机临时密码，返回给管理员，需自行告知用户
 */
router.post(
  '/:id/reset-password',
  authenticate,
  authorize('admin'),
  validate(commonSchemas.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new AppError('用户不存在', 404);
    }

    // 生成临时密码
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 更新密码并递增 tokenVersion（使所有设备 token 失效）
    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    });

    // 操作日志（包含临时密码明文，供审计回溯）
    try {
      await prisma.operationLog.create({
        data: {
          userId: req.user!.userId,
          targetType: 'User',
          targetId: id,
          action: 'reset_password',
          detail: {
            email: existingUser.email,
            name: existingUser.name,
            tempPassword,
          },
        },
      });
    } catch (logErr) {
      console.error('密码重置 OperationLog 写入失败:', logErr);
    }

    // 清除列表缓存
    await clearListCache('users:list:*');

    res.json({
      success: true,
      message: '密码重置成功',
      data: {
        tempPassword,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        },
      },
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
    if (req.user!.userId === id) {
      throw new AppError('不能删除自己的账号', 400);
    }

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new AppError('用户不存在', 404);
    }

    await prisma.user.delete({ where: { id } });

    // 操作日志
    try {
      await prisma.operationLog.create({
        data: {
          userId: req.user!.userId,
          targetType: 'User',
          targetId: id,
          action: 'user_delete',
          detail: { email: existingUser.email, name: existingUser.name },
        },
      });
    } catch (logErr) {
      console.error('用户删除 OperationLog 写入失败:', logErr);
    }

    // 清除列表缓存
    await clearListCache('users:list:*');

    res.json({
      success: true,
      message: '用户删除成功',
    });
  })
);

export default router;
