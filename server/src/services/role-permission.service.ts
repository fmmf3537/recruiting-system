import prisma from '../lib/prisma';

export type UserRoleType = 'admin' | 'hr' | 'hiring_manager' | 'interviewer';

const HR_PERMISSIONS = [
  'candidate:read', 'candidate:create', 'candidate:update', 'candidate:delete', 'candidate:restore',
  'job:read', 'job:create', 'job:update', 'job:delete',
  'offer:read', 'offer:create', 'offer:update', 'offer:approve', 'offer:reject',
  'interview:read', 'interview:create', 'interview:update', 'interview:delete',
  'evaluation:read', 'evaluation:create', 'evaluation:update',
  'stage:read', 'stage:create', 'stage:update',
  'hc_request:read', 'hc_request:create', 'hc_request:approve',
  'tag:read', 'tag:create', 'tag:update', 'tag:delete',
  'dictionary:read', 'dictionary:create', 'dictionary:update',
  'automation:read', 'automation:create', 'automation:update',
  'user:read', 'user:create', 'user:update', 'user:delete',
  // F2-S：触发简历自动打分 + 查看打分列表
  'ai:match-score',
  // F1-S：JD 完善 / 草稿生成（PRD §4.4；interviewer 不给）
  'ai:jd-assist',
  // F3-S：面试问题一键生成（PRD §5.5；hr 可操作，service 层做候选人可见性精细校验）
  'ai:interview-outline',
  // F5-S：猎头机构 / 推荐链接管理（PRD §7；admin 天然拥有 '*'）
  'agency:manage',
] as const;

const HIRING_MANAGER_PERMISSIONS = [
  'candidate:read',
  'job:read',
  'offer:read', 'offer:approve',
  'interview:read',
  'evaluation:read', 'evaluation:create', 'evaluation:update',
  'stage:read',
  'hc_request:read', 'hc_request:create',
  'dictionary:read',
  // F2-S：用人部门可看 / 触发自动打分（PRD §3.1）
  'ai:match-score',
  // F1-S：用人部门可触发 JD 完善 / 草稿生成（PRD §4.4）
  'ai:jd-assist',
  // F3-S：用人部门作为面试官参场可生成大纲（service 层要求必须是该场面试官）
  'ai:interview-outline',
] as const;

const INTERVIEWER_PERMISSIONS = [
  'candidate:read:limited',
  'interview:read:limited',
  'evaluation:read', 'evaluation:create', 'evaluation:update',
  // F3-S：面试官本人作为该场面试官可生成大纲（service 层要求必须是该场面试官）
  'ai:interview-outline',
] as const;

/** P-5 之前 JWT / DB 仍为 member，权限矩阵按 hr 处理 */
export function normalizeUserRole(role: string): UserRoleType {
  if (role === 'member') return 'hr';
  if (role === 'admin' || role === 'hr' || role === 'hiring_manager' || role === 'interviewer') {
    return role;
  }
  throw new Error(`未知角色：${role}`);
}

/**
 * 角色权限矩阵（v3.0）
 */
export function getRolePermissions(role: UserRoleType): string[] {
  switch (role) {
    case 'admin':
      return ['*'];
    case 'hr':
      return [...HR_PERMISSIONS];
    case 'hiring_manager':
      return [...HIRING_MANAGER_PERMISSIONS];
    case 'interviewer':
      return [...INTERVIEWER_PERMISSIONS];
  }
}

export async function getUserRoleAndPermissions(userId: string): Promise<{
  role: UserRoleType;
  permissions: string[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new Error('User not found');
  const role = normalizeUserRole(user.role);
  return {
    role,
    permissions: getRolePermissions(role),
  };
}
