import type { Prisma } from '@prisma/client';

import { callLLM } from '../lib/llm';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import {
  assertCandidateVisible,
  type CandidateVisibilityScope,
} from './candidate-visibility.service';
import { dictionaryService } from './dictionary.service';

// ============ 常量 ============

/** 面试问题大纲版本上限（PRD 阶段 5 §5.5） */
export const MAX_OUTLINE_VERSIONS = 10;

/** LLM 失败重试次数（不计首调；与 match-score / jd-assist 一致） */
const LLM_RETRY_TIMES = 1;

/** 字典分类：面试考察方向（F3-S 新增；侧重指引放在本文件 FOCUS_TYPE_GUIDANCE 常量，不入字典） */
const FOCUS_TYPE_CATEGORY = 'interview_focus_type';

/**
 * 五大考察方向出题侧重（PRD 阶段 5 §5.3）。
 * 字典只配方向名称与启停用，侧重指引写死在 prompt 常量里。
 * admin 自定义的新方向（字典有但未在此列）→ 在 prompt 中注明「按方向名称自行把握侧重」。
 */
export const FOCUS_TYPE_GUIDANCE: Record<string, string> = {
  hr: '侧重考察：求职动机、职业稳定性、薪资期望、文化匹配、离职原因。',
  tech: '侧重考察：专业技能深度、项目技术细节、问题解决思路、行业体系标准（如 GJB9001C 等）实操。',
  comprehensive: '侧重考察：项目复盘、抗压应变、跨部门协作、职业规划。',
  manager: '侧重考察：管理思维、目标拆解、团队匹配、价值观。',
  cross: '侧重考察：协作场景、沟通风格、上下游配合。',
};

// ============ 类型 ============

/** 单道面试题（含参考答案与追问建议） */
export interface OutlineQuestion {
  question: string;
  intent: string;
  referenceAnswer: string;
  followUp?: string;
}

/** 单个 section（按 theme 分组） */
export interface OutlineSection {
  theme: string;
  questions: OutlineQuestion[];
}

/** LLM 输出与服务端校验的统一结构 */
export interface InterviewOutlinePayload {
  sections: OutlineSection[];
  durationAdvice?: string;
}

/** 对外返回的大纲行（含创建人姓名） */
export interface OutlineRecord {
  id: string;
  interviewId: string;
  version: number;
  focusType: string;
  outline: InterviewOutlinePayload;
  adjustNote: string | null;
  editedById: string | null;
  editedByName: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

export interface GenerateOutlineInput {
  focusType: string;
  adjustNote?: string;
}

export interface OutlineUser {
  userId: string;
  role: string;
  department: string | null;
}

// ============ 工具函数 ============

/** 从 LLM 返回的 JSON 中剥掉 ```json 围栏（与 match-score / jd-assist 同款） */
function stripJsonFence(text: string): string {
  let s = text.trim();
  if (s.startsWith('```json')) s = s.slice(7);
  if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  return s.trim();
}

/**
 * 结构校验：sections 非空数组，每项含 theme + 非空 questions，每个 question 含
 * question/intent/referenceAnswer 三个非空字符串。校验失败返回 null 触发重试。
 */
function validateOutline(parsed: unknown): InterviewOutlinePayload | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : null;
  if (!sectionsRaw || sectionsRaw.length === 0) return null;

  const sections: OutlineSection[] = [];
  for (const s of sectionsRaw) {
    if (!s || typeof s !== 'object') return null;
    const sectObj = s as Record<string, unknown>;
    const theme = typeof sectObj.theme === 'string' ? sectObj.theme.trim() : '';
    if (!theme) return null;
    const qsRaw = Array.isArray(sectObj.questions) ? sectObj.questions : null;
    if (!qsRaw || qsRaw.length === 0) return null;

    const questions: OutlineQuestion[] = [];
    for (const q of qsRaw) {
      if (!q || typeof q !== 'object') return null;
      const qObj = q as Record<string, unknown>;
      const question = typeof qObj.question === 'string' ? qObj.question.trim() : '';
      const intent = typeof qObj.intent === 'string' ? qObj.intent.trim() : '';
      const referenceAnswer =
        typeof qObj.referenceAnswer === 'string' ? qObj.referenceAnswer.trim() : '';
      if (!question || !intent || !referenceAnswer) return null;
      const followUp =
        typeof qObj.followUp === 'string' && qObj.followUp.trim()
          ? qObj.followUp.trim()
          : undefined;
      questions.push({ question, intent, referenceAnswer, followUp });
    }
    sections.push({ theme, questions });
  }

