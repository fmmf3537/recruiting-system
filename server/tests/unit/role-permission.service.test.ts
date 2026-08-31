import { describe, it, expect } from 'vitest';
import { getRolePermissions } from '../../src/services/role-permission.service';

describe('role-permission 矩阵', () => {
  it('admin 角色返回 ["*"] 通配符', () => {
    expect(getRolePermissions('admin')).toEqual(['*']);
  });

  it('hr 角色返回完整 HR 权限列表', () => {
    const hr = getRolePermissions('hr');
    expect(hr).toEqual(
      expect.arrayContaining([
        'candidate:read',
        'candidate:create',
        'candidate:update',
        'candidate:delete',
        'job:create',
        'offer:create',
        'offer:approve',
        'user:delete',
      ])
    );
    expect(hr.includes('*')).toBe(false);
  });

  it('hiring_manager 角色不含 candidate:create/update/delete', () => {
    const perms = getRolePermissions('hiring_manager');
    expect(perms).not.toContain('candidate:create');
    expect(perms).not.toContain('candidate:update');
    expect(perms).not.toContain('candidate:delete');
  });

  it('hiring_manager 角色含 offer:approve 与评估填写权限', () => {
    const perms = getRolePermissions('hiring_manager');
    expect(perms).toContain('offer:approve');
    expect(perms).toEqual(
      expect.arrayContaining(['evaluation:read', 'evaluation:create', 'evaluation:update'])
    );
  });

  it('interviewer 角色只含 interview + evaluation 权限', () => {
    const perms = getRolePermissions('interviewer');
    expect(perms).toHaveLength(5);
    expect(perms.every((p) => (
      p.startsWith('interview:')
      || p.startsWith('evaluation:')
      || p === 'candidate:read:limited'
    ))).toBe(true);
  });

  it('角色权限矩阵与 v1.0 PROMPT-14 RBAC 兼容', () => {
    expect(getRolePermissions('admin')).toEqual(['*']);
    const hr = getRolePermissions('hr');
    expect(hr).toEqual(
      expect.arrayContaining(['candidate:delete', 'job:create', 'offer:create', 'offer:reject'])
    );
  });
});
