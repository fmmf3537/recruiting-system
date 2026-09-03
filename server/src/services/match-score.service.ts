import { createHash } from 'crypto';

import type { Prisma } from '@prisma/client';

import { env } from '../lib/env';
import { callLLM } from '../lib/llm';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import {
  assertCandidateVisible,
  type CandidateVisibilityScope,
} from './candidate-visibility.service';
import { dictionaryService } from './dictionary.service';

// ============ 常量 ============

/** 兜底默认维度（与 dictionary 默认值 matching_dimension 一致；字典空时回退使用） */
export const DEFAULT_MATCH_DIMENSIONS: Array<{
  code: string;
  name: string;
  weight: number;
}> = [
  { code: 'skill_match', name: '专业技能匹配', weight: 40 },
  { code: 'experience_match', name: '工作经验与年限', weight: 25 },
  { code: 'education_match', name: '学历与院校背景', weight: 15 },
  { code: 'stability', name: '职业稳定性', weight: 10 },
  { code: 'bonus', name: '加分项（证书/行业背景）', weight: 10 },
];

/** grade 阈值：综合分 → 等级（与服务端重算分对齐，不信任 LLM 自报） */
export const GRADE_THRESHOLDS: Array<{ grade: string; min: number }> = [
  { grade: 'strong_recommend', min: 85 }, // 强烈推荐
  { grade: 'recommend', min: 70 }, // 推荐
  { grade: 'consider', min: 50 }, // 待定
  { grade: 'not_recommend', min: 0 }, // 不推荐
];

/** LLM 失败重试次数（不计首调） */
const LLM_RETRY_TIMES = 1;

/** LLM 评分上下界（每维度 0-100），用于服务端校验与综合分计算 */
const DIMENSION_SCORE_MIN = 0;
const DIMENSION_SCORE_MAX = 100;

// ============ 类型 ============

export interface ScoreCandidateOptions {
  triggeredBy: 'auto' | 'manual';
  createdById?: string;
}

export interface MatchDimensionOutput {
  code?: string;
  name: string;
  weight?: number;
  score: number;
  comment?: string;
}

interface ParsedLLMResponse {
  overallScore?: number;
  grade?: string;
  summary?: string;
  risks?: string[];
  highlights?: string[];
  dimensions?: MatchDimensionOutput[];
}