  const durationAdvice =
    typeof obj.durationAdvice === 'string' && obj.durationAdvice.trim()
      ? obj.durationAdvice.trim()
      : undefined;

  return { sections, durationAdvice };
}

/**
 * 调 LLM 并解析。失败时按 LLM_RETRY_TIMES 重试，仍失败返回 null（由调用方抛 500）。
 * 与 jd-assist 同款：parse 失败与结构不合格均触发重试（PRD §10）。
 */
async function callLLMForOutline(
  systemPrompt: string,
  userPrompt: string,
): Promise<InterviewOutlinePayload | null> {
  let lastErr: unknown = null;
  for (let i = 0; i <= LLM_RETRY_TIMES; i += 1) {
    try {
      const res = await callLLM(userPrompt, systemPrompt, 'interview-outline');
      const jsonStr = stripJsonFence(res.content);
      const parsed = JSON.parse(jsonStr);
      const validated = validateOutline(parsed);
      if (validated) return validated;
      lastErr = new Error('LLM 输出结构校验未通过');
      if (i === LLM_RETRY_TIMES) break;
    } catch (err) {
      lastErr = err;
      if (i === LLM_RETRY_TIMES) break;
    }
  }
  // eslint-disable-next-line no-console
  console.warn('[interview-outline] LLM 调用失败：', lastErr);
  return null;
}

/** 富文本截纯文本摘要（InterviewFeedback.feedbackContent 为富文本，仅取前 N 字） */
function stripHtmlSnippet(html: string | null | undefined, max = 500): string {
  if (!html) return '';
  // 去掉常见 HTML 标签，保留文本
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 单字段截断（防 token 爆；中英混排按字符截，对 LLM 输入够用） */
function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 操作日志写入（与 match-score.service 风格一致；detail 字段全部 JSON） */
async function writeLog(args: {
  userId: string;
  action: string;
  detail: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId: args.userId,
        targetType: 'Interview',
        // 失败日志也可能没 version；先暂存面试 ID，version 已知时由 detail 体现
        targetId: (args.detail.interviewId as string) || 'unknown',
        action: args.action,
        detail: args.detail as object,
      },
    });
  } catch (err) {
    // 日志失败不影响主流程（与 jd-assist 一致）
    // eslint-disable-next-line no-console
    console.warn('[interview-outline] OperationLog write failed:', err);
  }
}

// ============ 权限精细校验 ============

/**
 * 按角色做精细权限校验（PRD §3.2）：
 * - admin 直通
 * - hr 通过 assertCandidateVisible 走候选人可见性
 * - hiring_manager / interviewer 必须是该场面试的面试官（按 interviewers JSON 中 id 比对）
 */
async function assertOutlineAccess(
  interview: {
    candidateId: string;
    interviewers: Prisma.JsonValue;
  },
  user: OutlineUser,
  scope?: CandidateVisibilityScope,
): Promise<void> {
  if (user.role === 'admin') return;
  if (user.role === 'hr' || user.role === 'member') {
    await assertCandidateVisible(interview.candidateId, scope);
    return;
  }
  // hiring_manager / interviewer：必须是该场面试官
  const list = Array.isArray(interview.interviewers)
    ? (interview.interviewers as Array<{ id?: string }>)
    : [];
  const isInterviewer = list.some((i) => typeof i.id === 'string' && i.id === user.userId);
  if (!isInterviewer) {
    throw new AppError('仅该场面试的面试官可操作面试大纲', 403);
  }
}

/**
 * 共享 focusType 字典校验（createInterview / updateInterview 也复用）：
 * focusType 可选，未提供则放行；提供则必须是字典 enabled 项，否则 400。
 * 抛出错误信息附带可选项列表。
 */
export async function assertFocusTypeValid(focusType: string | undefined | null): Promise<void> {
  if (focusType === undefined || focusType === null || focusType === '') return;
  const items = await dictionaryService.getDictionaries(FOCUS_TYPE_CATEGORY);
  const available = items.map((i) => `${i.name}(${i.code})`).join('、') || '（空）';
  const ok = items.some((it) => it.code === focusType);
  if (!ok) {
    throw new AppError(`考察方向无效，可选：${available}`, 400);
  }
}

// ============ 公开 API ============

