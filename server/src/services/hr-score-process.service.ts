import { Prisma } from '@prisma/client';
import {
  FOLLOWUP_TARGET_RATE,
  INTERVIEW_RESPONSE_TARGET_RATE,
  INTERVIEW_RESPONSE_THRESHOLD_HOURS,
  PROCESS_RULE_CODE,
  PROCESS_RULE_FULL_SCORE,
  PROCESS_RULE_LABEL,
  type ProcessRuleCode,
  RESUME_SLA_TARGET_RATE,
  RESUME_SLA_THRESHOLD_HOURS,
  TALENT_OPS_ACTIONS,
  TALENT_OPS_WEEKLY_DEFAULT,
} from '../constants/hr-score-process';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';

export interface ProcessScoreRow {
  userId: string;
  dimension: string;
  points: number;
}

const HR_ROLES = ['hr', 'member'] as const;
const PROCESS_TARGET_TYPE = 'ProcessScore';

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

/**
 * 比例 → 分数：达到目标比例得满分，否则按 rate × 满分取整（最低 0）。
 * 例：简历时效 90% 满分、50% → 5 分；面试催收按提交率 × 10。
 */
export function scoreByRate(rate: number, targetRate: number, fullScore = PROCESS_RULE_FULL_SCORE): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (rate >= targetRate) return fullScore;
  return Math.max(0, Math.min(fullScore, Math.round(rate * fullScore)));
}

/**
 * 次数 → 分数：达到目标次数得满分，否则按 count/target × 满分取整。
 */
export function scoreByCount(count: number, target: number, fullScore = PROCESS_RULE_FULL_SCORE): number {
  if (target <= 0) return fullScore;
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count >= target) return fullScore;
  return Math.max(0, Math.min(fullScore, Math.round((count / target) * fullScore)));
}

