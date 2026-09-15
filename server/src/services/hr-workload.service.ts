import type { Prisma } from '@prisma/client';
import { InterviewStatus, OfferResult, StageStatus, UserRole } from '@prisma/client';
import prisma from '../lib/prisma';
import { getFromCache, setCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

export type WorkloadPeriod = 'day' | 'week' | 'month';

export interface HrWorkloadQuery {
  period: WorkloadPeriod;
  date: string;
  department?: string;
  hrId?: string;
}

export interface HrWorkloadDetailQuery extends HrWorkloadQuery {
  includeTimeline?: boolean;
  includeCandidates?: boolean;
}

export interface DateRangeResolved {
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
}

export interface ProcessMetrics {
  newCandidates: number;
  communications: number;
  interviewsScheduled: number;
  interviewsCompleted: number;
  offerActions: number;
  stageAdvances: number;
}

export interface ResultMetrics {
  screeningPassed: number;
  interviewsCompleted: number;
  offersSent: number;
  offersAccepted: number;
  joined: number;
}

export interface RateMetrics {
  screeningPassRate: number | null;
  interviewCompleteRate: number | null;
  offerAcceptRate: number | null;
  joinRate: number | null;
}

export interface WeakPoint {
  stage: string;
  rate: number | null;
  teamRate: number | null;
}

export interface HrWorkloadRow {
  hrId: string;
  hrName: string;
  department: string | null;
  process: ProcessMetrics;
  result: ResultMetrics;
  rates: RateMetrics;
  status: 'normal' | 'need_attention' | 'insufficient_sample';
  weakPoints: WeakPoint[];
  approximate: boolean;
}

export interface HrWorkloadOverview {
  range: { start: string; end: string };
  summary: {
    activeHrCount: number;
    newCandidates: number;
    communications: number;
    interviewsScheduled: number;
    interviewsCompleted: number;
    offersSent: number;
    offersAccepted: number;
    joined: number;
    avgCycleDays: number | null;
    weakPointCount: number;
  };
  rows: HrWorkloadRow[];
}

const CACHE_TTL = 60;
const SAMPLE_MIN = 5;
const WEAK_RATIO = 0.8;
const BUSY_PROCESS_RATIO = 1.2;
const OFFER_ACTIONS = [
  'offer_submitted',
  'offer_approved',
  'offer_rejected',
  'offer_sent',
  'offer_accepted',
  'offer_joined',
] as const;

const emptyProcess = (): ProcessMetrics => ({
  newCandidates: 0,
  communications: 0,
  interviewsScheduled: 0,
  interviewsCompleted: 0,
  offerActions: 0,
  stageAdvances: 0,
});

const emptyResult = (): ResultMetrics => ({
  screeningPassed: 0,
  interviewsCompleted: 0,
  offersSent: 0,
  offersAccepted: 0,
  joined: 0,
});

/** YYYY-MM-DD → 本地日历日 00:00 */
function parseAnchor(dateStr: string): Date {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!matched) {
    throw new AppError('日期格式必须为 YYYY-MM-DD', 400);
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new AppError('无效的日期', 400);
  }
  return d;
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日=自然日；周=周一至周日；月=自然月 */
export function resolveRange(period: WorkloadPeriod, date: string): DateRangeResolved {
  const anchor = parseAnchor(date);
  if (period === 'day') {
    return {
      start: new Date(anchor),
      end: endOfDay(anchor),
      startStr: toDateStr(anchor),
      endStr: toDateStr(anchor),
    };
  }
  if (period === 'week') {
    const day = anchor.getDay();
    const toMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + toMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday,
      end: endOfDay(sunday),
      startStr: toDateStr(monday),
      endStr: toDateStr(sunday),
    };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return {
    start: first,
    end: endOfDay(last),
    startStr: toDateStr(first),
    endStr: toDateStr(last),
  };
}

/** 分母为 0 或非有限值时返回 null，禁止 NaN/Infinity */
export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const rate = numerator / denominator;
  if (!Number.isFinite(rate)) return null;
  return Math.round(rate * 10000) / 10000;
}

