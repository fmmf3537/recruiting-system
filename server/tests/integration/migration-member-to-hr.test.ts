import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const renameSqlPath = join(
  here,
  '../../prisma/migrations/20260901000001_rename_member_to_hr/migration.sql'
);
const addHrSqlPath = join(
  here,
  '../../prisma/migrations/20260901000000_add_user_role_hr/migration.sql'
);

/** 与 migration SQL 语义一致：只把 member 改成 hr */
function applyMemberToHr(
  users: Array<{ id: string; role: string }>
): Array<{ id: string; role: string }> {
  return users.map((u) => (u.role === 'member' ? { ...u, role: 'hr' } : { ...u }));
}

describe('member → hr 数据迁移', () => {
  it('migration SQL 是幂等的（WHERE role = member）', () => {
    const addSql = readFileSync(addHrSqlPath, 'utf8');
    const renameSql = readFileSync(renameSqlPath, 'utf8');
    expect(addSql).toContain("ADD VALUE 'hr'");
    expect(renameSql).toMatch(/UPDATE\s+"user"/i);
    expect(renameSql).toContain("role = 'hr'");
    expect(renameSql).toContain("WHERE role = 'member'");
  });

  it('member → hr 转换正确', () => {
    const result = applyMemberToHr([
      { id: '1', role: 'admin' },
      { id: '2', role: 'member' },
      { id: '3', role: 'hiring_manager' },
    ]);
    expect(result.find((u) => u.id === '2')?.role).toBe('hr');
    expect(result.find((u) => u.id === '1')?.role).toBe('admin');
  });

  it('已经有 hr 用户的不会受影响', () => {
    const result = applyMemberToHr([
      { id: 'hr-1', role: 'hr' },
      { id: 'm-1', role: 'member' },
    ]);
    expect(result.find((u) => u.id === 'hr-1')?.role).toBe('hr');
    expect(result.find((u) => u.id === 'm-1')?.role).toBe('hr');
  });

  it('已经迁移过的库再次跑 migration 结果一致', () => {
    const once = applyMemberToHr([
      { id: '1', role: 'member' },
      { id: '2', role: 'admin' },
      { id: '3', role: 'hr' },
    ]);
    const twice = applyMemberToHr(once);
    expect(twice).toEqual(once);
    expect(twice.filter((u) => u.role === 'member')).toHaveLength(0);
  });
});
