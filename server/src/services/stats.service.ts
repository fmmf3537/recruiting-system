import prisma from '../lib/prisma';
import { redis, connectRedis } from '../lib/redis';

// 缓存时间：5 分钟
const CACHE_TTL = 300;

function getCacheKey(prefix: string, dateRange?: DateRange): string {
  const start = dateRange?.startDate.toISOString().split('T')[0] || 'all';
  const end = dateRange?.endDate.toISOString().split('T')[0] || 'all';
  return `stats:${prefix}:${start}:${end}`;
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
  async getDashboardStats(): Promise<{
    kpi: {
      newCandidatesThisMonth: number;
      interviewingCount: number;
      pendingOffers: number;
      joinedThisMonth: number;
    };
    trend: Array<{ date: string; count: number }>;
  }> {
    await connectRedis();
    const cacheKey = 'stats:dashboard';
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 本月新增候选人
    const newCandidatesThisMonth = await prisma.candidate.count({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
    });

    // 在面人数：有面试反馈且结论为 pending 的候选人（去重）
    const interviewingCandidates = await prisma.interviewFeedback.findMany({
      where: { conclusion: 'pending' },
      distinct: ['candidateId'],
      select: { candidateId: true },
    });
    const interviewingCount = interviewingCandidates.length;

    // 待发 Offer：result 为 pending 的 Offer 数量
    const pendingOffers = await prisma.offer.count({
      where: { result: 'pending' },
    });

    // 本月入职人数
    const joinedThisMonth = await prisma.offer.count({
      where: {
        joined: true,
        actualJoinDate: { gte: monthStart, lte: monthEnd },
      },
    });

    // 近 7 天新增候选人趋势
    const trend: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const count = await prisma.candidate.count({
        where: { createdAt: { gte: d, lt: nextD } },
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
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * GET /api/stats/workload
   * 工作量统计
   */
  async getWorkloadStats(dateRange?: DateRange): Promise<WorkloadStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('workload', dateRange);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

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
        SELECT "createdById", COUNT(*)::int as count FROM "candidate"
        WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
        GROUP BY "createdById"
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
        GROUP BY ca."createdById"
      ) o ON o."createdById" = u.id
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
  async getChannelStats(dateRange?: DateRange): Promise<ChannelStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('channel', dateRange);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    // 获取所有候选人按来源分组统计
    const candidatesBySource = await prisma.candidate.groupBy({
      by: ['source'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
    });

    // 获取已入职候选人按来源分组统计
    const hiredBySource = await prisma.candidate.groupBy({
      by: ['source'],
      where: {
        createdAt: { gte: startDate, lte: endDate },
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
  async getJobStats(dateRange?: DateRange): Promise<JobStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('jobs', dateRange);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

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
        COUNT(DISTINCT cj."candidateId")::int as "candidateCount",
        COUNT(DISTINCT CASE WHEN i."createdAt" >= ${startDate} AND i."createdAt" <= ${endDate} THEN i.id END)::int as "interviewCount",
        COUNT(DISTINCT CASE WHEN o."offerDate" >= ${startDate} AND o."offerDate" <= ${endDate} THEN o.id END)::int as "offerCount",
        COUNT(DISTINCT CASE WHEN o.joined = true AND o."actualJoinDate" >= ${startDate} AND o."actualJoinDate" <= ${endDate} THEN o.id END)::int as "hiredCount"
      FROM "job" j
      LEFT JOIN "candidate_job" cj ON cj."jobId" = j.id
      LEFT JOIN "interview_feedback" i ON i."candidateId" = cj."candidateId"
      LEFT JOIN "offer" o ON o."candidateId" = cj."candidateId"
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
  async getFunnelStats(dateRange?: DateRange): Promise<FunnelStat[]> {
    await connectRedis();
    const cacheKey = getCacheKey('funnel', dateRange);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    // 简历入库：在日期范围内创建的候选人
    const newCandidates = await prisma.candidate.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    // 初筛通过
    const initialScreenPassed = await prisma.stageRecord.groupBy({
      by: ['candidateId'],
      where: {
        stage: '初筛',
        status: 'passed',
        enteredAt: { gte: startDate, lte: endDate },
      },
    });

    // 复试通过
    const retestPassed = await prisma.stageRecord.groupBy({
      by: ['candidateId'],
      where: {
        stage: '复试',
        status: 'passed',
        enteredAt: { gte: startDate, lte: endDate },
      },
    });

    // 终面通过
    const finalInterviewPassed = await prisma.stageRecord.groupBy({
      by: ['candidateId'],
      where: {
        stage: '终面',
        status: 'passed',
        enteredAt: { gte: startDate, lte: endDate },
      },
    });

    // Offer 接受
    const offerAccepted = await prisma.offer.count({
      where: {
        result: 'accepted',
        offerDate: { gte: startDate, lte: endDate },
      },
    });

    // 成功入职
    const hired = await prisma.offer.count({
      where: {
        joined: true,
        actualJoinDate: { gte: startDate, lte: endDate },
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
  async exportWorkloadStats(dateRange?: DateRange): Promise<ExportData> {
    const stats = await this.getWorkloadStats(dateRange);

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
  async exportChannelStats(dateRange?: DateRange): Promise<ExportData> {
    const stats = await this.getChannelStats(dateRange);

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
  async exportJobStats(dateRange?: DateRange): Promise<ExportData> {
    const stats = await this.getJobStats(dateRange);

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
}

// 导出单例实例
export const statsService = new StatsService();
