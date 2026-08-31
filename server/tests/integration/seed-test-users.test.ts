import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { seedTestUsers, TEST_USERS } from '../../prisma/seed-test-users';

const store = vi.hoisted(() => new Map<string, {
  email: string;
  name: string;
  role: string;
  department: string | null;
  password: string;
}>());

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $disconnect: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    user = mockPrisma.user;
    $disconnect = mockPrisma.$disconnect;
  },
}));

beforeEach(() => {
  store.clear();
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) => {
    return store.get(where.email) ?? null;
  });
  mockPrisma.user.create.mockImplementation(async ({ data }: { data: {
    email: string;
    name: string;
    role: string;
    department: string | null;
    password: string;
  } }) => {
    store.set(data.email, data);
    return data;
  });
});

describe('seed-test-users', () => {
  it('重复执行 seed 不会创建重复用户（upsert 语义）', async () => {
    await seedTestUsers(mockPrisma as never);
    await seedTestUsers(mockPrisma as never);

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(4);
    expect(store.size).toBe(4);
  });

  it('4 个测试用户都能用 bcrypt 密码登录', async () => {
    await seedTestUsers(mockPrisma as never);

    for (const user of TEST_USERS) {
      const saved = store.get(user.email);
      expect(saved).toBeDefined();
      const ok = await bcrypt.compare(user.password, saved!.password);
      expect(ok).toBe(true);
    }
  });

  it('role / department 字段都正确', async () => {
    await seedTestUsers(mockPrisma as never);

    for (const user of TEST_USERS) {
      const saved = store.get(user.email);
      expect(saved?.role).toBe(user.role);
      expect(saved?.department).toBe(user.department);
      expect(saved?.name).toBe(user.name);
    }
  });
});