/**
 * 生成/再生成大纲（同步：前端 loading 锁防重复点击由 F3-C 负责）。
 * 已有版本数 ≥ MAX_OUTLINE_VERSIONS → 400；LLM 重试 1 次仍失败 → 500。
 */
export async function generateOutline(
  interviewId: string,
  input: GenerateOutlineInput,
  user: OutlineUser,
  scope?: CandidateVisibilityScope,
): Promise<OutlineRecord> {
  // 1. 必填校验
  const focusType = (input.focusType || '').trim();
  if (!focusType) {
    throw new AppError('focusType 必填', 400);
  }
  const adjustNote = input.adjustNote?.trim() || undefined;

  // 2. 字典校验（focusType 必须为 enabled 项，否则 400 附可选项）
  await assertFocusTypeValid(focusType);

  // 3. 拉取面试（含 candidate / job / interviewers JSON）
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          skills: true,
          workYears: true,
          education: true,
          school: true,
          currentCompany: true,
          currentPosition: true,
          workHistories: true,
        },
      },
      job: {
        select: { id: true, title: true, level: true, type: true, description: true, requirements: true },
      },
    },
  });
  if (!interview) {
    throw new AppError('面试安排不存在', 404);
  }

  // 4. 权限精细校验（PRD §3.2）
  await assertOutlineAccess(interview, user, scope);

  // 5. 版本上限校验
  const existingCount = await prisma.interviewQuestionOutline.count({
    where: { interviewId },
  });
  if (existingCount >= MAX_OUTLINE_VERSIONS) {
    throw new AppError(`版本数已达上限（${MAX_OUTLINE_VERSIONS}），无法继续生成`, 400);
  }

  // 6. 输入组装
  const candidatePayload = {
    name: interview.candidate.name,
    skills: Array.isArray(interview.candidate.skills)
      ? (interview.candidate.skills as unknown[])
      : [],
    workYears: interview.candidate.workYears,
    education: interview.candidate.education,
    school: interview.candidate.school,
    currentCompany: interview.candidate.currentCompany,
    currentPosition: interview.candidate.currentPosition,
    workHistories: interview.candidate.workHistories.map((w) => ({
      company: w.company,
      position: w.position,
      startDate: w.startDate ? w.startDate.toISOString() : null,
      endDate: w.endDate ? w.endDate.toISOString() : null,
      description: w.description,
    })),
  };

  const jobBlock = interview.job
    ? `职位信息：
- 标题：${interview.job.title}
- 职级：${interview.job.level || '未指定'}
- 类型：${interview.job.type}
- 描述：${truncate(interview.job.description, 1500)}
- 要求：${truncate(interview.job.requirements, 1500)}`
    : '职位信息：未关联职位（请按面试轮次与候选人背景自由出题）';

  // 前几轮反馈：同 candidateId 其他面试中 scheduledAt 早于本场 → 取已提交 InterviewEvaluation 摘要
  // + InterviewFeedback（取 conclusion + feedbackContent 纯文本截断 500 字）
  const [earlierEvaluations, earlierFeedbacks] = await Promise.all([
    prisma.interviewEvaluation.findMany({
      where: {
        submittedAt: { not: null },
        interview: {
          candidateId: interview.candidateId,
          scheduledAt: { lt: interview.scheduledAt },
        },
      },
      orderBy: { submittedAt: 'asc' },
      include: {
        interviewer: { select: { name: true } },
        interview: { select: { round: true, scheduledAt: true } },
      },
    }),
    prisma.interviewFeedback.findMany({
      where: {
        candidateId: interview.candidateId,
        interviewTime: { lt: interview.scheduledAt },
      },
      orderBy: { interviewTime: 'asc' },
    }),
  ]);

  const evalBlock =
    earlierEvaluations.length > 0
      ? `\n前几轮面试评估（已提交）：\n${earlierEvaluations
          .map((e, idx) => {
            const dims = Array.isArray(e.dimensions) ? (e.dimensions as unknown[]) : [];
            const dimSummary = dims
              .map((d) => {
                const item = d as Record<string, unknown>;
                const name = typeof item.name === 'string' ? item.name : '';
                const score = typeof item.score === 'number' ? item.score : null;
                return score !== null ? `${name}=${score}` : name;
              })
              .filter(Boolean)
              .join('、');
            return `[${idx + 1}] ${e.interview.round} 面试官 ${e.interviewer.name} 综合分=${e.overallScore ?? 'N/A'} 结论=${e.conclusion ?? 'N/A'} 维度=${dimSummary || '-'}`;
          })
          .join('\n')}\n`
      : '';

  const feedbackBlock =
    earlierFeedbacks.length > 0
      ? `\n前几轮面试反馈：\n${earlierFeedbacks
          .map(
            (f, idx) =>
              `[${idx + 1}] ${f.round} 面试官 ${f.interviewerName} 结论=${f.conclusion}\n${stripHtmlSnippet(f.feedbackContent, 500)}`
          )
          .join('\n\n')}\n`
      : '';

  const historyBlock =
    evalBlock || feedbackBlock
      ? `${evalBlock}${feedbackBlock}`
      : '\n历史反馈：首轮面试，无历史反馈。\n';

  // AiMatchScore（可选输入）
  let matchScoreBlock = '';
  if (interview.jobId) {
    const match = await prisma.aiMatchScore.findUnique({
      where: { candidateId_jobId: { candidateId: interview.candidateId, jobId: interview.jobId } },
      select: { overallScore: true, grade: true, summary: true },
    });
    if (match) {
      matchScoreBlock = `\n简历-JD 匹配打分（参考）：综合分=${match.overallScore} 等级=${match.grade}\n摘要：${truncate(match.summary ?? '', 500)}\n`;
    }
  }

  // 考察方向 + 侧重指引（字典有则用常量指引；无则按方向名自行把握）
  const guidance = FOCUS_TYPE_GUIDANCE[focusType];
  const focusBlock = guidance
    ? `考察方向：${focusType}\n出题侧重：${guidance}`
    : `考察方向：${focusType}\n出题侧重：按方向名称自行把握侧重，覆盖与本方向相关的核心能力即可。`;

  // 调整指令模式：附上一版 outline 与指令，要求整体再生成
  let previousBlock = '';
  if (adjustNote) {
    const prev = await prisma.interviewQuestionOutline.findFirst({
      where: { interviewId },
      orderBy: { version: 'desc' },
    });
    if (prev) {
      previousBlock = `\n上一版大纲（version=${prev.version}，focusType=${prev.focusType}）：\n${JSON.stringify(prev.outline, null, 2)}\n\n调整指令：${adjustNote}\n请基于上一版按指令整体再生成（不要无脑重写相同题目）。\n`;
    } else {
      previousBlock = `\n调整指令：${adjustNote}\n（未找到上一版大纲，请按指令生成首版）\n`;
    }
  }

  const systemPrompt = `你是一位资深面试官。请根据「候选人背景 + 职位信息 + 历史反馈 + 考察方向」设计一场高质量的面试问题大纲。
- 仅返回 JSON，不要任何额外文字。
- outline.sections 是有序的主题分组（按考察优先级排列）。
- 每个 section 至少包含 2 道 question；每道 question 含 question / intent / referenceAnswer / 可选 followUp。
- intent 写明考察意图；referenceAnswer 是参考答案要点（不是完整答案，给出关键判断标准与加分点即可）；followUp 是候选人答得模糊时的追问。
- durationAdvice 用一句话给出整场的时间分配建议。`;

  const userPrompt = `${jobBlock}

候选人信息：
${JSON.stringify(candidatePayload, null, 2)}

本场面试信息：
- 轮次：${interview.round}
- 形式：${interview.type}
- 时长：${interview.duration} 分钟

${historyBlock}${matchScoreBlock}
${focusBlock}
${previousBlock}
请返回 JSON：
{
  "sections": [
    {
      "theme": "主题（例如：求职动机与稳定性）",
      "questions": [
        {
          "question": "具体问题",
          "intent": "考察意图",
          "referenceAnswer": "参考答案要点",
          "followUp": "可选追问"
        }
      ]
    }
  ],
  "durationAdvice": "一句话时间分配建议（可选）"
}`;

  // 7. 调 LLM（parse 失败与结构不合格各重试 1 次）
  const validated = await callLLMForOutline(systemPrompt, userPrompt);

  if (!validated) {
    await writeLog({
      userId: user.userId,
      action: 'ai_question_outline',
      detail: {
        interviewId,
        focusType,
        adjustNote: adjustNote ?? null,
        success: false,
        error: 'LLM 调用或 JSON 格式校验失败',
      },
    });
    throw new AppError('AI 大纲生成失败，请稍后重试', 500);
  }

  // 8. 落库新版本（version = max + 1）
  const latest = await prisma.interviewQuestionOutline.findFirst({
    where: { interviewId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version || 0) + 1;

  const created = await prisma.interviewQuestionOutline.create({
    data: {
      interviewId,
      version: nextVersion,
      focusType,
      outline: validated as unknown as Prisma.InputJsonValue,
      adjustNote: adjustNote ?? null,
      editedById: null,
      createdById: user.userId,
    },
  });

  // 9. 成功 OperationLog
  await writeLog({
    userId: user.userId,
    action: 'ai_question_outline',
    detail: {
      interviewId,
      version: nextVersion,
      focusType,
      adjustNote: adjustNote ?? null,
      success: true,
      sectionCount: validated.sections.length,
      questionCount: validated.sections.reduce((acc, s) => acc + s.questions.length, 0),
    },
  });

  return toOutlineRecord(created, user);
}

/** 列出该面试的全部大纲版本（version 降序） */
export async function listOutlines(
  interviewId: string,
  user: OutlineUser,
  scope?: CandidateVisibilityScope,
): Promise<OutlineRecord[]> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { id: true, candidateId: true, interviewers: true },
  });
  if (!interview) {
    throw new AppError('面试安排不存在', 404);
  }

  // 权限精细校验
  await assertOutlineAccess(interview, user, scope);

  const rows = await prisma.interviewQuestionOutline.findMany({
    where: { interviewId },
    orderBy: { version: 'desc' },
  });

  // 收集 createdById / editedById，一次性 join User 取姓名
  const userIds = new Set<string>();
  for (const r of rows) {
    userIds.add(r.createdById);
    if (r.editedById) userIds.add(r.editedById);
  }
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, name: true },
      })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    interviewId: r.interviewId,
    version: r.version,
    focusType: r.focusType,
    outline: r.outline as unknown as InterviewOutlinePayload,
    adjustNote: r.adjustNote,
    editedById: r.editedById,
    editedByName: r.editedById ? nameMap.get(r.editedById) ?? null : null,
    createdById: r.createdById,
    createdByName: nameMap.get(r.createdById) ?? null,
    createdAt: r.createdAt,
  }));
}