export function sumProcess(p: ProcessMetrics): number {
  return (
    p.newCandidates +
    p.communications +
    p.interviewsScheduled +
    p.interviewsCompleted +
    p.offerActions +
    p.stageAdvances
  );
}

export function buildRates(result: ResultMetrics, newCandidates: number): RateMetrics {
  return {
    screeningPassRate: safeRate(result.screeningPassed, newCandidates),
    interviewCompleteRate: safeRate(result.interviewsCompleted, result.screeningPassed),
    offerAcceptRate: safeRate(result.offersAccepted, result.offersSent),
    joinRate: safeRate(result.joined, result.offersAccepted),
  };
}

export function detectWeakPoints(
  rates: RateMetrics,
  teamRates: RateMetrics,
  prevCounts: {
    newCandidates: number;
    screeningPassed: number;
    offersSent: number;
    offersAccepted: number;
  }
): WeakPoint[] {
  const items: Array<{
    stage: string;
    rate: number | null;
    teamRate: number | null;
    prev: number;
  }> = [
    {
      stage: 'screening',
      rate: rates.screeningPassRate,
      teamRate: teamRates.screeningPassRate,
      prev: prevCounts.newCandidates,
    },
    {
      stage: 'interviewComplete',
      rate: rates.interviewCompleteRate,
      teamRate: teamRates.interviewCompleteRate,
      prev: prevCounts.screeningPassed,
    },
    {
      stage: 'offerAccept',
      rate: rates.offerAcceptRate,
      teamRate: teamRates.offerAcceptRate,
      prev: prevCounts.offersSent,
    },
    {
      stage: 'joined',
      rate: rates.joinRate,
      teamRate: teamRates.joinRate,
      prev: prevCounts.offersAccepted,
    },
  ];

  return items
    .filter((item) => {
      if (item.prev < SAMPLE_MIN) return false;
      if (item.rate == null || item.teamRate == null) return false;
      return item.rate < item.teamRate * WEAK_RATIO;
    })
    .map(({ stage, rate, teamRate }) => ({ stage, rate, teamRate }));
}

export function classifyStatus(input: {
  processTotal: number;
  teamAvgProcess: number;
  joinRate: number | null;
  teamJoinRate: number | null;
  offersAccepted: number;
  maxPrev: number;
}): 'normal' | 'need_attention' | 'insufficient_sample' {
  if (input.maxPrev < SAMPLE_MIN) return 'insufficient_sample';
  const busy =
    input.teamAvgProcess > 0 &&
    input.processTotal > input.teamAvgProcess * BUSY_PROCESS_RATIO;
  const inefficient =
    input.offersAccepted >= SAMPLE_MIN &&
    input.joinRate != null &&
    input.teamJoinRate != null &&
    input.joinRate < input.teamJoinRate * WEAK_RATIO;
  if (busy && inefficient) return 'need_attention';
  return 'normal';
}

