import { env } from '../lib/env';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { normalizeUserRole } from './role-permission.service';

export type ScorePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface PeriodAggregate {
  businessPts: number;
  processPts: number;
  totalScore: number;
  rank: number | null;
}

const HR_ROLES = ['hr', 'member'] as const;

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

/** 日历日 00:00（本地时区） */
export function startOfDay(date: Date): Date {
  const d = cloneDate(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 本周一 00:00 */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfQuarter(date: Date): Date {
  const month = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), month, 1);
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export function getPeriodStart(period: ScorePeriod, ref: Date = new Date()): Date {
  switch (period) {
    case 'day':
      return startOfDay(ref);
    case 'week':
      return startOfWeek(ref);
    case 'month':
      return startOfMonth(ref);
    case 'quarter':
      return startOfQuarter(ref);
    case 'year':
      return startOfYear(ref);
    default:
      return startOfWeek(ref);
  }
}

/** 周期结束（不含）：day+1 / week+7 / month+1 / quarter+3 / year+1 */
export function getPeriodEnd(period: ScorePeriod, periodStart: Date): Date {
  const d = cloneDate(periodStart);
  switch (period) {
    case 'day':
      d.setDate(d.getDate() + 1);
      break;
    case 'week':
      d.setDate(d.getDate() + 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarter':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setDate(d.getDate() + 7);
  }
  return d;
}

/** 上一周期起点（环比用） */
export function getPreviousPeriodStart(period: ScorePeriod, periodStart: Date): Date {
  const d = cloneDate(periodStart);
  switch (period) {
    case 'day':
      d.setDate(d.getDate() - 1);
      break;
    case 'week':
      d.setDate(d.getDate() - 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() - 1);
      break;
    case 'quarter':
      d.setMonth(d.getMonth() - 3);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() - 1);
      break;
    default:
      d.setDate(d.getDate() - 7);
  }
  return d;
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeights(): { business: number; process: number } {
  const business = env.HR_SCORE_BUSINESS_WEIGHT ?? 0.7;
  const process = env.HR_SCORE_PROCESS_WEIGHT ?? 0.3;
  return { business, process };
}

interface ScoreBucket {
  userId: string;
  businessPts: number;
  processPts: number;
  totalScore: number;
}

/** 等价 SQL RANK() OVER (ORDER BY totalScore DESC)：同分同名次，下一跳号 */
export function rankByScore<T extends { totalScore: number }>(rows: T[]): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => b.totalScore - a.totalScore);
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((row, index) => {
    if (lastScore === null || row.totalScore !== lastScore) {
      lastRank = index + 1;
      lastScore = row.totalScore;
    }
    return { ...row, rank: lastRank };
  });
}

function emptyAggregate(): PeriodAggregate {
  return { businessPts: 0, processPts: 0, totalScore: 0, rank: null };
}

/**
 * 生成某一天的日快照：业务分 + 过程分按权重合成 totalScore。
 * 单用户失败 continue，不阻塞其他人。
 */
export async function generateDailySnapshot(date: Date): Promise<void> {
  const dayStart = startOfDay(date);
  const dayEnd = getPeriodEnd('day', dayStart);
  const { business: bWeight, process: pWeight } = getWeights();

  let users: Array<{ id: string }> = [];
  try {
    users = await prisma.user.findMany({
      where: { role: { in: [...HR_ROLES] } },
      select: { id: true },
    });
  } catch (error) {
    logger.error({ err: error }, '[日快照] 读取 HR 用户失败');
    return;
  }

  for (const user of users) {
    try {
      const events = await prisma.hrScoreEvent.findMany({
        where: {
          userId: user.id,
          bizDate: { gte: dayStart, lt: dayEnd },
        },
        select: { category: true, points: true },
      });
      let businessPts = 0;
      let processPts = 0;
      for (const ev of events) {
        if (ev.category === 'process') processPts += ev.points;
        else businessPts += ev.points;
      }
      const totalScore = businessPts * bWeight + processPts * pWeight;
      await prisma.hrScoreSnapshot.upsert({
        where: {
          userId_periodType_periodStart: {
            userId: user.id,
            periodType: 'day',
            periodStart: dayStart,
          },
        },
        update: { businessPts, processPts, totalScore },
        create: {
          userId: user.id,
          periodType: 'day',
          periodStart: dayStart,
          businessPts,
          processPts,
          totalScore,
        },
      });
    } catch (error) {
      logger.error({ err: error, userId: user.id }, '[日快照] 单用户生成失败');
    }
  }
}