/**
 * 手动微调定稿（不调 LLM）：服务端校验 outline 结构后覆盖该版本 + 写入 editedById。
 */
export async function finalizeOutline(
  interviewId: string,
  version: number,
  outline: unknown,
  user: OutlineUser,
  scope?: CandidateVisibilityScope,
): Promise<OutlineRecord> {
  // 服务端结构校验（与生成时同一规则）
  const validated = validateOutline(outline);
  if (!validated) {
    throw new AppError('outline 结构校验未通过：sections 非空、含 theme 与 questions；每题必须含 question/intent/referenceAnswer', 400);
  }

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { id: true, candidateId: true, interviewers: true },
  });
  if (!interview) {
    throw new AppError('面试安排不存在', 404);
  }
  await assertOutlineAccess(interview, user, scope);

  const existing = await prisma.interviewQuestionOutline.findUnique({
    where: { interviewId_version: { interviewId, version } },
  });
  if (!existing) {
    throw new AppError('大纲版本不存在', 404);
  }

  const updated = await prisma.interviewQuestionOutline.update({
    where: { interviewId_version: { interviewId, version } },
    data: {
      outline: validated as unknown as Prisma.InputJsonValue,
      editedById: user.userId,
    },
  });

  await writeLog({
    userId: user.userId,
    action: 'question_outline_edit',
    detail: {
      interviewId,
      version,
      editedById: user.userId,
      sectionCount: validated.sections.length,
      questionCount: validated.sections.reduce((acc, s) => acc + s.questions.length, 0),
    },
  });

  return toOutlineRecord(updated, user);
}

// ============ 内部工具 ============

/** Prisma 行 → 对外结构（含当前操作人姓名查回，避免重复 join） */
function toOutlineRecord(
  row: {
    id: string;
    interviewId: string;
    version: number;
    focusType: string;
    outline: Prisma.JsonValue;
    adjustNote: string | null;
    editedById: string | null;
    createdById: string;
    createdAt: Date;
  },
  _user: OutlineUser,
): OutlineRecord {
  return {
    id: row.id,
    interviewId: row.interviewId,
    version: row.version,
    focusType: row.focusType,
    outline: row.outline as unknown as InterviewOutlinePayload,
    adjustNote: row.adjustNote,
    editedById: row.editedById,
    // 创建人姓名由 listOutlines 一次性 join 后填充；这里写 null 由 controller 兜底展示
    editedByName: null,
    createdById: row.createdById,
    createdByName: null,
    createdAt: row.createdAt,
  };
}