export interface ScoreResult {
  id: string;
  candidateId: string;
  jobId: string;
  overallScore: number;
  grade: string;
  summary: string | null;
  dimensions: MatchDimensionOutput[];
  risks: string[] | null;
  highlights: string[] | null;
  stale: boolean;
  triggeredBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============ 工具函数 ============

/** 计算简历内容 hash（不绑死字段集；与 PRD §3.6 成本控制要求一致，仅 LLM 输入会变化时重算） */
// 导出仅供测试复用同一算法，避免硬编字符串导致 hash 永远不匹配
export function computeResumeHash(payload: Prisma.JsonValue | null | undefined): string {
  const canonical = JSON.stringify(payload ?? {});
  return createHash('sha256').update(canonical).digest('hex');
}

/** 算 JD hash：description + requirements；这两个字段变了 JD 内容才算变化 */
// 导出仅供测试复用同一算法，避免硬编字符串导致 hash 永远不匹配
export function computeJdHash(description: string | null | undefined, requirements: string | null | undefined): string {
  return createHash('sha256').update(`${description ?? ''}|||${requirements ?? ''}`).digest('hex');
}

/** grade 由重算的综合分按阈值表分段 */
function gradeFromScore(score: number): string {
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return 'not_recommend';
}

/** 从 LLM 返回的 JSON 中剥掉 ```json 围栏 */
function stripJsonFence(text: string): string {
  let s = text.trim();
  if (s.startsWith('```json')) s = s.slice(7);
  if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  return s.trim();
}

/**
 * 从字典读 enabled 维度；若字典空则回退 DEFAULT_MATCH_DIMENSIONS；
 * 权重从 description 解析，解析失败/缺失按 0 计；总权重为 0 时再回退等权。
 */
async function loadDimensions(): Promise<Array<{ code: string; name: string; weight: number }>> {
  let entries: Array<{ code: string; name: string; weight: number }> = [];
  try {
    const items = await dictionaryService.getDictionaries('matching_dimension');
    entries = items.map((it) => {
      const w = parseInt(it.description ?? '', 10);
      return {
        code: it.code,
        name: it.name,
        weight: Number.isFinite(w) && w > 0 ? w : 0,
      };
    });
  } catch {
    entries = [];
  }

  // 全部失效则用兜底默认维度
  if (entries.length === 0) {
    return DEFAULT_MATCH_DIMENSIONS;
  }

  const totalWeight = entries.reduce((acc, e) => acc + e.weight, 0);
  if (totalWeight > 0) return entries;

  // 权重和为 0：回退等权（仍按代码顺序）
  const equal = 100 / entries.length;
  return entries.map((e) => ({ ...e, weight: equal }));
}

/** 取每个维度的分数：优先按 code 匹配词典维度（权重来自字典），未匹配项按 0 计 */
function mergeScores(
  llmDimensions: MatchDimensionOutput[] | undefined,
  weights: Array<{ code: string; name: string; weight: number }>,
): {
    dimensions: MatchDimensionOutput[];
    totalScore: number;
  } {
  const merged: MatchDimensionOutput[] = [];
  const byCodeOrName = new Map<string, MatchDimensionOutput>();
  for (const d of llmDimensions || []) {
    const key = (d.code || d.name || '').trim();
    if (key) byCodeOrName.set(key, d);
  }

  let weightedSum = 0;
  let weightTotal = 0;

  for (const w of weights) {
    // 没匹配上 code/name 时：score 按 0 计，并在 detail 留痕（通过 push 的 score=0 体现）
    const llm = byCodeOrName.get(w.code) || byCodeOrName.get(w.name);
    const rawScore = llm && typeof llm.score === 'number'
      ? Math.max(DIMENSION_SCORE_MIN, Math.min(DIMENSION_SCORE_MAX, llm.score))
      : 0;
    const comment = llm?.comment;
    merged.push({
      code: w.code,
      name: w.name,
      weight: w.weight,
      score: rawScore,
      comment,
    });
    weightedSum += rawScore * w.weight;
    weightTotal += w.weight;
  }

  const totalScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
  return { dimensions: merged, totalScore };
}

/**
 * 调 LLM 并解析。失败时按 LLM_RETRY_TIMES 重试，仍失败抛错。
 * 不对 LLM 自报的 overallScore/grade 采信，由调用方基于 dims 重算。
 */
async function callLLMForScore(
  systemPrompt: string,
  userPrompt: string,
): Promise<ParsedLLMResponse> {
  let lastErr: unknown = null;
  for (let i = 0; i <= LLM_RETRY_TIMES; i += 1) {
    try {
      // 调用目的写入 Prometheus 指标，便于按业务区分统计
      const res = await callLLM(userPrompt, systemPrompt, 'match-score');
      const jsonStr = stripJsonFence(res.content);
      const parsed = JSON.parse(jsonStr) as ParsedLLMResponse;
      return parsed;
    } catch (err) {
      lastErr = err;
      if (i === LLM_RETRY_TIMES) break;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new AppError(`LLM 调用失败：${detail}`, 500);
}

/** 候选人结构化字段转为 LLM 输入（不读原始简历文件，仅依赖 DB 结构化字段） */
function buildCandidatePayload(candidate: {
  name: string;
  skills: unknown;
  workYears: number | null;
  education: string | null;
  school: string | null;
  currentCompany: string | null;
  currentPosition: string | null;
  workHistories?: Array<{
    company: string;
    position: string;
    startDate: Date | null;
    endDate: Date | null;
    description: string | null;
  }>;
}): Prisma.JsonValue {
  return {
    name: candidate.name,
    skills: Array.isArray(candidate.skills) ? candidate.skills : [],
    workYears: candidate.workYears,
    education: candidate.education,
    school: candidate.school,
    currentCompany: candidate.currentCompany,
    currentPosition: candidate.currentPosition,
    workHistories: (candidate.workHistories || []).map((w) => ({
      company: w.company,
      position: w.position,
      startDate: w.startDate ? w.startDate.toISOString() : null,
      endDate: w.endDate ? w.endDate.toISOString() : null,
      description: w.description,
    })),
  };
}

// ============ 公开 API ============

/**
 * 给指定候选人-职位组合打分；hash 命中时直接返回旧记录（不调 LLM）；
 * 打分结果写入 AiMatchScore（candidateId_jobId 唯一键走 upsert 幂等覆盖）。
 * 失败抛 AppError（500），不静默吞错。
 */
export async function scoreCandidateForJob(
  candidateId: string,
  jobId: string,
  opts: ScoreCandidateOptions,
): Promise<ScoreResult> {
  // 1. 拉取候选人与职位（任一不存在 404）
  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { workHistories: true },
    }),
    prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        level: true,
        type: true,
        description: true,
        requirements: true,
        skills: true,
      },
    }),
  ]);
  if (!candidate) throw new AppError('候选人不存在', 404);
  if (!job) throw new AppError('职位不存在', 404);

  // 2. 内容 hash
  const candidatePayload = buildCandidatePayload(candidate);
  const resumeHash = computeResumeHash(candidatePayload);
  const jdHash = computeJdHash(job.description, job.requirements);

  // 3. hash 去重：同 candidate+job 且 resumeHash/jdHash 均未变 → 直接复用旧记录
  const existing = await prisma.aiMatchScore.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
  });
  if (
    existing
    && existing.resumeHash === resumeHash
    && existing.jdHash === jdHash
  ) {
    await prisma.operationLog.create({
      data: {
        userId: opts.createdById || candidate.createdById || 'system',
        targetType: 'Candidate',
        targetId: candidateId,
        action: 'ai_match_score',
        detail: {
          jobId,
          triggeredBy: opts.triggeredBy,
          deduped: true,
          existingId: existing.id,
        },
      },
    });
    return toScoreResult(existing);
  }

  // 4. 字典维度 + 权重
  const weights = await loadDimensions();

  // 5. 组 prompt
  const systemPrompt = `你是一位资深招聘评估专家。请根据「职位 JD」与「候选人简历结构化信息」打分。
输出要求：
- 仅返回 JSON，不要任何额外文字。
- 每维度给出 0-100 的整数分；不确定时给出 0 并在 comment 中说明。
- 不要给出 overallScore 与 grade（综合分与等级由服务端重算）。
- 不要在 summary/highlights/risks/comment 中回显候选人手机号、邮箱等个人敏感联系方式（与评估无关，不要引用）。`;

  const userPrompt = `职位信息：
- 标题：${job.title}
- 职级：${job.level || '未指定'}
- 类型：${job.type}
- 描述：${job.description || ''}
- 要求：${job.requirements || ''}
- 技能：${Array.isArray(job.skills) ? job.skills.join(', ') : ''}

候选人信息：
${JSON.stringify(candidatePayload, null, 2)}

请按以下维度（带权重）逐项打分：
${weights.map((w) => `- ${w.name}（code: ${w.code}, weight: ${w.weight}%）`).join('\n')}

返回 JSON：
{
  "dimensions": [
    {"code": "<维度 code>", "name": "<维度名称>", "score": 0-100, "comment": "简要说明"}
  ],
  "summary": "总体评价（3-5 句）",
  "highlights": ["亮点 1", "亮点 2"],
  "risks": ["风险 1", "风险 2"]
}`;

  // 6. 调 LLM
  let parsed: ParsedLLMResponse;
  try {
    parsed = await callLLMForScore(systemPrompt, userPrompt);
  } catch (err) {
    // 写失败 OperationLog 后抛 AppError，由 controller 决定返回 500
    await prisma.operationLog.create({
      data: {
        userId: opts.createdById || candidate.createdById || 'system',
        targetType: 'Candidate',
        targetId: candidateId,
        action: 'ai_match_score',
        detail: {
          jobId,
          triggeredBy: opts.triggeredBy,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    });
    throw new AppError('AI 打分失败，请稍后重试', 500);
  }

  // 7. 服务端重算 + upsert
  const { dimensions, totalScore } = mergeScores(parsed.dimensions, weights);
  const grade = gradeFromScore(totalScore);

  const upserted = await prisma.aiMatchScore.upsert({
    where: { candidateId_jobId: { candidateId, jobId } },
    create: {
      candidateId,
      jobId,
      overallScore: totalScore,
      grade,
      summary: parsed.summary ?? null,
      dimensions: dimensions as unknown as Prisma.InputJsonValue,
      risks: (parsed.risks ?? null) as unknown as Prisma.InputJsonValue,
      highlights: (parsed.highlights ?? null) as unknown as Prisma.InputJsonValue,
      stale: false,
      model: env.LLM_PROVIDER,
      promptVersion: 'v1',
      triggeredBy: opts.triggeredBy,
      createdById: opts.createdById ?? null,
      resumeHash,
      jdHash,
    },
    update: {
      overallScore: totalScore,
      grade,
      summary: parsed.summary ?? null,
      dimensions: dimensions as unknown as Prisma.InputJsonValue,
      risks: (parsed.risks ?? null) as unknown as Prisma.InputJsonValue,
      highlights: (parsed.highlights ?? null) as unknown as Prisma.InputJsonValue,
      stale: false,
      model: env.LLM_PROVIDER,
      triggeredBy: opts.triggeredBy,
      createdById: opts.createdById ?? null,
      resumeHash,
      jdHash,
    },
  });

  // 8. 成功 OperationLog
  await prisma.operationLog.create({
    data: {
      userId: opts.createdById || candidate.createdById || 'system',
      targetType: 'Candidate',
      targetId: candidateId,
      action: 'ai_match_score',
      detail: {
        jobId,
        triggeredBy: opts.triggeredBy,
        overallScore: totalScore,
        grade,
      },
    },
  });

  return toScoreResult(upserted);
}

/** 候选人全部职位的打分列表（含职位标题），按更新时间倒序 */
export async function listCandidateMatchScores(
  candidateId: string,
  scope?: CandidateVisibilityScope,
): Promise<Array<ScoreResult & { jobTitle: string }>> {
  await assertCandidateVisible(candidateId, scope);

  const rows = await prisma.aiMatchScore.findMany({
    where: { candidateId },
    orderBy: { updatedAt: 'desc' },
    include: { job: { select: { title: true } } },
  });
  return rows.map((r) => ({ ...toScoreResult(r), jobTitle: r.job.title }));
}

/**
 * 职位下候选人打分列表（按综合分降序）。
 * 数据可见性：admin 全量；member 仅当职位部门包含 scope.department 时可见，否则 403。
 */
export async function listJobMatchScores(
  jobId: string,
  scope?: CandidateVisibilityScope,
): Promise<Array<ScoreResult & { candidateName: string }>> {
  if (!scope) {
    throw new AppError('需要登录上下文', 401);
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, departments: true },
  });
  if (!job) throw new AppError('职位不存在', 404);

  if (!scope.isAdmin) {
    if (!scope.department) {
      throw new AppError('无权访问该职位的打分', 403);
    }
    const departments = Array.isArray(job.departments)
      ? (job.departments as string[])
      : [];
    if (!departments.includes(scope.department)) {
      throw new AppError('无权访问该职位的打分', 403);
    }
  }

  const rows = await prisma.aiMatchScore.findMany({
    where: { jobId },
    orderBy: { overallScore: 'desc' },
    include: { candidate: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...toScoreResult(r), candidateName: r.candidate.name }));
}

/** Prisma 行 → 返回给 controller 的统一结构 */
function toScoreResult(row: {
  id: string;
  candidateId: string;
  jobId: string;
  overallScore: number;
  grade: string;
  summary: string | null;
  dimensions: Prisma.JsonValue;
  risks: Prisma.JsonValue | null;
  highlights: Prisma.JsonValue | null;
  stale: boolean;
  triggeredBy: string;
  createdAt: Date;
  updatedAt: Date;
}): ScoreResult {
  const dims = Array.isArray(row.dimensions)
    ? (row.dimensions as unknown as MatchDimensionOutput[])
    : [];
  const risks = Array.isArray(row.risks) ? (row.risks as unknown as string[]) : null;
  const highlights = Array.isArray(row.highlights)
    ? (row.highlights as unknown as string[])
    : null;
  return {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    overallScore: row.overallScore,
    grade: row.grade,
    summary: row.summary,
    dimensions: dims,
    risks,
    highlights,
    stale: row.stale,
    triggeredBy: row.triggeredBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
