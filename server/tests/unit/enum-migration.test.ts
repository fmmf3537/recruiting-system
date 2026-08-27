import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma, User } from '@prisma/client';
import { UserRole } from '@prisma/client';

// 编译期：User.role 必须是 UserRole（与 Prisma Client 生成类型对齐）
type AssertEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type _UserRoleFieldIsEnum = AssertEqual<User['role'], UserRole>;
const userRoleFieldIsEnum: _UserRoleFieldIsEnum = true;

vi.mock('../../src/lib/prisma', () => ({
  default: {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../../src/lib/prisma';

describe('enum-migration - Prisma enum 类型', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('User.role 类型为 UserRole（编译期检查）', () => {
    const role: User['role'] = UserRole.admin;
    expect(userRoleFieldIsEnum).toBe(true);
    expect(role).toBe(UserRole.admin);
    expect(role).toBe('admin');
  });

  it('prisma.user.create 传入 UserRole.admin 合法，非法字符串被 TypeScript 拒绝', async () => {
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-1',
      role: UserRole.admin,
    } as never);

    const validData: Prisma.UserCreateInput = {
      email: 'admin@test.com',
      password: 'hashed',
      name: '管理员',
      role: UserRole.admin,
    };

    await prisma.user.create({ data: validData });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: validData });

    // @ts-expect-error 非法 role 字符串应被 TypeScript 拒绝
    const invalidRole: User['role'] = 'superadmin';
    expect(String(invalidRole)).toBe('superadmin');
  });

  it('where: { role: UserRole.admin } 能被 mock 正确接收', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    await prisma.user.findMany({ where: { role: UserRole.admin } });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: UserRole.admin },
    });
  });
});