export function assembleRows(
  hrs: Array<{ id: string; name: string; department: string | null }>,
  metrics: Map<string, { process: ProcessMetrics; result: ResultMetrics; approximate: boolean }>
): HrWorkloadRow[] {
  const populated = hrs.map((hr) => {
    const m = metrics.get(hr.id) || {
      process: emptyProcess(),
      result: emptyResult(),
      approximate: false,
    };
    return { hr, process: m.process, result: m.result, approximate: m.approximate };
  });

  const teamProcess = emptyProcess();
  const teamResult = emptyResult();
  let teamNewCandidates = 0;
  populated.forEach((row) => {
    teamNewCandidates += row.process.newCandidates;
    (Object.keys(teamProcess) as Array<keyof ProcessMetrics>).forEach((k) => {
      teamProcess[k] += row.process[k];
    });
    (Object.keys(teamResult) as Array<keyof ResultMetrics>).forEach((k) => {
      teamResult[k] += row.result[k];
    });
  });
  const teamRates = buildRates(teamResult, teamNewCandidates);
  const n = populated.length || 1;
  const teamAvgProcess = populated.reduce((s, r) => s + sumProcess(r.process), 0) / n;

  return populated.map(({ hr, process, result, approximate }) => {
    const rates = buildRates(result, process.newCandidates);
    const weakPoints = detectWeakPoints(rates, teamRates, {
      newCandidates: process.newCandidates,
      screeningPassed: result.screeningPassed,
      offersSent: result.offersSent,
      offersAccepted: result.offersAccepted,
    });
    const maxPrev = Math.max(
      process.newCandidates,
      result.screeningPassed,
      result.offersSent,
      result.offersAccepted
    );
    return {
      hrId: hr.id,
      hrName: hr.name || '已删除用户',
      department: hr.department,
      process,
      result,
      rates,
      status: classifyStatus({
        processTotal: sumProcess(process),
        teamAvgProcess,
        joinRate: rates.joinRate,
        teamJoinRate: teamRates.joinRate,
        offersAccepted: result.offersAccepted,
        maxPrev,
      }),
      weakPoints,
      approximate,
    };
  });
}

function bump(
  map: Map<string, { process: ProcessMetrics; result: ResultMetrics; approximate: boolean }>,
  userId: string | null | undefined,
  apply: (bucket: { process: ProcessMetrics; result: ResultMetrics; approximate: boolean }) => void
): void {
  if (!userId) return;
  let bucket = map.get(userId);
  if (!bucket) {
    bucket = { process: emptyProcess(), result: emptyResult(), approximate: false };
    map.set(userId, bucket);
  }
  apply(bucket);
}

function cacheKey(prefix: string, query: HrWorkloadQuery): string {
  return `${prefix}:${query.period}:${query.date}:${query.department || ''}:${query.hrId || ''}`;
}

/** 按周期平移日期锚点：day ±N 天，week ±N 周，month ±N 月 */
function shiftAnchor(period: WorkloadPeriod, date: string, delta: number): string {
  const d = parseAnchor(date);
  if (period === 'day') d.setDate(d.getDate() + delta);
  else if (period === 'week') d.setDate(d.getDate() + delta * 7);
  else d.setMonth(d.getMonth() + delta);
  return toDateStr(d);
}

/**
 * HR 工作负载监控（admin-only，实时计算 + 60s 缓存）
 */
export class HrWorkloadService {
  async getOverview(query: HrWorkloadQuery): Promise<HrWorkloadOverview> {
    const key = cacheKey('hr-workload:overview', query);
    const cached = await getFromCache<HrWorkloadOverview>(key);
    if (cached) return cached;
    const data = await this.computeOverview(query);
    await setCache(key, data, CACHE_TTL);
    return data;
  }

  async getUserDetail(hrId: string, query: HrWorkloadDetailQuery) {
    // includeTimeline/includeCandidates 会改变返回结构，缓存 key 必须带上，避免串缓存
    const detailSuffix = `${query.includeTimeline ? '1' : '0'}${query.includeCandidates ? '1' : '0'}`;
    const key = cacheKey(`hr-workload:detail:${hrId}:${detailSuffix}`, query);
    const cached = await getFromCache<unknown>(key);
    if (cached) return cached;

    const user = await prisma.user.findUnique({
      where: { id: hrId },
      select: { id: true, name: true, department: true, role: true },
    });
    if (!user) throw new AppError('用户不存在', 404);

    const overview = await this.computeOverview({ ...query, hrId: undefined });
    const row =
      overview.rows.find((r) => r.hrId === hrId) ||
      assembleRows(
        [{ id: user.id, name: user.name, department: user.department }],
        new Map()
      )[0];

    const trend = await this.buildTrend(hrId, query);
    const range = resolveRange(query.period, query.date);
    const timeline = query.includeTimeline
      ? await this.buildTimeline(hrId, range)
      : undefined;
    const candidates = query.includeCandidates
      ? await this.buildCandidates(hrId, range)
      : undefined;

    const detail = {
      range: overview.range,
      row,
      trend,
      timeline,
      candidates,
    };
    await setCache(key, detail, CACHE_TTL);
    return detail;
  }

