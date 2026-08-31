import type { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../services/rbac.service';
import { AppError } from './errorHandler';

export function requirePermission(code: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('未认证', 401);
      }
      const isAdmin = req.user.role === 'admin';
      const allowed = await hasPermission(req.user.userId, isAdmin, code);
      if (!allowed) {
        throw new AppError(`没有权限：${code}`, 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
