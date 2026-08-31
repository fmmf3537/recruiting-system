import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { redis, connectRedis } from '../lib/redis';
import {
  buildCandidateVisibilityWhere,
  type CandidateVisibilityScope,
} from './candidate-visibility.service';

// 缓存时间：5 分钟
const CACHE_TTL = 300;

function getCacheKey(prefix: string, dateRange?: DateRange, scope?: CandidateVisibilityScope): string {
  const start = dateRange?.startDate.toISOString().split('T')[0] || 'all';
  const end = dateRange?.endDate.toISOString().split('T')[0] || 'all';
  // member 的统计结果按用户隔离缓存，避免不同可见范围的成员共享缓存
  const scopeSuffix = scope && !scope.isAdmin ? `:u:${scope.userId}` : '';
  return `stats:${prefix}:${start}:${end}${scopeSuffix}`;
}

// 时间范围类型
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// 工作量统计项
export interface WorkloadStat {
  userId: string;
  userName: string;
  newCandidates: number;
  stageAdvances: number;
  interviews: number;
  offers: number;
}

// 渠道效果统计项
export interface ChannelStat {
  source: string;
  candidateCount: number;
  hiredCount: number;
  conversionRate: number;
}

// 职位统计项
export interface JobStat {
  jobId: string;
  jobTitle: string;
  department: string;
  candidateCount: number;
  interviewCount: number;
  offerCount: number;
  hiredCount: number;
}

// 漏斗统计项
export interface FunnelStat {
  stage: string;
  count: number;
}

// 招聘周期统计项
export interface CycleStat {
  stage: string;
  avgDays: number;
  maxDays: number;
  minDays: number;
  totalCount: number;
}

// 职位时间指标
export interface JobTimeStat {
  jobId: string;
  jobTitle: string;
  department: string;
  candidateCount: number;
  hiredCount: number;
  ttfDays: number | null;
  tthDays: number | null;
}

// 导出数据类型
export interface ExportData {
  headers: string[];
  rows: (string | number | null | undefined)[][];
  filename: string;
}

/**
 * 统计服务类
 * 封装所有统计相关的业务逻辑
 */
