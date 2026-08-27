import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../lib/env';
import prisma from '../lib/prisma';
import { getFromCache, setCache } from '../lib/redis';
import { AppError } from './errorHandler';

// JWT Payload 类型
export interface JwtPayload {
  userId: string;
  email: string;
  department: string | null;
  role: string;
  // JWT 吊销版本号（旧 token 可能无此字段，按 0 处理）
  tokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

type CachedAuthUser = {
  id: string;
  email: string;
  role: string;
  department: string | null;
  tokenVersion: number;
};

const AUTH_USER_CACHE_TTL_SECONDS = 60;

/** 进程内 in-flight 合并，避免缓存击穿时并发重复查 DB（不是 LRU） */
const inflightAuthUserLoads = new Map<string, Promise<CachedAuthUser | null>>();

export function authUserCacheKey(userId: string): string {
  return `auth:user:${userId}`;
}

async function loadAuthUser(userId: string): Promise<CachedAuthUser | null> {
  const cacheKey = authUserCacheKey(userId);
  const cached = await getFromCache<CachedAuthUser>(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = inflightAuthUserLoads.get(userId);
  if (pending) {
    return pending;
  }

  const load = (async (): Promise<CachedAuthUser | null> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, role: true, department: true, tokenVersion: true,
      },
    });
    if (user) {
      await setCache(cacheKey, user, AUTH_USER_CACHE_TTL_SECONDS);
    }
    return user;
  })().finally(() => {
    inflightAuthUserLoads.delete(userId);
  });

  inflightAuthUserLoads.set(userId, load);
  return load;
}

async function loadUserFromToken(token: string): Promise<JwtPayload> {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('认证令牌已过期', 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('无效的认证令牌', 401);
    }
    throw new AppError('认证过程中发生错误', 500);
  }

  const user = await loadAuthUser(decoded.userId);

  if (!user) {
    throw new AppError('用户不存在或已被禁用', 401);
  }

  // JWT 与数据库不一致时拒绝（降权/改邮箱后旧 token 失效）
  if (
    user.email !== decoded.email
    || user.role !== decoded.role
    || (user.department || null) !== decoded.department
  ) {
    throw new AppError('认证令牌已失效，请重新登录', 401);
  }

  // tokenVersion 不一致说明密码已修改/被重置，吊销旧 token（改密即全端下线）
  if (user.tokenVersion !== (decoded.tokenVersion ?? 0)) {
    throw new AppError('认证令牌已失效，请重新登录', 401);
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    department: user.department || null,
  };
}

// 仅从 Authorization Header 提取 token（常规 API 场景）
// query.token 会进入访问日志/浏览器历史/Referer，仅限文件下载等特殊场景使用
function extractTokenFromHeader(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
}

// Header 或 query.token 均可（仅限文件下载等浏览器直接打开的场景）
function extractToken(req: Request): string | undefined {
  const headerToken = extractTokenFromHeader(req);
  if (headerToken) {
    return headerToken;
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return undefined;
}

/**
 * JWT 认证中间件
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      res.status(401).json({
        success: false,
        error: '未提供认证令牌',
        code: 401,
      });
      return;
    }

    req.user = await loadUserFromToken(token);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.statusCode,
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
 * 文件下载等场景：Header 或 query.token 均可
 */
export const authenticateFlexible = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError('未提供认证令牌', 401);
    }
    req.user = await loadUserFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

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

export function getUserDepartment(req: Request): string | undefined {
  if (req.user!.role === 'admin') return undefined;
  return req.user!.department || undefined;
}
