import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// F5-S：猎头推荐通道 - 机构 / 链接 / 漏斗统计 service
// 遵循既有 service 范式（match-score.service）：函数式导出 + AppError + logger

// ============ 类型 ============

/** 链接默认有效期（PRD §7 + 人工复核决策 D） */
export const DEFAULT_LINK_EXPIRES_DAYS = 90;

export interface CreateAgencyInput {
  name: string;
  contact?: string;
  phone?: string;
  remark?: string;
}

export interface UpdateAgencyInput {
  name?: string;
  contact?: string | null;
  phone?: string | null;
  remark?: string | null;
  enabled?: boolean;
}

export interface CreateAgencyLinkInput {
  jobId?: string | null;
  expiresAt?: string | null;
}

export interface AgencyLinkRecord {
  id: string;
  agencyId: string;
  token: string;
  jobId: string | null;
  expiresAt: Date | null;
  disabledAt: Date | null;
  createdById: string;
  createdAt: Date;
  /** 拼好的对外路径，前端可直接拼接 host */
  referralUrl: string;
}

export interface AgencyStatsResult {
  total: number;
  stages: Array<{ stage: string; count: number }>;
  offers: number;
  joined: number;
}

// ============ 工具函数 ============

/** 去空格统一处理 name 字段（避免「ACME」与「 ACME 」判为不同） */
function normalizeName(name: string): string {
  return name.trim();
}

/** 写入 OperationLog（与既有 service 风格一致：失败不抛错，仅记日志） */
async function writeOpLog(userId: string, targetType: string, targetId: string, action: string, detail: Prisma.InputJsonValue): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: { userId, targetType, targetId, action, detail },
    });
  } catch (err) {
    logger.error({ err, action, targetId }, '[F5-S] OperationLog 写入失败');
  }
}

// ============ 机构 CRUD ============

/**
 * 创建猎头机构
 * - name 去空格后查重，重复 400
 */
export async function createAgency(data: CreateAgencyInput, userId: string) {
  const name = normalizeName(data.name);
  if (!name) {
    throw new AppError('机构名称不能为空', 400);
  }

  const existing = await prisma.agency.findUnique({ where: { name } });
  if (existing) {
    throw new AppError('机构名称已存在', 400);
  }

  const agency = await prisma.agency.create({
    data: {
      name,
      contact: data.contact?.trim() || null,
      phone: data.phone?.trim() || null,
      remark: data.remark || null,
      createdById: userId,
    },
  });

  await writeOpLog(userId, 'Agency', agency.id, 'agency_create', { name: agency.name });
  return agency;
}

/**
 * 编辑机构（部分更新，含启停用）
 * - name 变更时同样查重，重复 400
 */
export async function updateAgency(id: string, data: UpdateAgencyInput) {
  const existing = await prisma.agency.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('机构不存在', 404);
  }

  if (data.name !== undefined) {
    const normalized = normalizeName(data.name);
    if (!normalized) {
      throw new AppError('机构名称不能为空', 400);
    }
    if (normalized !== existing.name) {
      const dup = await prisma.agency.findUnique({ where: { name: normalized } });
      if (dup) {
        throw new AppError('机构名称已存在', 400);
      }
    }
  }

  const patch: Prisma.AgencyUpdateInput = {};
  if (data.name !== undefined) patch.name = normalizeName(data.name);
  if (data.contact !== undefined) patch.contact = data.contact;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.remark !== undefined) patch.remark = data.remark;
  if (data.enabled !== undefined) patch.enabled = data.enabled;

  return prisma.agency.update({ where: { id }, data: patch });
}

/**
 * 机构列表（含链接数 / 推荐数）
 * - 推荐数：按 source = '猎头:' + name 聚合候选人数量
 * - 机构数量级小，用 N+1 count 或 $queryRaw 均可
 */
export async function listAgencies() {
  const agencies = await prisma.agency.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { links: true } } },
  });

  const enriched = await Promise.all(
    agencies.map(async (a) => {
      const referralCount = await prisma.candidate.count({
        where: { source: `猎头:${a.name}` },
      });
      return {
        ...a,
        linkCount: a._count.links,
        referralCount,
      };
    })
  );

  return enriched;
}

// ============ 链接生成 / 停用 ============