async function loadPeriodBuckets(
  periodType: ScorePeriod,
  periodStart: Date,
): Promise<ScoreBucket[]> {
  const periodEnd = getPeriodEnd(periodType, periodStart);
  const [snapshots, users] = await Promise.all([
    prisma.hrScoreSnapshot.findMany({
      where: {
        periodType: 'day',
        periodStart: { gte: periodStart, lt: periodEnd },
      },
      select: {
        userId: true,
        businessPts: true,
        processPts: true,
        totalScore: true,
      },
    }),
    prisma.user.findMany({
      where: { role: { in: [...HR_ROLES] } },
      select: { id: true },
    }),
  ]);

  const byUser = new Map<string, ScoreBucket>();
  for (const u of users) {
    byUser.set(u.id, {
      userId: u.id,
      businessPts: 0,
      processPts: 0,
      totalScore: 0,
    });
  }
  for (const s of snapshots) {
    const cur = byUser.get(s.userId) ?? {
      userId: s.userId,
      businessPts: 0,
      processPts: 0,
      totalScore: 0,
    };
    cur.businessPts += s.businessPts;
    cur.processPts += s.processPts;
    cur.totalScore += s.totalScore;
    byUser.set(s.userId, cur);
  }
  return [...byUser.values()];
}

/**
 * 由日快照实时聚合 week/month/quarter/year（以及 day）。
 * rank 在同周期内按 totalScore 降序计算（等价 RANK 窗口函数）。
 */
export async function aggregateFromDailySnapshots(
  userId: string,
  periodType: ScorePeriod,
  periodStart: Date,
): Promise<PeriodAggregate> {
  const buckets = await loadPeriodBuckets(periodType, periodStart);
  if (buckets.length === 0) return emptyAggregate();
  const ranked = rankByScore(buckets);
  const mine = ranked.find((r) => r.userId === userId);
  if (!mine) return emptyAggregate();
  return {
    businessPts: mine.businessPts,
    processPts: mine.processPts,
    totalScore: mine.totalScore,
    rank: mine.rank,
  };
}

export async function listRankedPeriodScores(
  periodType: ScorePeriod,
  periodStart: Date,
): Promise<Array<ScoreBucket & { rank: number }>> {
  const buckets = await loadPeriodBuckets(periodType, periodStart);
  return rankByScore(buckets);
}

export async function getMyScores(
  userId: string,
  period: ScorePeriod,
  page: number,
  pageSize: number,
): Promise<{
  events: unknown[];
  aggregate: PeriodAggregate;
  rank: number | null;
  pagination: { page: number; pageSize: number; total: number };
}> {
  const periodStart = getPeriodStart(period);
  const periodEnd = getPeriodEnd(period, periodStart);
  const skip = (page - 1) * pageSize;
  const where = {
    userId,
    bizDate: { gte: periodStart, lt: periodEnd },
  };
  const [events, total, aggregate] = await Promise.all([
    prisma.hrScoreEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.hrScoreEvent.count({ where }),
    aggregateFromDailySnapshots(userId, period, periodStart),
  ]);
  return {
    events,
    aggregate,
    rank: aggregate.rank,
    pagination: { page, pageSize, total },
  };
}

/** 仅 admin 可查看他人明细；hr 查别人返回 false */
export function canViewUserScores(actorRole: string, actorUserId: string, targetUserId: string): boolean {
  if (actorUserId === targetUserId) return true;
  try {
    return normalizeUserRole(actorRole) === 'admin';
  } catch {
    return false;
  }
}
