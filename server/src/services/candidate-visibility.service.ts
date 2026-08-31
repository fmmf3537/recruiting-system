import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * 候选人数据可见性范围
 * - admin：可见全部未删除候选人
 * - hr / member / hiring_manager：自己创建 + assignee + 本部门职位
 * - interviewer：仅 Interview.interviewers 含自己的候选人
 */
export interface CandidateVisibilityScope {
  userId: string;
  isAdmin: boolean;
  department: string | null;
  role?: string;
}

export function scopeFromUser(user: {
  userId: string;
  role: string;
  department: string | null;
}): CandidateVisibilityScope {
  return {
    userId: user.userId,
    isAdmin: user.role === 'admin',
    department: user.department ?? null,
    role: user.role,
  };
}

/**
 * 面试官可见候选人：JS 过滤 interviewers JSON（Prisma JSON contains 不稳定）
 */
async function getVisibleCandidateIdsForInterviewer(userId: string): Promise<string[]> {
  const interviews = await prisma.interview.findMany({
    select: { candidateId: true, interviewers: true },
  });
  const ids = new Set<string>();
  for (const i of interviews) {
    const list = Array.isArray(i.interviewers)
      ? (i.interviewers as Array<{ id?: string }>)
      : [];
    if (list.some((u) => u.id === userId)) {
      ids.add(i.candidateId);
    }
  }
  return Array.from(ids);
}

/**
 * 构建候选人可见性 Prisma 查询条件
 * 始终带 `deletedAt: null`；admin 除此以外不限制范围
 */
export async function buildCandidateVisibilityWhere(
  scope: CandidateVisibilityScope
): Promise<Prisma.CandidateWhereInput> {
  const notDeleted: Prisma.CandidateWhereInput = { deletedAt: null };
  if (scope.isAdmin) {
    return notDeleted;
  }

  if (scope.role === 'interviewer') {
    const ids = await getVisibleCandidateIdsForInterviewer(scope.userId);
    return { AND: [{ id: { in: ids } }, notDeleted] };
  }

  // hr / member / hiring_manager：本部门 + 自己创建 + assignee
  const or: Prisma.CandidateWhereInput[] = [
    { createdById: scope.userId },
    { stageRecords: { some: { assigneeId: scope.userId } } },
  ];

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
 */
export async function assertCandidateVisible(
  candidateId: string,
  scope?: CandidateVisibilityScope
): Promise<void> {
  if (!scope) return;

  const where = await buildCandidateVisibilityWhere(scope);
  const count = await prisma.candidate.count({
    where: { id: candidateId, AND: [where] },
  });
  if (count === 0) {
    throw new AppError('无权访问该候选人的数据', 403);
  }
}
