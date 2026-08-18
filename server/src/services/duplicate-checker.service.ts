import prisma from '../lib/prisma';
import { DEFAULT_STAGE, DEFAULT_STAGE_STATUS } from '../constants';
import {
  buildCandidateVisibilityWhere,
  type CandidateVisibilityScope,
} from './candidate-visibility.service';

export interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
  email: string;
  currentStage: string;
  status: string;
  createdAt: Date;
}

export interface DuplicateCheckResult {
  duplicates: DuplicateCandidate[];
  // 是否存在当前用户可见范围外的疑似重复（脱敏：不返回对方姓名/手机号/邮箱）
  hasHiddenDuplicate?: boolean;
}

/**
 * 检查候选人是否重复（按手机号或邮箱）
 * @param phone 手机号
 * @param email 邮箱
 * @param excludeId 排除的候选人 ID（用于更新场景）
 * @param scope 数据可见性范围；member 场景下，范围外的重复候选人只计数不返回明细
 * @returns 重复候选人列表
 */
export async function checkDuplicate(
  phone?: string,
  email?: string,
  excludeId?: string,
  scope?: CandidateVisibilityScope
): Promise<DuplicateCheckResult> {
  const duplicates: DuplicateCandidate[] = [];
  const seenIds = new Set<string>();
  let hasHiddenDuplicate = false;

  // member 的可见性条件（admin 或未传 scope 为 undefined，表示不脱敏）
  const visibilityWhere = scope ? buildCandidateVisibilityWhere(scope) : undefined;

  // 范围外的重复候选人脱敏处理：仅标记存在，不返回任何明细
  const pushDuplicate = async (existing: {
    id: string;
    name: string;
    phone: string;
    email: string;
    createdAt: Date;
    stageRecords: Array<{ stage: string; status: string }>;
  }) => {
    if (seenIds.has(existing.id)) return;
    seenIds.add(existing.id);

    if (visibilityWhere) {
      const visibleCount = await prisma.candidate.count({
        where: { id: existing.id, AND: [visibilityWhere] },
      });
      if (visibleCount === 0) {
        hasHiddenDuplicate = true;
        return;
      }
    }

    duplicates.push({
      id: existing.id,
      name: existing.name,
      phone: existing.phone,
      email: existing.email,
      currentStage: existing.stageRecords[0]?.stage || DEFAULT_STAGE,
      status: existing.stageRecords[0]?.status || DEFAULT_STAGE_STATUS,
      createdAt: existing.createdAt,
    });
  };

  const notSelf = excludeId ? { NOT: { id: excludeId } } : {};

  if (phone) {
    const existingByPhone = await prisma.candidate.findFirst({
      where: { phone, ...notSelf },
      include: {
        stageRecords: {
          orderBy: { enteredAt: 'desc' },
          take: 1,
          select: { stage: true, status: true },
        },
      },
    });

    if (existingByPhone) {
      await pushDuplicate(existingByPhone);
    }
  }

  if (email) {
    const existingByEmail = await prisma.candidate.findFirst({
      where: { email, ...notSelf },
      include: {
        stageRecords: {
          orderBy: { enteredAt: 'desc' },
          take: 1,
          select: { stage: true, status: true },
        },
      },
    });

    if (existingByEmail) {
      await pushDuplicate(existingByEmail);
    }
  }

  return { duplicates, hasHiddenDuplicate };
}

/**
 * 检查指定手机号是否已被其他候选人使用
 * @param phone 手机号
 * @param excludeId 排除的候选人 ID
 * @returns true 表示已被使用
 */
export async function isPhoneUsed(phone: string, excludeId?: string): Promise<boolean> {
  const where: Record<string, unknown> = { phone };
  if (excludeId) {
    where.NOT = { id: excludeId };
  }
  const count = await prisma.candidate.count({ where });
  return count > 0;
}

/**
 * 检查指定邮箱是否已被其他候选人使用
 * @param email 邮箱
 * @param excludeId 排除的候选人 ID
 * @returns true 表示已被使用
 */
export async function isEmailUsed(email: string, excludeId?: string): Promise<boolean> {
  const where: Record<string, unknown> = { email };
  if (excludeId) {
    where.NOT = { id: excludeId };
  }
  const count = await prisma.candidate.count({ where });
  return count > 0;
}
