import prisma from '../lib/prisma';
import { getFromCache, setCache, redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

const CACHE_TTL = 60;
const CACHE_KEY_PREFIX = 'rbac:perms:';
const ADMIN_WILDCARD = ['*'];

export async function getUserPermissions(userId: string, isAdmin: boolean): Promise<string[]> {
  // v1.3：admin = ['*'] 通配符，不查 DB / 缓存
  if (isAdmin) return ADMIN_WILDCARD;

  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  const cached = await getFromCache<string[]>(cacheKey);
  if (cached) return cached;

  const userRoles = await prisma.userRoleBinding.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const enabledRoles = userRoles.filter((ur) => ur.role.enabled);
  const perms = new Set<string>();
  for (const ur of enabledRoles) {
    for (const rp of ur.role.rolePermissions) {
      perms.add(rp.permission.code);
    }
  }

  const result = Array.from(perms);
  await setCache(cacheKey, result, CACHE_TTL);
  return result;
}

export async function hasPermission(
  userId: string,
  isAdmin: boolean,
  code: string
): Promise<boolean> {
  const perms = await getUserPermissions(userId, isAdmin);
  return perms.includes('*') || perms.includes(code);
}

export async function hasAnyPermission(
  userId: string,
  isAdmin: boolean,
  codes: string[]
): Promise<boolean> {
  const perms = await getUserPermissions(userId, isAdmin);
  if (perms.includes('*')) return true;
  return codes.some((code) => perms.includes(code));
}

export async function invalidateUserPermissions(userId: string): Promise<void> {
  await redis.del(`${CACHE_KEY_PREFIX}${userId}`);
}

export async function deleteRole(roleId: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError('角色不存在', 404);
  if (role.isSystem) {
    throw new AppError(`系统角色 [${role.code}] 不可删除`, 400);
  }

  // 删角色后清对应用户权限缓存，否则 60s 内仍可见旧权限
  const bindings = await prisma.userRoleBinding.findMany({
    where: { roleId: role.id },
    select: { userId: true },
  });

  await prisma.role.delete({ where: { id: role.id } });
  await Promise.all(bindings.map((b) => invalidateUserPermissions(b.userId)));
}