  async exportOverview(
    query: HrWorkloadQuery,
    operatorId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const data = await this.computeOverview(query);
    await this.writeExportLog(operatorId, query, data.rows.length);
    const buffer = await this.toXlsx(data);
    const filename = `HR工作负载_${query.period}_${query.date}.xlsx`;
    return { buffer, filename };
  }

  private async computeOverview(query: HrWorkloadQuery): Promise<HrWorkloadOverview> {
    const range = resolveRange(query.period, query.date);
    const hrs = await prisma.user.findMany({
      where: {
        role: { in: [UserRole.hr, UserRole.member] },
        ...(query.department ? { department: query.department } : {}),
      },
      select: { id: true, name: true, department: true },
      orderBy: { createdAt: 'asc' },
    });

    const metrics = await this.collectMetrics(range);
    let rows = assembleRows(hrs, metrics);
    if (query.hrId) {
      rows = rows.filter((r) => r.hrId === query.hrId);
    }

    const avgCycleDays = await this.avgCycleDays(range);
    const activeHrCount = rows.filter(
      (r) => sumProcess(r.process) > 0 || r.result.joined > 0 || r.result.offersSent > 0
    ).length;

    return {
      range: { start: range.startStr, end: range.endStr },
      summary: {
        activeHrCount,
        newCandidates: rows.reduce((s, r) => s + r.process.newCandidates, 0),
        communications: rows.reduce((s, r) => s + r.process.communications, 0),
        interviewsScheduled: rows.reduce((s, r) => s + r.process.interviewsScheduled, 0),
        interviewsCompleted: rows.reduce((s, r) => s + r.process.interviewsCompleted, 0),
        offersSent: rows.reduce((s, r) => s + r.result.offersSent, 0),
        offersAccepted: rows.reduce((s, r) => s + r.result.offersAccepted, 0),
        joined: rows.reduce((s, r) => s + r.result.joined, 0),
        avgCycleDays,
        weakPointCount: rows.reduce((s, r) => s + r.weakPoints.length, 0),
      },
      rows,
    };
  }