async function listHrUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: [...HR_ROLES] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function resolveTalentOpsTarget(): Promise<number> {
  try {
    const dict = await prisma.dictionary.findFirst({
      where: { category: 'hr_score_process_rule', code: PROCESS_RULE_CODE.talent_ops },
      select: { description: true },
    });
    const parsed = parseInt(dict?.description ?? '', 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch (error) {
    logger.warn({ err: error }, '[过程分] 读取人才库维护目标失败，回退 env/默认值');
  }
  const fromEnv = env.HR_SCORE_TALENT_OPS_WEEKLY;
  if (typeof fromEnv === 'number' && Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return TALENT_OPS_WEEKLY_DEFAULT;
}

async function upsertProcessEvent(
  userId: string,
  ruleCode: ProcessRuleCode,
  points: number,
  weekStart: Date,
): Promise<void> {
  const dateStr = formatDate(weekStart);
  const targetId = `week:${dateStr}`;
  const remark = `${PROCESS_RULE_LABEL[ruleCode]} 周 ${dateStr}`;
  const data = {
    userId,
    ruleCode,
    category: 'process',
    points,
    targetType: PROCESS_TARGET_TYPE,
    targetId,
    remark,
    bizDate: weekStart,
  };
  try {
    await prisma.hrScoreEvent.upsert({
      where: {
        userId_ruleCode_targetType_targetId: {
          userId,
          ruleCode,
          targetType: PROCESS_TARGET_TYPE,
          targetId,
        },
      },
      update: { points, remark, bizDate: weekStart, category: 'process' },
      create: data,
    });
  } catch (error) {
    // P2002：并发下唯一约束冲突，视为已写入
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    throw error;
  }
}

/** 简历处理时效：创建 → 首次非「入库」推进 ≤ 48h 的比例 */
async function computeResumeSla(
  userIds: string[],
  weekStart: Date,
  weekEnd: Date,
): Promise<ProcessScoreRow[]> {
  if (userIds.length === 0) return [];
  const now = new Date();
  const candidates = await prisma.candidate.findMany({
    where: {
      createdById: { in: userIds },
      createdAt: { gte: weekStart, lt: weekEnd },
      deletedAt: null,
    },
    select: {
      id: true,
      createdById: true,
      createdAt: true,
      stageRecords: {
        orderBy: { enteredAt: 'asc' },
        select: { stage: true, enteredAt: true },
      },
    },
  });

  const stats = new Map<string, { hit: number; total: number }>();
  for (const uid of userIds) stats.set(uid, { hit: 0, total: 0 });

  for (const c of candidates) {
    const bucket = stats.get(c.createdById);
    if (!bucket) continue;
    const firstAdvance = c.stageRecords.find((r) => r.stage !== '入库') ?? c.stageRecords[1];
    const ageHours = hoursBetween(c.createdAt, now);
    if (!firstAdvance && ageHours < RESUME_SLA_THRESHOLD_HOURS) {
      // 仍在 48h 窗口内、尚未推进：不计入分母，避免误伤
      continue;
    }
    bucket.total += 1;
    if (firstAdvance && hoursBetween(c.createdAt, firstAdvance.enteredAt) <= RESUME_SLA_THRESHOLD_HOURS) {
      bucket.hit += 1;
    }
  }

  const rows: ProcessScoreRow[] = [];
  for (const [userId, { hit, total }] of stats) {
    if (total === 0) continue;
    rows.push({
      userId,
      dimension: PROCESS_RULE_CODE.resume_sla,
      points: scoreByRate(hit / total, RESUME_SLA_TARGET_RATE),
    });
  }
  return rows;
}

/** 面试反馈催收响应：remindedAt 后 24h 内提交率（归属面试安排人） */
async function computeInterviewResponse(
  userIds: string[],
  weekStart: Date,
  weekEnd: Date,
): Promise<ProcessScoreRow[]> {
  if (userIds.length === 0) return [];
  const evaluations = await prisma.interviewEvaluation.findMany({
    where: {
      remindedAt: { not: null, gte: weekStart, lt: weekEnd },
    },
    select: {
      remindedAt: true,
      submittedAt: true,
      interview: { select: { createdById: true } },
    },
  });

  const stats = new Map<string, { hit: number; total: number }>();
  for (const uid of userIds) stats.set(uid, { hit: 0, total: 0 });

  for (const ev of evaluations) {
    const uid = ev.interview.createdById;
    const bucket = stats.get(uid);
    if (!bucket || !ev.remindedAt) continue;
    bucket.total += 1;
    if (
      ev.submittedAt
      && hoursBetween(ev.remindedAt, ev.submittedAt) <= INTERVIEW_RESPONSE_THRESHOLD_HOURS
    ) {
      bucket.hit += 1;
    }
  }

  const rows: ProcessScoreRow[] = [];
  for (const [userId, { hit, total }] of stats) {
    if (total === 0) continue;
    rows.push({
      userId,
      dimension: PROCESS_RULE_CODE.interview_response,
      points: scoreByRate(hit / total, INTERVIEW_RESPONSE_TARGET_RATE),
    });
  }
  return rows;
}

/** 跟进记录完整度：活跃候选人中本周有 CommunicationLog 的比例 */
async function computeFollowupCoverage(
  userIds: string[],
  weekStart: Date,
  weekEnd: Date,
): Promise<ProcessScoreRow[]> {
  if (userIds.length === 0) return [];
  const [stageChanged, comms] = await Promise.all([
    prisma.stageRecord.findMany({
      where: { enteredAt: { gte: weekStart, lt: weekEnd } },
      select: { candidateId: true, candidate: { select: { createdById: true } } },
    }),
    prisma.communicationLog.findMany({
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
      select: { candidateId: true, candidate: { select: { createdById: true } } },
    }),
  ]);

  const active = new Map<string, Set<string>>();
  const covered = new Map<string, Set<string>>();
  for (const uid of userIds) {
    active.set(uid, new Set());
    covered.set(uid, new Set());
  }

  const markActive = (userId: string, candidateId: string) => {
    active.get(userId)?.add(candidateId);
  };

  for (const row of stageChanged) {
    markActive(row.candidate.createdById, row.candidateId);
  }
  for (const row of comms) {
    const uid = row.candidate.createdById;
    markActive(uid, row.candidateId);
    covered.get(uid)?.add(row.candidateId);
  }

  const rows: ProcessScoreRow[] = [];
  for (const userId of userIds) {
    const total = active.get(userId)?.size ?? 0;
    if (total === 0) continue;
    const hit = covered.get(userId)?.size ?? 0;
    rows.push({
      userId,
      dimension: PROCESS_RULE_CODE.followup_coverage,
      points: scoreByRate(hit / total, FOLLOWUP_TARGET_RATE),
    });
  }
  return rows;
}

/** 人才库维护：本周有效操作 distinct(targetId) 次数 */
async function computeTalentOps(
  userIds: string[],
  weekStart: Date,
  weekEnd: Date,
): Promise<ProcessScoreRow[]> {
  if (userIds.length === 0) return [];
  const target = await resolveTalentOpsTarget();
  const logs = await prisma.operationLog.findMany({
    where: {
      userId: { in: userIds },
      createdAt: { gte: weekStart, lt: weekEnd },
      action: { in: [...TALENT_OPS_ACTIONS] },
    },
    select: { userId: true, targetId: true, action: true },
  });

  const distinct = new Map<string, Set<string>>();
  for (const uid of userIds) distinct.set(uid, new Set());
  for (const log of logs) {
    distinct.get(log.userId)?.add(`${log.action}:${log.targetId}`);
  }

  return userIds.map((userId) => ({
    userId,
    dimension: PROCESS_RULE_CODE.talent_ops,
    points: scoreByCount(distinct.get(userId)?.size ?? 0, target),
  }));
}

async function persistDimension(
  rows: ProcessScoreRow[],
  ruleCode: ProcessRuleCode,
  weekStart: Date,
): Promise<ProcessScoreRow[]> {
  for (const row of rows) {
    await upsertProcessEvent(row.userId, ruleCode, row.points, weekStart);
  }
  return rows;
}

/**
 * 按周计算 4 维过程质量分并 upsert 到 hr_score_event（category=process）。
 * 每个维度独立 try/catch，单类失败仅记日志，不影响其他维度。
 */
export async function calculateProcessScoresForWeek(weekStart: Date): Promise<ProcessScoreRow[]> {
  const weekEnd = addDays(weekStart, 7);
  let userIds: string[] = [];
  try {
    userIds = await listHrUserIds();
  } catch (error) {
    logger.error({ err: error }, '[过程分] 读取 HR 用户失败');
    return [];
  }

  const collected: ProcessScoreRow[] = [];
  const tasks: Array<{
    code: ProcessRuleCode;
    run: () => Promise<ProcessScoreRow[]>;
  }> = [
    { code: PROCESS_RULE_CODE.resume_sla, run: () => computeResumeSla(userIds, weekStart, weekEnd) },
    {
      code: PROCESS_RULE_CODE.interview_response,
      run: () => computeInterviewResponse(userIds, weekStart, weekEnd),
    },
    {
      code: PROCESS_RULE_CODE.followup_coverage,
      run: () => computeFollowupCoverage(userIds, weekStart, weekEnd),
    },
    { code: PROCESS_RULE_CODE.talent_ops, run: () => computeTalentOps(userIds, weekStart, weekEnd) },
  ];

  for (const task of tasks) {
    try {
      const rows = await task.run();
      const saved = await persistDimension(rows, task.code, weekStart);
      collected.push(...saved);
    } catch (error) {
      logger.error({ err: error, dimension: task.code }, '[过程分] 单维度计算失败');
    }
  }

  return collected;
}
