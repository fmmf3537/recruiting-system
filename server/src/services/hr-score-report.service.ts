import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import {
  formatDateISO,
  getPeriodEnd,
  getPeriodStart,
  getPreviousPeriodStart,
  listRankedPeriodScores,
  type ScorePeriod,
  startOfDay,
} from './hr-score-snapshot.service';

const HR_ROLES = ['hr', 'member'] as const;

export interface TeamRankingRow {
  userId: string;
  userName: string;
  totalScore: number;
  businessPts: number;
  processPts: number;
  rank: number;
}

function parseOptionalDate(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function escapeCsv(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 团队周期排名（含 0 分 HR）。分数脱敏由路由层按角色处理。
 */
export async function getTeamRanking(period: ScorePeriod): Promise<TeamRankingRow[]> {
  const periodStart = getPeriodStart(period);
  const ranked = await listRankedPeriodScores(period, periodStart);
  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map((r) => r.userId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return ranked.map((r) => ({
    userId: r.userId,
    userName: nameById.get(r.userId) ?? '',
    totalScore: r.totalScore,
    businessPts: r.businessPts,
    processPts: r.processPts,
    rank: r.rank,
  }));
}

async function sumBuckets(period: ScorePeriod, periodStart: Date) {
  const ranked = await listRankedPeriodScores(period, periodStart);
  return ranked.reduce(
    (acc, row) => {
      acc.businessPts += row.businessPts;
      acc.processPts += row.processPts;
      acc.totalScore += row.totalScore;
      return acc;
    },
    { businessPts: 0, processPts: 0, totalScore: 0 },
  );
}

/**
 * admin 报表：趋势 + 环比 + TopN。
 * from/to 缺省则取当前 period 窗口。
 */
export async function getAdminReport(period: ScorePeriod, from?: string, to?: string) {
  const periodStart = parseOptionalDate(from) ?? getPeriodStart(period);
  const periodEnd = parseOptionalDate(to) ?? getPeriodEnd(period, periodStart);
  const rangeEnd = periodEnd;

  const [snapshots, users, currentSum, previousSum] = await Promise.all([
    prisma.hrScoreSnapshot.findMany({
      where: {
        periodType: 'day',
        periodStart: { gte: periodStart, lt: rangeEnd },
      },
      select: {
        userId: true,
        periodStart: true,
        businessPts: true,
        processPts: true,
        totalScore: true,
      },
      orderBy: { periodStart: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: { in: [...HR_ROLES] } },
      select: { id: true, name: true },
    }),
    sumBuckets(period, getPeriodStart(period)),
    sumBuckets(period, getPreviousPeriodStart(period, getPeriodStart(period))),
  ]);

  const trendMap = new Map<string, { business: number; process: number }>();
  for (const s of snapshots) {
    const key = formatDateISO(s.periodStart);
    const cur = trendMap.get(key) ?? { business: 0, process: 0 };
    cur.business += s.businessPts;
    cur.process += s.processPts;
    trendMap.set(key, cur);
  }
  const businessTrend = [...trendMap.entries()].map(([date, v]) => ({ date, value: v.business }));
  const processTrend = [...trendMap.entries()].map(([date, v]) => ({ date, value: v.process }));

  const deltaPct = previousSum.totalScore === 0
    ? null
    : ((currentSum.totalScore - previousSum.totalScore) / previousSum.totalScore) * 100;

  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const ranked = await listRankedPeriodScores(period, getPeriodStart(period));
  const topN = ranked.slice(0, 10).map((r) => ({
    userId: r.userId,
    userName: nameById.get(r.userId) ?? '',
    totalScore: r.totalScore,
    businessPts: r.businessPts,
    processPts: r.processPts,
    rank: r.rank,
  }));

  return {
    businessTrend,
    processTrend,
    comparison: {
      current: currentSum,
      previous: previousSum,
      deltaPct,
    },
    topN,
  };
}

/** admin 导出：UTF-8 CSV（带 BOM，Excel 可识别中文） */
export async function exportAdminReport(period: ScorePeriod): Promise<string> {
  const rows = await getTeamRanking(period);
  const header = ['userId', 'userName', 'businessPts', 'processPts', 'totalScore', 'rank'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      escapeCsv(row.userId),
      escapeCsv(row.userName),
      escapeCsv(row.businessPts),
      escapeCsv(row.processPts),
      escapeCsv(row.totalScore),
      escapeCsv(row.rank),
    ].join(','));
  }
  if (rows.length === 0) {
    logger.info({ period }, '[考核导出] 无数据');
  }
  return `\uFEFF${lines.join('\r\n')}`;
}