  /**
   * 按操作人聚合过程量/结果量。Offer/入职优先 OperationLog，无日志则按候选人创建人近似。
   */
  private async collectMetrics(range: DateRangeResolved) {
    const createdRange = { gte: range.start, lte: range.end };
    const live = { deletedAt: null };

    const [
      newCandidates,
      communications,
      interviewsScheduled,
      interviewsCompleted,
      stageAdvances,
      screeningPassed,
      offerLogs,
      offers,
    ] = await Promise.all([
      prisma.candidate.groupBy({
        by: ['createdById'],
        where: { createdAt: createdRange, ...live },
        _count: { id: true },
      }),
      prisma.communicationLog.groupBy({
        by: ['createdById'],
        where: { createdAt: createdRange, candidate: live },
        _count: { id: true },
      }),
      prisma.interview.groupBy({
        by: ['createdById'],
        where: { createdAt: createdRange, candidate: live },
        _count: { id: true },
      }),
      prisma.interview.groupBy({
        by: ['createdById'],
        where: {
          status: InterviewStatus.completed,
          updatedAt: createdRange,
          candidate: live,
        },
        _count: { id: true },
      }),
      prisma.stageRecord.groupBy({
        by: ['assigneeId'],
        where: { enteredAt: createdRange, candidate: live },
        _count: { id: true },
      }),
      prisma.stageRecord.groupBy({
        by: ['assigneeId'],
        where: {
          stage: '初筛',
          status: StageStatus.passed,
          enteredAt: createdRange,
          candidate: live,
        },
        _count: { id: true },
      }),
      prisma.operationLog.findMany({
        where: {
          createdAt: createdRange,
          targetType: 'Offer',
          action: { in: [...OFFER_ACTIONS] },
        },
        select: { userId: true, action: true, targetId: true },
      }),
      prisma.offer.findMany({
        where: {
          candidate: live,
          OR: [
            { status: 'sent', updatedAt: createdRange },
            { result: OfferResult.accepted, updatedAt: createdRange },
            { joined: true, actualJoinDate: createdRange },
          ],
        },
        select: {
          id: true,
          status: true,
          result: true,
          joined: true,
          candidate: { select: { createdById: true } },
        },
      }),
    ]);

    const map = new Map<
      string,
      { process: ProcessMetrics; result: ResultMetrics; approximate: boolean }
    >();

    newCandidates.forEach((row) => {
      bump(map, row.createdById, (b) => {
        b.process.newCandidates += row._count.id;
      });
    });
    communications.forEach((row) => {
      bump(map, row.createdById, (b) => {
        b.process.communications += row._count.id;
      });
    });
    interviewsScheduled.forEach((row) => {
      bump(map, row.createdById, (b) => {
        b.process.interviewsScheduled += row._count.id;
      });
    });
    interviewsCompleted.forEach((row) => {
      bump(map, row.createdById, (b) => {
        b.process.interviewsCompleted += row._count.id;
        b.result.interviewsCompleted += row._count.id;
        b.approximate = true;
      });
    });
    stageAdvances.forEach((row) => {
      bump(map, row.assigneeId, (b) => {
        b.process.stageAdvances += row._count.id;
        b.approximate = true;
      });
    });
    screeningPassed.forEach((row) => {
      bump(map, row.assigneeId, (b) => {
        b.result.screeningPassed += row._count.id;
        b.approximate = true;
      });
    });

    // 已写日志的 Offer 按 targetId 去重，避免同一 HR 有一条日志就导致其他 Offer 漏算
    const loggedOfferTargets = new Set<string>();
    offerLogs.forEach((row) => {
      bump(map, row.userId, (b) => {
        b.process.offerActions += 1;
        if (row.action === 'offer_sent') b.result.offersSent += 1;
        if (row.action === 'offer_accepted') b.result.offersAccepted += 1;
        if (row.action === 'offer_joined') b.result.joined += 1;
      });
      loggedOfferTargets.add(`${row.action}:${row.targetId}`);
    });

    // 无对应 action 日志时，按候选人创建人近似归属（不回刷历史日志）
    offers.forEach((offer) => {
      const owner = offer.candidate.createdById;
      if (offer.status === 'sent' && !loggedOfferTargets.has(`offer_sent:${offer.id}`)) {
        bump(map, owner, (b) => {
          b.result.offersSent += 1;
          b.process.offerActions += 1;
          b.approximate = true;
        });
      }
      if (
        offer.result === OfferResult.accepted
        && !loggedOfferTargets.has(`offer_accepted:${offer.id}`)
      ) {
        bump(map, owner, (b) => {
          b.result.offersAccepted += 1;
          b.approximate = true;
        });
      }
      if (offer.joined && !loggedOfferTargets.has(`offer_joined:${offer.id}`)) {
        bump(map, owner, (b) => {
          b.result.joined += 1;
          b.approximate = true;
        });
      }
    });

    return map;
  }

  private async avgCycleDays(range: DateRangeResolved): Promise<number | null> {
    const joined = await prisma.offer.findMany({
      where: {
        joined: true,
        actualJoinDate: { gte: range.start, lte: range.end },
        candidate: { deletedAt: null },
      },
      select: {
        actualJoinDate: true,
        candidate: { select: { createdAt: true } },
      },
    });
    if (joined.length === 0) return null;
    const days = joined
      .filter((o) => o.actualJoinDate)
      .map(
        (o) =>
          (o.actualJoinDate!.getTime() - o.candidate.createdAt.getTime()) / 86400000
      );
    if (days.length === 0) return null;
    return Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10;
  }

