import { Prisma } from '@prisma/client';
import { AGENCY_SOURCE_PREFIX, DEFAULT_POINTS, RULE_CODE } from '../constants/hr-score-rules';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { normalizeUserRole } from './role-permission.service';

// ==================== HR 考核积分事件发射器（F4-S1）====================
// 设计原则：**fail-safe**。发射器内部吞掉所有异常（仅记日志），绝不向业务 service 抛错；
// 业务侧调用点再包一层 try/catch，形成双重保险。

export interface EmitScoreEventInput {
  ruleCode: string;
  userId: string;
  targetType?: string;
  targetId?: string;
  remark?: string;
  bizDate?: Date;
}

/**
 * 读字典分值：hr_score_rule.description 存分值整数字符串（如 '2' / '-10'）。
 * 字典缺失 / 解析失败时回退 DEFAULT_POINTS；两者都没有则返回 null（表示未知规则，不记分）。
 * 注意：dictionary 表没有 (category, code) 唯一约束，只能用 findFirst。
 */
async function resolvePoints(ruleCode: string): Promise<number | null> {
  let dictPoints: number | null = null;
  try {
    const dict = await prisma.dictionary.findFirst({
      where: { category: 'hr_score_rule', code: ruleCode },
      select: { description: true },
    });
    const parsed = parseInt(dict?.description ?? '', 10);
    if (Number.isFinite(parsed)) dictPoints = parsed;
  } catch (error) {
    // 字典读取失败不影响记分，走常量兜底
    logger.warn({ err: error, ruleCode }, '[F4-S1] 读取积分字典失败，回退默认分值');
  }

  if (dictPoints !== null) return dictPoints;
  const fallback = DEFAULT_POINTS[ruleCode];
  return typeof fallback === 'number' ? fallback : null;
}

/**
 * 发射一条考核积分事件。
 * 1. 仅 hr 角色（含存量 member 映射）计入考核，admin / hiring_manager / interviewer 直接跳过；
 * 2. 分值取字典，缺失回退常量；
 * 3. 唯一约束冲突（P2002）视为已记分，静默幂等跳过；
 * 4. 其他异常仅记日志，不抛出。
 */
export async function emitScoreEvent(input: EmitScoreEventInput): Promise<void> {
  try {
    const {
      ruleCode, userId, targetType, targetId, remark, bizDate,
    } = input;
    if (!userId || !ruleCode) return;

    // 角色过滤：只有 hr 才是考核对象
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return;
    let role: string;
    try {
      role = normalizeUserRole(user.role);
    } catch {
      // 未知角色不记分
      return;
    }
    if (role !== 'hr') return;

    const points = await resolvePoints(ruleCode);
    if (points === null) {
      logger.warn({ ruleCode }, '[F4-S1] 未知积分规则，跳过记分');
      return;
    }

    await prisma.hrScoreEvent.create({
      data: {
        userId,
        ruleCode,
        category: 'business',
        points,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        remark: remark ?? null,
        bizDate: bizDate ?? new Date(),
      },
    });
  } catch (error) {
    // P2002 = 同一用户 + 规则 + 业务对象已记过分，幂等跳过
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    logger.error({ err: error, input }, '[F4-S1] 积分事件发射失败');
  }
}

/**
 * 「首次推进」积分分流：候选人产生第一条推进阶段记录时调用。
 * 猎头渠道（source 以「猎头:」开头）→ agency_resume_process +3；否则 dept_recommend +5。
 * 积分归属推进人（operatedById）。
 */
export async function emitFirstAdvance(
  source: string | null,
  operatedById: string,
  candidateId: string,
): Promise<void> {
  const isAgency = (source ?? '').startsWith(AGENCY_SOURCE_PREFIX);
  await emitScoreEvent({
    ruleCode: isAgency ? RULE_CODE.agency_resume_process : RULE_CODE.dept_recommend,
    userId: operatedById,
    targetType: 'Candidate',
    targetId: candidateId,
    remark: isAgency ? '猎头渠道简历首次推进' : '首次推进（推荐到用人部门）',
  });
}

/**
 * 「试用期淘汰」负分：入职阶段被淘汰或被 admin 回退时调用。
 * 负分归属招聘负责人（candidate.createdById），约束的是招聘结果所有者。
 */
export async function emitProbationOut(
  candidateId: string,
  candidateCreatedById: string,
  remark?: string,
): Promise<void> {
  await emitScoreEvent({
    ruleCode: RULE_CODE.probation_out,
    userId: candidateCreatedById,
    targetType: 'Candidate',
    targetId: candidateId,
    remark: remark ?? '试用期淘汰',
  });
}
