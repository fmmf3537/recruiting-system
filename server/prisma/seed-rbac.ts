import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  { code: 'admin', name: '管理员', isSystem: true, description: '系统管理员（通配符 *）' },
  { code: 'member', name: '普通成员', isSystem: true, description: '普通 HR' },
  { code: 'hiring_manager', name: '用人经理', isSystem: false, description: '用人部门经理' },
];

const PERMISSIONS = [
  { code: 'offer:approve', resource: 'offer', action: 'approve', description: '审批 Offer' },
  { code: 'offer:create', resource: 'offer', action: 'create', description: '创建 Offer' },
  { code: 'offer:reject', resource: 'offer', action: 'reject', description: '驳回 Offer' },
  { code: 'candidate:export', resource: 'candidate', action: 'export', description: '导出候选人' },
  { code: 'candidate:delete', resource: 'candidate', action: 'delete', description: '删除候选人' },
  { code: 'candidate:restore', resource: 'candidate', action: 'restore', description: '恢复候选人' },
  { code: 'job:create', resource: 'job', action: 'create', description: '创建职位' },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, isSystem: role.isSystem },
      create: role,
    });
  }

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm,
    });
  }

  // v1.3：admin 不显式分配 permission，靠 runtime 短路 return ['*']
  const memberRole = await prisma.role.findUnique({ where: { code: 'member' } });
  if (!memberRole) {
    throw new Error('member 角色不存在');
  }

  const allPerms = await prisma.permission.findMany();
  const memberPerms = allPerms.filter(
    (p) => p.code !== 'offer:approve' && p.code !== 'candidate:restore'
  );

  for (const perm of memberPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: memberRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: memberRole.id, permissionId: perm.id },
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
