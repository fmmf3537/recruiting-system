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
 * 返回 undefined 表示无限制（admin 或未传 scope）
 */
export function buildCandidateVisibilityWhere(
  scope: CandidateVisibilityScope
): Prisma.CandidateWhereInput | undefined {
  // admin 看全部，不附加任何条件
  if (scope.isAdmin) return undefined;

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

  return { OR: or };
}

/**
 * 校验候选人在当前用户可见范围内，越权抛出 403
 * admin（或未传 scope）直接放行；member 用一次 count 查询校验，无 N+1
 */
export async function assertCandidateVisible(
  candidateId: string,
  scope?: CandidateVisibilityScope
): Promise<void> {
  const where = scope ? buildCandidateVisibilityWhere(scope) : undefined;
  if (!where) return;

  const count = await prisma.candidate.count({
    where: { id: candidateId, AND: [where] },
  });
  if (count === 0) {
    throw new AppError('无权访问该候选人的数据', 403);
  }
}