export class StatsService {
  /**
   * member 视角的可见候选人 ID 列表；admin 或未传 scope 返回 null（不按成员范围过滤）
   * 软删除不在此拉全表 ID，由 liveCandidateWhere / visibleCandidateSql 统一加 deletedAt
   */
  private async getVisibleCandidateIds(scope?: CandidateVisibilityScope): Promise<string[] | null> {
    const where = scope ? await buildCandidateVisibilityWhere(scope) : undefined;
    if (!scope || scope.isAdmin) return null;
    const rows = await prisma.candidate.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** Prisma：admin 排除软删；member 的 ID 列表已排除软删 */
  private liveCandidateWhere(visibleIds: string[] | null): Prisma.CandidateWhereInput {
    if (visibleIds) return { id: { in: visibleIds } };
    return { deletedAt: null };
  }

  /** 关联表按 candidate 过滤软删 */
  private liveCandidateRelation(visibleIds: string[] | null): {
    candidate: Prisma.CandidateWhereInput;
  } {
    if (visibleIds) return { candidate: { id: { in: visibleIds } } };
    return { candidate: { deletedAt: null } };
  }

  /**
   * $queryRaw 可见范围 + 软删除。调用方 SQL 须 JOIN candidate 并使用别名 c。
   */
  private visibleCandidateSql(column: string, ids: string[] | null): Prisma.Sql {
    const notDeleted = Prisma.sql`AND c."deletedAt" IS NULL`;
    if (ids === null) return notDeleted;
    if (ids.length === 0) return Prisma.sql`AND false`;
    return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(ids)}) ${notDeleted}`;
  }

  /**
   * 获取默认时间范围（当年 1月1日 至 今天）
   */
  private getDefaultDateRange(): DateRange {
    const now = new Date();
    const year = now.getFullYear();
    const startDate = new Date(year, 0, 1); // 1月1日
    const endDate = new Date(year, 11, 31, 23, 59, 59); // 12月31日
    return { startDate, endDate };
  }

  /**
   * 解析日期范围
   */
  parseDateRange(startDateStr?: string, endDateStr?: string): DateRange {
    if (startDateStr && endDateStr) {
      return {
        startDate: new Date(startDateStr),
        endDate: new Date(endDateStr),
      };
    }
    return this.getDefaultDateRange();
  }

  /**
   * GET /api/stats/dashboard
   * 数据看板：核心 KPI + 近 7 天新增候选人趋势
   */
  async getDashboardStats(scope?: CandidateVisibilityScope): Promise<{
    kpi: {
      newCandidatesThisMonth: number;
      interviewingCount: number;
      pendingOffers: number;
      joinedThisMonth: number;
    };
    trend: Array<{ date: string; count: number }>;
    hcStats: { totalApproved: number; totalFilled: number; fulfillmentRate: number; openRequests: number };
  }> {
    await connectRedis();
    const cacheKey = getCacheKey('dashboard', undefined, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // member 按可见范围；admin 不按成员过滤，但仍排除软删除
    const visibleIds = await this.getVisibleCandidateIds(scope);
    const candidateFilter = this.liveCandidateWhere(visibleIds);
    const candidateRelationFilter = this.liveCandidateRelation(visibleIds);

    // 本月新增候选人
    const newCandidatesThisMonth = await prisma.candidate.count({
      where: { createdAt: { gte: monthStart, lte: monthEnd }, ...candidateFilter },
    });

    // 在面人数：有面试反馈且结论为 pending 的候选人（去重）
    const interviewingCandidates = await prisma.interviewFeedback.findMany({
      where: { conclusion: 'pending', ...candidateRelationFilter },
      distinct: ['candidateId'],
      select: { candidateId: true },
    });
    const interviewingCount = interviewingCandidates.length;

    // 待发 Offer：result 为 pending 的 Offer 数量
    const pendingOffers = await prisma.offer.count({
      where: { result: 'pending', ...candidateRelationFilter },
    });

    // 本月入职人数
    const joinedThisMonth = await prisma.offer.count({
      where: {
        joined: true,
        actualJoinDate: { gte: monthStart, lte: monthEnd },
        ...candidateRelationFilter,
      },
    });

    // 编制统计
    const [hcTotalApproved, hcTotalFilled, hcOpenRequests] = await Promise.all([
      prisma.hCRequest.count({ where: { status: { in: ['approved', 'fulfilled'] } } }),
      prisma.hCRequest.count({ where: { status: 'fulfilled' } }),
      prisma.hCRequest.count({ where: { status: 'submitted' } }),
    ]);

    // 近 7 天新增候选人趋势
    const trend: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const count = await prisma.candidate.count({
        where: { createdAt: { gte: d, lt: nextD }, ...candidateFilter },
      });
      const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      trend.push({ date: dateStr, count });
    }

    const result = {
      kpi: {
        newCandidatesThisMonth,
        interviewingCount,
        pendingOffers,
        joinedThisMonth,
      },
      trend,
      hcStats: {
        totalApproved: hcTotalApproved,
        totalFilled: hcTotalFilled,
        fulfillmentRate: hcTotalApproved > 0 ? Math.round((hcTotalFilled / hcTotalApproved) * 100) : 0,
        openRequests: hcOpenRequests,
      },
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * GET /api/stats/workload
   * 工作量统计
   */
  async getWorkloadStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<WorkloadStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('workload', dateRange, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    // member 视角：仅统计本人工作量（其候选人/阶段/面试均属于自己可见范围）
    const userFilter = scope && !scope.isAdmin
      ? Prisma.sql`WHERE u.id = ${scope.userId}`
      : Prisma.empty;

    const stats = await prisma.$queryRaw<WorkloadStat[]>`
      SELECT 
        u.id as "userId",
        u.name as "userName",
        COALESCE(c.count, 0) as "newCandidates",
        COALESCE(s.count, 0) as "stageAdvances",
        COALESCE(i.count, 0) as "interviews",
        COALESCE(o.count, 0) as "offers"
      FROM "user" u
      LEFT JOIN (
        SELECT c."createdById", COUNT(*)::int as count FROM "candidate" c
        WHERE c."createdAt" >= ${startDate} AND c."createdAt" <= ${endDate}
          AND c."deletedAt" IS NULL
        GROUP BY c."createdById"
      ) c ON c."createdById" = u.id
      LEFT JOIN (
        SELECT "assigneeId", COUNT(*)::int as count FROM "stage_record"
        WHERE "enteredAt" >= ${startDate} AND "enteredAt" <= ${endDate}
        GROUP BY "assigneeId"
      ) s ON s."assigneeId" = u.id
      LEFT JOIN (
        SELECT "createdById", COUNT(*)::int as count FROM "interview_feedback"
        WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        GROUP BY "createdById"
      ) i ON i."createdById" = u.id
      LEFT JOIN (
        SELECT ca."createdById", COUNT(*)::int as count FROM "offer" o
        JOIN "candidate" ca ON o."candidateId" = ca.id
        WHERE o."offerDate" >= ${startDate} AND o."offerDate" <= ${endDate}
          AND ca."deletedAt" IS NULL
        GROUP BY ca."createdById"
      ) o ON o."createdById" = u.id
      ${userFilter}
    `;

    const result = stats.filter(
      (s) => s.newCandidates > 0 || s.stageAdvances > 0 || s.interviews > 0 || s.offers > 0
    );
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * GET /api/stats/channel
   * 渠道效果分析
   */
  async getChannelStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<ChannelStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('channel', dateRange, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    const visibleIds = await this.getVisibleCandidateIds(scope);
    const candidateFilter = this.liveCandidateWhere(visibleIds);

    // 获取所有候选人按来源分组统计
    const candidatesBySource = await prisma.candidate.groupBy({
      by: ['source'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...candidateFilter,
      },
      _count: { id: true },
    });

    // 获取已入职候选人按来源分组统计
    const hiredBySource = await prisma.candidate.groupBy({
      by: ['source'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...candidateFilter,
        offer: {
          joined: true,
        },
      },
      _count: { id: true },
    });

    // 转换为 Map 方便查询
    const hiredMap = new Map(hiredBySource.map((h) => [h.source, h._count.id]));

    // 计算每个渠道的转化率
    const stats: ChannelStat[] = candidatesBySource.map((item) => {
      const candidateCount = item._count.id;
      const hiredCount = hiredMap.get(item.source) || 0;
      const conversionRate = candidateCount > 0 ? (hiredCount / candidateCount) * 100 : 0;

      return {
        source: item.source,
        candidateCount,
        hiredCount,
        conversionRate: Math.round(conversionRate * 100) / 100, // 保留 2 位小数
      };
    });

    const result = stats.sort((a, b) => b.candidateCount - a.candidateCount);
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * GET /api/stats/jobs
   * 职位维度统计
   */
  async getJobStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<JobStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('jobs', dateRange, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    const visibleIds = await this.getVisibleCandidateIds(scope);
    const candidateFilter = this.visibleCandidateSql('c.id', visibleIds);

    const rawStats = await prisma.$queryRaw<Array<{
      jobId: string;
      jobTitle: string;
      departments: unknown;
      candidateCount: number;
      interviewCount: number;
      offerCount: number;
      hiredCount: number;
    }>>`
      SELECT 
        j.id as "jobId",
        j.title as "jobTitle",
        j.departments,
        COUNT(DISTINCT c.id)::int as "candidateCount",
        COUNT(DISTINCT CASE WHEN i."createdAt" >= ${startDate} AND i."createdAt" <= ${endDate} THEN i.id END)::int as "interviewCount",
        COUNT(DISTINCT CASE WHEN o."offerDate" >= ${startDate} AND o."offerDate" <= ${endDate} THEN o.id END)::int as "offerCount",
        COUNT(DISTINCT CASE WHEN o.joined = true AND o."actualJoinDate" >= ${startDate} AND o."actualJoinDate" <= ${endDate} THEN o.id END)::int as "hiredCount"
      FROM "job" j
      LEFT JOIN "candidate_job" cj ON cj."jobId" = j.id
      LEFT JOIN "candidate" c ON c.id = cj."candidateId"
      LEFT JOIN "interview_feedback" i ON i."candidateId" = c.id
      LEFT JOIN "offer" o ON o."candidateId" = c.id
      WHERE TRUE ${candidateFilter}
      GROUP BY j.id, j.title, j.departments
    `;

    const stats: JobStat[] = rawStats
      .filter((s) => s.candidateCount > 0)
      .map((s) => {
        let department = '未分配';
        try {
          const departments = s.departments as string[];
          department = departments && departments.length > 0 ? departments[0] : '未分配';
        } catch {
          department = '未分配';
        }
        return {
          jobId: s.jobId,
          jobTitle: s.jobTitle,
          department,
          candidateCount: s.candidateCount,
          interviewCount: s.interviewCount,
          offerCount: s.offerCount,
          hiredCount: s.hiredCount,
        };
      });

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(stats));
    return stats;
  }

  /**
   * GET /api/stats/funnel
   * 招聘漏斗统计
   */
  async getFunnelStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<FunnelStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('funnel', dateRange, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    const visibleIds = await this.getVisibleCandidateIds(scope);
    const candidateFilter = this.liveCandidateWhere(visibleIds);
    const candidateRelationFilter = this.liveCandidateRelation(visibleIds);

    // 简历入库：在日期范围内创建的候选人
    const newCandidates = await prisma.candidate.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...candidateFilter,
      },
    });

    // 初筛通过
    const initialScreenPassed = await prisma.stageRecord.groupBy({
      by: ['candidateId'],
      where: {
        stage: '初筛',
        status: 'passed',
        enteredAt: { gte: startDate, lte: endDate },
        ...candidateRelationFilter,
      },
    });

    // 复试通过
    const retestPassed = await prisma.stageRecord.groupBy({
      by: ['candidateId'],
      where: {
        stage: '复试',
        status: 'passed',
        enteredAt: { gte: startDate, lte: endDate },
        ...candidateRelationFilter,
      },
    });

    // 终面通过
    const finalInterviewPassed = await prisma.stageRecord.groupBy({
      by: ['candidateId'],
      where: {
        stage: '终面',
        status: 'passed',
        enteredAt: { gte: startDate, lte: endDate },
        ...candidateRelationFilter,
      },
    });

    // Offer 接受
    const offerAccepted = await prisma.offer.count({
      where: {
        result: 'accepted',
        offerDate: { gte: startDate, lte: endDate },
        ...candidateRelationFilter,
      },
    });

    // 成功入职
    const hired = await prisma.offer.count({
      where: {
        joined: true,
        actualJoinDate: { gte: startDate, lte: endDate },
        ...candidateRelationFilter,
      },
    });

    const result = [
      { stage: '简历入库', count: newCandidates },
      { stage: '初筛通过', count: initialScreenPassed.length },
      { stage: '复试通过', count: retestPassed.length },
      { stage: '终面通过', count: finalInterviewPassed.length },
      { stage: 'Offer接受', count: offerAccepted },
      { stage: '成功入职', count: hired },
    ];
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * 导出工作量统计数据为 Excel
   */
  async exportWorkloadStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<ExportData> {
    const stats = await this.getWorkloadStats(dateRange, scope);

    return {
      headers: ['成员', '新增候选人', '阶段推进', '面试次数', '发放 Offer'],
      rows: stats.map((s) => [
        s.userName,
        s.newCandidates,
        s.stageAdvances,
        s.interviews,
        s.offers,
      ]),
      filename: `工作量统计_${new Date().toISOString().split('T')[0]}.xlsx`,
    };
  }

  /**
   * 导出渠道效果数据为 Excel
   */
  async exportChannelStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<ExportData> {
    const stats = await this.getChannelStats(dateRange, scope);

    return {
      headers: ['渠道', '候选人数量', '入职数量', '转化率(%)'],
      rows: stats.map((s) => [
        s.source,
        s.candidateCount,
        s.hiredCount,
        s.conversionRate,
      ]),
      filename: `渠道效果分析_${new Date().toISOString().split('T')[0]}.xlsx`,
    };
  }

  /**
   * 导出职位统计数据为 Excel
   */
  async exportJobStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<ExportData> {
    const stats = await this.getJobStats(dateRange, scope);

    return {
      headers: ['职位', '部门', '候选人', '面试', 'Offer', '入职'],
      rows: stats.map((s) => [
        s.jobTitle,
        s.department,
        s.candidateCount,
        s.interviewCount,
        s.offerCount,
        s.hiredCount,
      ]),
      filename: `职位维度统计_${new Date().toISOString().split('T')[0]}.xlsx`,
    };
  }

  /**
   * 内推统计
   */
  async getReferralStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<{
    totalReferrals: number;
    hiredReferrals: number;
    hireRate: number;
    topReferrers: Array<{ referrer: string; count: number; hired: number }>;
  }> {
    const where: Prisma.CandidateWhereInput = { deletedAt: null };
    if (dateRange) {
      where.createdAt = {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      };
    }

    const visibleIds = await this.getVisibleCandidateIds(scope);
    if (visibleIds) {
      where.id = { in: visibleIds };
    }

    // 所有有推荐人的候选人
    const referrals = await prisma.candidate.findMany({
      where: { ...where, referrer: { not: null } },
      select: { referrer: true, stageRecords: { select: { stage: true, status: true } } },
    });

    const totalReferrals = referrals.length;
    const hiredReferrals = referrals.filter((r) =>
      r.stageRecords.some((s) => s.stage === '入职' && s.status === 'passed')
    ).length;
    const hireRate = totalReferrals > 0 ? Math.round((hiredReferrals / totalReferrals) * 100) : 0;

    // 推荐人排行
    const referrerMap = new Map<string, { count: number; hired: number }>();
    for (const r of referrals) {
      const name = r.referrer!;
      const entry = referrerMap.get(name) || { count: 0, hired: 0 };
      entry.count++;
      if (r.stageRecords.some((s) => s.stage === '入职' && s.status === 'passed')) {
        entry.hired++;
      }
      referrerMap.set(name, entry);
    }

    const topReferrers = Array.from(referrerMap.entries())
      .map(([referrer, data]) => ({ referrer, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return { totalReferrals, hiredReferrals, hireRate, topReferrers };
  }

  /**
   * 招聘周期统计 — 各阶段平均/最长/最短停留天数
   */
  async getCycleStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<CycleStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('cycle', dateRange, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const range = dateRange || this.getDefaultDateRange();

    const visibleIds = await this.getVisibleCandidateIds(scope);
    const candidateFilter = this.visibleCandidateSql('c.id', visibleIds);

    const result = await prisma.$queryRaw<CycleStat[]>`
      SELECT sr.stage,
        ROUND(AVG(EXTRACT(EPOCH FROM (sr."completedAt" - sr."enteredAt")) / 86400)::numeric, 1) as "avgDays",
        ROUND(MAX(EXTRACT(EPOCH FROM (sr."completedAt" - sr."enteredAt")) / 86400)::numeric, 1) as "maxDays",
        ROUND(MIN(EXTRACT(EPOCH FROM (sr."completedAt" - sr."enteredAt")) / 86400)::numeric, 1) as "minDays",
        COUNT(*)::int as "totalCount"
      FROM stage_record sr
      INNER JOIN candidate c ON c.id = sr."candidateId"
      WHERE sr."completedAt" IS NOT NULL
        AND sr."enteredAt" >= ${range.startDate} AND sr."enteredAt" <= ${range.endDate}
        ${candidateFilter}
      GROUP BY sr.stage
      ORDER BY
        CASE sr.stage
          WHEN '入库' THEN 1 WHEN '初筛' THEN 2 WHEN '复试' THEN 3
          WHEN '终面' THEN 4 WHEN '拟录用' THEN 5 WHEN 'Offer' THEN 6
          WHEN '入职' THEN 7
        END
    `;

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * 职位时间指标 — 每个职位的 TTF（发布到接受Offer）和 TTH（入库到入职）
   */
  async getJobTimeStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<JobTimeStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('jobtime', dateRange, scope);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const range = dateRange || this.getDefaultDateRange();

    const visibleIds = await this.getVisibleCandidateIds(scope);
    const candidateFilter = this.visibleCandidateSql('c.id', visibleIds);

    const result = await prisma.$queryRaw<JobTimeStat[]>`
      SELECT
        j.id as "jobId",
        j.title as "jobTitle",
        COALESCE(j.departments->>0, '') as "department",
        COUNT(DISTINCT cj."candidateId")::int as "candidateCount",
        COUNT(DISTINCT CASE WHEN o.joined = true THEN o."candidateId" END)::int as "hiredCount",
        ROUND(EXTRACT(EPOCH FROM (
          MIN(CASE WHEN o.result = 'accepted' THEN o."offerDate" END) - j."createdAt"
        )) / 86400)::int as "ttfDays",
        ROUND(EXTRACT(EPOCH FROM (
          MIN(CASE WHEN o.joined = true THEN o."actualJoinDate" END) - MIN(c."createdAt")
        )) / 86400)::int as "tthDays"
      FROM job j
      LEFT JOIN candidate_job cj ON cj."jobId" = j.id
      LEFT JOIN candidate c ON c.id = cj."candidateId"
      LEFT JOIN offer o ON o."candidateId" = c.id
      WHERE j."createdAt" >= ${range.startDate} AND j."createdAt" <= ${range.endDate}
      ${candidateFilter}
      GROUP BY j.id, j.title, j.departments
      HAVING COUNT(DISTINCT cj."candidateId") > 0
      ORDER BY j."createdAt" DESC
    `;

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * 导出漏斗统计数据
   */
  async exportFunnelStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<ExportData> {
    const stats = await this.getFunnelStats(dateRange, scope);
    return {
      headers: ['阶段', '人数'],
      rows: stats.map((s) => [s.stage, s.count]),
      filename: `招聘漏斗_${new Date().toISOString().split('T')[0]}.csv`,
    };
  }

  /**
   * 导出周期统计数据
   */
  async exportCycleStats(dateRange?: DateRange, scope?: CandidateVisibilityScope): Promise<ExportData> {
    const stats = await this.getCycleStats(dateRange, scope);
    return {
      headers: ['阶段', '平均天数', '最长天数', '最短天数', '总人数'],
      rows: stats.map((s) => [s.stage, s.avgDays, s.maxDays, s.minDays, s.totalCount]),
      filename: `招聘周期_${new Date().toISOString().split('T')[0]}.csv`,
    };
  }
}

// 导出单例实例
export const statsService = new StatsService();
