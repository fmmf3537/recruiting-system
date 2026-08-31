import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import {
  type UserRoleType,
  getRolePermissions,
  normalizeUserRole,
} from '../services/role-permission.service';

/**
 * 角色守卫：要求 user.role 在白名单内（member 视为 hr）
 */
export function requireRole(...allowedRoles: UserRoleType[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('未认证', 401);
      const userRole = normalizeUserRole(req.user.role);
      if (!allowedRoles.includes(userRole)) {
        throw new AppError(
          `您当前角色 [${userRole}] 无权访问，需要 [${allowedRoles.join(' / ')}]`,
          403
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 综合守卫：要求用户同时满足角色和权限
 */
export function requireRoleAndPermission(role: UserRoleType, permissionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('未认证', 401);
      const userRole = normalizeUserRole(req.user.role);
      if (userRole !== role) {
        throw new AppError(`您当前角色 [${userRole}] 无权访问`, 403);
      }
      const perms = getRolePermissions(userRole);
      const allowed = perms.includes(permissionCode) || perms.includes('*');
      if (!allowed) {
        throw new AppError(`没有权限：${permissionCode}`, 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 按权限矩阵校验（hiring_manager 无 candidate:update 等）
 */
export function requireMatrixPermission(permissionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('未认证', 401);
      const userRole = normalizeUserRole(req.user.role);
      const perms = getRolePermissions(userRole);
      if (!perms.includes('*') && !perms.includes(permissionCode)) {
        throw new AppError(`没有权限：${permissionCode}`, 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
