import prisma from '../lib/prisma';

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
   * GET /api/stats/workload
   * 工作量统计
   */
  async getWorkloadStats(dateRange?: DateRange): Promise<WorkloadStat[]> {
    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    // 获取所有用户
    const users = await prisma.user.findMany({
      select: { id: true, name: true },
    });

    // 并行查询每个用户的统计数据
    const statsPromises = users.map(async (user) => {
      // 新增候选人数量
      const newCandidates = await prisma.candidate.count({
        where: {
          createdById: user.id,
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      // 阶段推进次数
      const stageAdvances = await prisma.stageRecord.count({
        where: {
          assigneeId: user.id,
          enteredAt: { gte: startDate, lte: endDate },
        },
      });

      // 面试次数
      const interviews = await prisma.interviewFeedback.count({
        where: {
          createdById: user.id,
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      // 发放 Offer 数量
      const offers = await prisma.offer.count({
        where: {
          offerDate: { gte: startDate, lte: endDate },
          candidate: {
            createdById: user.id,
          },
        },
      });

      return {
        userId: user.id,
        userName: user.name,
        newCandidates,
        stageAdvances,
        interviews,
        offers,
      };
    });

    const stats = await Promise.all(statsPromises);

    // 过滤掉全部数据为 0 的用户（可选，根据需求决定是否保留）
    return stats.filter(
      (s) => s.newCandidates > 0 || s.stageAdvances > 0 || s.interviews > 0 || s.offers > 0
    );
  }

  /**
   * GET /api/stats/channel
   * 渠道效果分析
   */
  async getChannelStats(dateRange?: DateRange): Promise<ChannelStat[]> {
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

    // 按候选人数量降序排序
    return stats.sort((a, b) => b.candidateCount - a.candidateCount);
  }

  /**
   * GET /api/stats/jobs
   * 职位维度统计
   */
  async getJobStats(dateRange?: DateRange): Promise<JobStat[]> {
    const { startDate, endDate } = dateRange || this.getDefaultDateRange();

    // 获取所有职位
    const jobs = await prisma.job.findMany({
      select: {
        id: true,
        title: true,
        departments: true,
      },
    });

    // 并行查询每个职位的统计数据
    const statsPromises = jobs.map(async (job) => {
      // 获取关联的候选人 IDs
      const candidateJobs = await prisma.candidateJob.findMany({
        where: { jobId: job.id },
        select: { candidateId: true },
      });
      const candidateIds = candidateJobs.map((cj) => cj.candidateId);

      // 候选人数量
      const candidateCount = candidateIds.length;

      // 面试次数（这些候选人的面试反馈）
      const interviewCount = candidateCount > 0
        ? await prisma.interviewFeedback.count({
            where: {
              candidateId: { in: candidateIds },
              createdAt: { gte: startDate, lte: endDate },
            },
          })
        : 0;

      // Offer 数量
      const offerCount = candidateCount > 0
        ? await prisma.offer.count({
            where: {
              candidateId: { in: candidateIds },
              offerDate: { gte: startDate, lte: endDate },
            },
          })
        : 0;

      // 已入职数量
      const hiredCount = candidateCount > 0
        ? await prisma.offer.count({
            where: {
              candidateId: { in: candidateIds },
              joined: true,
              actualJoinDate: { gte: startDate, lte: endDate },
            },
          })
        : 0;

      // 解析部门（JSON 数组）
      let department = '未分配';
      try {
        const departments = job.departments as string[];
        department = departments && departments.length > 0 ? departments[0] : '未分配';
      } catch {
        department = '未分配';
      }

      return {
        jobId: job.id,
        jobTitle: job.title,
        department,
        candidateCount,
        interviewCount,
        offerCount,
        hiredCount,
      };
    });

    const stats = await Promise.all(statsPromises);

    // 过滤掉没有候选人的职位（可选，根据需求决定是否保留）
    return stats.filter((s) => s.candidateCount > 0);
  }

  /**
   * GET /api/stats/funnel
   * 招聘漏斗统计
   */
  async getFunnelStats(dateRange?: DateRange): Promise<FunnelStat[]> {
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

    return [
      { stage: '简历入库', count: newCandidates },
      { stage: '初筛通过', count: initialScreenPassed.length },
      { stage: '复试通过', count: retestPassed.length },
      { stage: '终面通过', count: finalInterviewPassed.length },
      { stage: 'Offer接受', count: offerAccepted },
      { stage: '成功入职', count: hired },
    ];
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
