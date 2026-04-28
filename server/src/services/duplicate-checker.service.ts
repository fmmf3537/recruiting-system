import prisma from '../lib/prisma';
import { DEFAULT_STAGE, DEFAULT_STAGE_STATUS } from '../constants';

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
}

/**
 * 检查候选人是否重复（按手机号或邮箱）
 * @param phone 手机号
 * @param email 邮箱
 * @param excludeId 排除的候选人 ID（用于更新场景）
 * @returns 重复候选人列表
 */
export async function checkDuplicate(
  phone?: string,
  email?: string,
  excludeId?: string
): Promise<DuplicateCheckResult> {
  const duplicates: DuplicateCandidate[] = [];
  const seenIds = new Set<string>();

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

    if (existingByPhone && !seenIds.has(existingByPhone.id)) {
      duplicates.push({
        id: existingByPhone.id,
        name: existingByPhone.name,
        phone: existingByPhone.phone,
        email: existingByPhone.email,
        currentStage: existingByPhone.stageRecords[0]?.stage || DEFAULT_STAGE,
        status: existingByPhone.stageRecords[0]?.status || DEFAULT_STAGE_STATUS,
        createdAt: existingByPhone.createdAt,
      });
      seenIds.add(existingByPhone.id);
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

    if (existingByEmail && !seenIds.has(existingByEmail.id)) {
      duplicates.push({
        id: existingByEmail.id,
        name: existingByEmail.name,
        phone: existingByEmail.phone,
        email: existingByEmail.email,
        currentStage: existingByEmail.stageRecords[0]?.stage || DEFAULT_STAGE,
        status: existingByEmail.stageRecords[0]?.status || DEFAULT_STAGE_STATUS,
        createdAt: existingByEmail.createdAt,
      });
    }
  }

  return { duplicates };
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
