import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * 候选人数据可见性范围
 * - admin：可见全部候选人
 * - member：仅可见以下三类候选人
 *   1. 自己创建的（Candidate.createdById = 自己）
 *   2. 被指派给自己的阶段记录（StageRecord.assigneeId = 自己）关联的候选人
 *   3. 自己部门职位（Job.departments 包含自己 department）下关联的候选人
 *   department 为 null 的 member 仅看前两类
 */
export interface CandidateVisibilityScope {
  userId: string;
  isAdmin: boolean;
  department: string | null;
}

/**
 * 从登录用户信息（JWT payload）构建可见性范围
 */
export function scopeFromUser(user: {
  userId: string;
  role: string;
  department: string | null;
}): CandidateVisibilityScope {
  return {
    userId: user.userId,
    isAdmin: user.role === 'admin',
    department: user.department ?? null,
  };
}

/**
 * 构建候选人可见性 Prisma 查询条件
 * 始终带 `deletedAt: null`；admin 除此以外不限制范围
 */
export function buildCandidateVisibilityWhere(
  scope: CandidateVisibilityScope
): Prisma.CandidateWhereInput {
  // 所有角色默认排除软删除；admin 除此以外不限制可见范围
  const notDeleted: Prisma.CandidateWhereInput = { deletedAt: null };
  if (scope.isAdmin) {
    return notDeleted;
  }

  const or: Prisma.CandidateWhereInput[] = [
    // 1. 自己创建的候选人
    { createdById: scope.userId },
    // 2. 被指派给自己的阶段记录关联的候选人
    { stageRecords: { some: { assigneeId: scope.userId } } },
  ];

  // 3. 自己部门职位（Job.departments 为 JSON 数组）下关联的候选人
  if (scope.department) {
    or.push({
      candidateJobs: {
        some: {
          job: {
            departments: { array_contains: [scope.department] },
          },
        },
      },
    });
  }

  return { AND: [{ OR: or }, notDeleted] };
}

/**
 * 校验候选人在当前用户可见范围内，越权抛出 403
 * 未传 scope 直接放行；有 scope 时用一次 count（含 deletedAt: null）校验
 */
export async function assertCandidateVisible(
  candidateId: string,
  scope?: CandidateVisibilityScope
): Promise<void> {
  if (!scope) return;

  const where = buildCandidateVisibilityWhere(scope);
  const count = await prisma.candidate.count({
    where: { id: candidateId, AND: [where] },
  });
  if (count === 0) {
    throw new AppError('无权访问该候选人的数据', 403);
  }
}