/**
 * 生成推荐链接
 * - token: crypto.randomBytes(16).toString('hex') —— 32 位 hex，128 位熵
 * - expiresAt 缺省 = +90 天；显式 null = 长期
 * - jobId 提供时校验职位存在
 */
export async function createAgencyLink(agencyId: string, data: CreateAgencyLinkInput, userId: string): Promise<AgencyLinkRecord> {
  // 1) 机构必须存在且未停用
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) {
    throw new AppError('机构不存在', 404);
  }
  if (!agency.enabled) {
    throw new AppError('机构已停用，无法生成链接', 400);
  }

  // 2) jobId 提供时校验职位存在
  if (data.jobId) {
    const job = await prisma.job.findUnique({ where: { id: data.jobId } });
    if (!job) {
      throw new AppError('职位不存在', 404);
    }
  }

  // 3) token 生成
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(16).toString('hex');

  // 4) 有效期：缺省 = +90 天；显式传 null = 长期；显式 ISO 字符串 = 自定义
  let expiresAt: Date | null;
  if (data.expiresAt === null) {
    expiresAt = null;
  } else if (data.expiresAt) {
    expiresAt = new Date(data.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new AppError('expiresAt 时间格式不合法', 400);
    }
  } else {
    expiresAt = new Date(Date.now() + DEFAULT_LINK_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  }

  const link = await prisma.agencyLink.create({
    data: {
      agencyId,
      token,
      jobId: data.jobId || null,
      expiresAt,
      createdById: userId,
    },
  });

  await writeOpLog(userId, 'AgencyLink', link.id, 'agency_link_create', {
    agencyId,
    tokenSuffix: token.slice(-4),
    jobId: link.jobId,
    expiresAt: link.expiresAt,
  });

  return {
    ...link,
    referralUrl: `/referral/${token}`,
  };
}

/**
 * 停用链接（幂等：已停用直接返回）
 * - 软停用（disabledAt = now），不物理删链接行（统计仍需保留）
 */
export async function disableAgencyLink(linkId: string, userId: string) {
  const link = await prisma.agencyLink.findUnique({ where: { id: linkId } });
  if (!link) {
    throw new AppError('链接不存在', 404);
  }
  if (link.disabledAt) {
    return link;
  }

  const updated = await prisma.agencyLink.update({
    where: { id: linkId },
    data: { disabledAt: new Date() },
  });

  await writeOpLog(userId, 'AgencyLink', linkId, 'agency_link_disable', {
    agencyId: link.agencyId,
    tokenSuffix: link.token.slice(-4),
  });

  return updated;
}

// ============ 漏斗统计 ============

/**
 * 机构转化漏斗
 * - 按 source = '猎头:' + agency.name 聚合候选人
 * - total：候选人总数
 * - stages：取每个候选人最新 StageRecord，按阶段分组计数
 * - offers：有 Offer 记录的数量
 * - joined：Offer.joined = true 的数量
 */
export async function getAgencyStats(agencyId: string): Promise<AgencyStatsResult> {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) {
    throw new AppError('机构不存在', 404);
  }

  const sourceValue = `猎头:${agency.name}`;
  const candidates = await prisma.candidate.findMany({
    where: { source: sourceValue },
    select: {
      id: true,
      offer: { select: { joined: true, id: true } },
    },
  });

  const total = candidates.length;
  const offers = candidates.filter((c) => c.offer).length;
  const joined = candidates.filter((c) => c.offer?.joined).length;

  // 阶段聚合：用窗口函数取每个候选人最新阶段（与 stats.service / candidate.service 既有 SQL 模式一致）
  let stagesMap: Map<string, number> = new Map();
  if (total > 0) {
    const ids = candidates.map((c) => c.id);
    const latest = await prisma.$queryRaw<Array<{ candidateId: string; stage: string }>>`
      SELECT "candidateId", stage FROM (
        SELECT "candidateId", stage,
               ROW_NUMBER() OVER (PARTITION BY "candidateId" ORDER BY "enteredAt" DESC) as rn
        FROM "stage_record"
        WHERE "candidateId" IN (${Prisma.join(ids)})
      ) t WHERE rn = 1
    `;
    stagesMap = latest.reduce((acc, row) => {
      acc.set(row.stage, (acc.get(row.stage) || 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const stages = Array.from(stagesMap.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);

  return { total, stages, offers, joined };
}