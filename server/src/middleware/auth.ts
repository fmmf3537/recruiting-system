import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env';
import prisma from '../lib/prisma';

// JWT Payload 类型
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT 认证中间件
 * 验证请求头中的 Authorization Bearer token
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: '未提供认证令牌',
        code: 401,
      });
      return;
    }

    const token = authHeader.substring(7);

    // 验证 JWT
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: '用户不存在或已被删除',
        code: 401,
      });
      return;
    }

    // 将用户信息注入到请求对象
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: '无效的认证令牌',
        code: 401,
      });
      return;
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: '认证令牌已过期',
        code: 401,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: '认证过程中发生错误',
      code: 500,
    });
  }
};

/**
 * 角色授权中间件
 * @param roles 允许访问的角色列表
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: '未认证',
        code: 401,
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: '没有权限执行此操作',
        code: 403,
      });
      return;
    }

    next();
  };
};