  private async buildTrend(hrId: string, query: HrWorkloadQuery) {
    // 并发生成 4 个周期点，避免 no-await-in-loop 且减少串行等待
    const anchors = [3, 2, 1, 0].map((i) => shiftAnchor(query.period, query.date, -i));
    const overviews = await Promise.all(
      anchors.map((anchor) => this.computeOverview({ ...query, date: anchor, hrId: undefined }))
    );
    return overviews.map((ov) => {
      const row = ov.rows.find((r) => r.hrId === hrId);
      return {
        range: ov.range,
        newCandidates: row?.process.newCandidates || 0,
        joined: row?.result.joined || 0,
        joinRate: row?.rates.joinRate ?? null,
      };
    });
  }

  private async buildTimeline(hrId: string, range: DateRangeResolved) {
    const createdRange = { gte: range.start, lte: range.end };
    const [logs, comms, interviews] = await Promise.all([
      prisma.operationLog.findMany({
        where: { userId: hrId, createdAt: createdRange },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, action: true, targetType: true, createdAt: true },
      }),
      prisma.communicationLog.findMany({
        where: { createdById: hrId, createdAt: createdRange, candidate: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          createdAt: true,
          candidate: { select: { name: true } },
        },
      }),
      prisma.interview.findMany({
        where: { createdById: hrId, createdAt: createdRange, candidate: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          round: true,
          status: true,
          createdAt: true,
          candidate: { select: { name: true } },
        },
      }),
    ]);

    const items = [
      ...logs.map((l) => ({
        at: l.createdAt.toISOString(),
        type: 'log',
        title: `${l.targetType}:${l.action}`,
      })),
      ...comms.map((c) => ({
        at: c.createdAt.toISOString(),
        type: 'communication',
        title: `沟通 ${c.type}（${c.candidate.name}）`,
      })),
      ...interviews.map((i) => ({
        at: i.createdAt.toISOString(),
        type: 'interview',
        title: `安排${i.round}（${i.candidate.name}）`,
      })),
    ];
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 50);
  }

  private async buildCandidates(hrId: string, range: DateRangeResolved) {
    const list = await prisma.candidate.findMany({
      where: {
        createdById: hrId,
        createdAt: { gte: range.start, lte: range.end },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        source: true,
        createdAt: true,
        anonymizedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // 下钻不返回手机号/邮箱；匿名化后姓名已是「已匿名」
    return list.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      createdAt: c.createdAt.toISOString(),
      anonymized: Boolean(c.anonymizedAt),
    }));
  }

  private async writeExportLog(
    userId: string,
    query: HrWorkloadQuery,
    rowsCount: number
  ): Promise<void> {
    try {
      await prisma.operationLog.create({
        data: {
          userId,
          targetType: 'HRWorkload',
          targetId: query.hrId || 'all',
          action: 'hr_workload_export',
          detail: {
            period: query.period,
            date: query.date,
            department: query.department || null,
            hrId: query.hrId || null,
            rowsCount,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error('[OperationLog] HR 工作负载导出日志写入失败:', e);
    }
  }

  private async toXlsx(data: HrWorkloadOverview): Promise<Buffer> {
    const XLSX = await import('xlsx');
    const headers = [
      'HR',
      '部门',
      '新增候选人',
      '沟通次数',
      '安排面试',
      '完成面试',
      'Offer发送',
      'Offer接受',
      '入职',
      '初筛通过率',
      'Offer接受率',
      '入职率',
      '状态',
    ];
    const body = data.rows.map((r) => [
      r.hrName,
      r.department || '',
      r.process.newCandidates,
      r.process.communications,
      r.process.interviewsScheduled,
      r.process.interviewsCompleted,
      r.result.offersSent,
      r.result.offersAccepted,
      r.result.joined,
      r.rates.screeningPassRate ?? '—',
      r.rates.offerAcceptRate ?? '—',
      r.rates.joinRate ?? '—',
      r.status,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HR工作负载');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}

export const hrWorkloadService = new HrWorkloadService();
