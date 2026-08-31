import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  userRoleBinding: {
    findMany: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockRedis = vi.hoisted(() => ({
  del: vi.fn(),
}));

const mockCache = vi.hoisted(() => ({
  getFromCache: vi.fn(),
  setCache: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/redis', () => ({
  redis: mockRedis,
  getFromCache: mockCache.getFromCache,
  setCache: mockCache.setCache,
}));

import {
  getUserPermissions,
  hasPermission,
  hasAnyPermission,
  invalidateUserPermissions,
  deleteRole,
} from '../../src/services/rbac.service';

describe('RBAC service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.getFromCache.mockResolvedValue(null);
    mockCache.setCache.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(1);
  });

  it('admin 用户 getUserPermissions 返回 ["*"]（无需查 DB、无需缓存）', async () => {
    const result = await getUserPermissions('user-admin', true);

    expect(result).toEqual(['*']);
    expect(mockPrisma.userRoleBinding.findMany).not.toHaveBeenCalled();
    expect(mockCache.getFromCache).not.toHaveBeenCalled();
    expect(mockCache.setCache).not.toHaveBeenCalled();
  });

  it('普通用户有 3 个权限时，DB 查询 1 次 + 缓存命中', async () => {
    const threePerms = ['offer:create', 'offer:reject', 'job:create'];
    mockPrisma.userRoleBinding.findMany.mockResolvedValue([
      {
        role: {
          enabled: true,
          rolePermissions: threePerms.map((code) => ({ permission: { code } })),
        },
      },
    ]);
    mockCache.getFromCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(threePerms);

    const first = await getUserPermissions('user-1', false);
    const second = await getUserPermissions('user-1', false);

    expect(first).toEqual(threePerms);
    expect(second).toEqual(threePerms);
    expect(mockPrisma.userRoleBinding.findMany).toHaveBeenCalledTimes(1);
    expect(mockCache.setCache).toHaveBeenCalledWith('rbac:perms:user-1', threePerms, 60);
    expect(mockCache.getFromCache).toHaveBeenCalledTimes(2);
  });

  it('普通用户无任何角色时返回 []', async () => {
    mockPrisma.userRoleBinding.findMany.mockResolvedValue([]);

    const result = await getUserPermissions('user-none', false);

    expect(result).toEqual([]);
    expect(mockPrisma.userRoleBinding.findMany).toHaveBeenCalledTimes(1);
  });

  it('hasPermission 对 admin 永远返回 true（包括不存在的 code）', async () => {
    await expect(hasPermission('user-admin', true, 'does-not-exist')).resolves.toBe(true);
    await expect(hasPermission('user-admin', true, 'offer:approve')).resolves.toBe(true);
    expect(mockPrisma.userRoleBinding.findMany).not.toHaveBeenCalled();
  });

  it('hasAnyPermission 对 admin 永远返回 true', async () => {
    await expect(hasAnyPermission('user-admin', true, ['nope', 'also-missing'])).resolves.toBe(
      true
    );
    expect(mockPrisma.userRoleBinding.findMany).not.toHaveBeenCalled();
  });

  it('invalidateUserPermissions 能正确清缓存', async () => {
    await invalidateUserPermissions('user-1');
    expect(mockRedis.del).toHaveBeenCalledWith('rbac:perms:user-1');
  });

  it('deleteRole 对 isSystem=true 的 admin/member 抛 AppError 400', async () => {
    mockPrisma.role.findUnique.mockResolvedValueOnce({
      id: 'role-admin',
      code: 'admin',
      isSystem: true,
    });
    await expect(deleteRole('role-admin')).rejects.toMatchObject({
      statusCode: 400,
      message: '系统角色 [admin] 不可删除',
    });
    expect(mockPrisma.role.delete).not.toHaveBeenCalled();

    mockPrisma.role.findUnique.mockResolvedValueOnce({
      id: 'role-member',
      code: 'member',
      isSystem: true,
    });
    await expect(deleteRole('role-member')).rejects.toMatchObject({
      statusCode: 400,
      message: '系统角色 [member] 不可删除',
    });
    expect(mockPrisma.role.delete).not.toHaveBeenCalled();
  });
});
