import { Router, type Router as RouterType } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../lib/env';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';

const router: RouterType = Router();

// 登录请求验证 schema
const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(6, '密码至少6位字符'),
});

// 注册请求验证 schema
const registerSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(6, '密码至少6位字符'),
  name: z.string().min(2, '姓名至少2位字符').max(50, '姓名最多50位字符'),
  role: z.enum(['admin', 'member']).default('member'),
});

// 修改密码请求验证 schema
const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(6, '新密码至少6位字符'),
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: '邮箱或密码错误',
        code: 401,
      });
      return;
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: '邮箱或密码错误',
        code: 401,
      });
      return;
    }

    // 生成 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * POST /api/auth/register
 * 用户注册（需要管理员权限）
 */
router.post(
  '/register',
  authenticate,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    // 只有管理员可以创建用户
    if (req.user?.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: '只有管理员可以创建用户',
        code: 403,
      });
      return;
    }

    const { email, password, name, role } = req.body;

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        error: '该邮箱已被注册',
        code: 409,
      });
      return;
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
      },
    });

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  })
);

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在',
        code: 404,
      });
      return;
    }

    res.json({
      success: true,
      user,
    });
  })
);

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post(
  '/logout',
  authenticate,
  (_req, res) => {
    // JWT 无状态，服务端无需处理
    // 客户端删除 token 即可
    res.json({
      success: true,
      message: '登出成功',
    });
  }
);

/**
 * POST /api/auth/bind-feishu
 * 飞书用户首次登录时绑定本地账号
 */
router.post(
  '/bind-feishu',
  asyncHandler(async (req, res) => {
    const { email, password, feishuEmployeeId } = req.body;

    if (!email || !password || !feishuEmployeeId) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数',
      });
      return;
    }

    if (!feishuEmployeeId) {
      res.status(400).json({
        success: false,
        error: '无法获取飞书用户标识，请重新进入应用',
      });
      return;
    }

    // 1. 查找本地用户并验证密码
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: '邮箱或密码错误',
        code: 401,
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: '邮箱或密码错误',
        code: 401,
      });
      return;
    }

    // 2. 更新 feishuEmployeeId
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { feishuEmployeeId },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        res.status(409).json({
          success: false,
          error: '该飞书账号已被其他用户绑定',
        });
        return;
      }
      throw err;
    }

    // 3. 签发 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      success: true,
      message: '绑定并登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  })
);

/**
 * POST /api/auth/change-password
 * 修改密码
 */
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: '用户不存在',
        code: 404,
      });
      return;
    }

    // 验证旧密码
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordValid) {
      res.status(400).json({
        success: false,
        error: '当前密码错误',
        code: 400,
      });
      return;
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({
      success: true,
      message: '密码修改成功',
    });
  })
);

/**
 * POST /api/auth/feishu/login
 * 飞书免登登录
 */
router.post(
  '/feishu/login',
  asyncHandler(async (req, res) => {
    const { authCode } = req.body;
    if (!authCode) {
      res.status(400).json({ success: false, error: '缺少 authCode' });
      return;
    }

    // 1. 获取飞书应用凭证
    const appAccessTokenRes = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: env.FEISHU_APP_ID,
          app_secret: env.FEISHU_APP_SECRET,
        }),
      }
    ).then((r) => r.json() as Promise<{ code: number; msg?: string; app_access_token?: string }>);

    if (appAccessTokenRes.code !== 0) {
      res.status(400).json({
        success: false,
        error: appAccessTokenRes.msg || '获取飞书应用凭证失败',
      });
      return;
    }

    const appAccessToken = appAccessTokenRes.app_access_token;

    // 2. 用 authCode 获取用户信息
    const userInfoRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appAccessToken}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: authCode,
        }),
      }
    ).then((r) => r.json() as Promise<{ code: number; msg?: string; data?: { employee_no?: string; user_id?: string; name?: string } }>);

    if (userInfoRes.code !== 0) {
      res.status(400).json({
        success: false,
        error: userInfoRes.msg || '飞书授权码无效或已过期',
      });
      return;
    }

    const feishuEmployeeId =
      userInfoRes.data?.employee_no || userInfoRes.data?.user_id || '';

    // 3. 匹配本地用户
    const user = await prisma.user.findFirst({
      where: { feishuEmployeeId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        code: 'USER_NOT_BOUND',
        error: '账号未绑定，请使用账号密码完成首次绑定',
        feishuEmployeeId,
      });
      return;
    }

    // 4. 签发 JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  })
);

export default router;
