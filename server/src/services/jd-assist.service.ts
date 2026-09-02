import { callLLM } from '../lib/llm';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// ============ 常量 ============

/** LLM 失败重试次数（不计首调；与 match-score.service 一致） */
const LLM_RETRY_TIMES = 1;

/** 参考 JD 字段截断长度（每份 description / requirements 截断，防止 token 爆） */
const REFERENCE_JD_FIELD_MAX = 1500;

/** 参考 JD 数量（同 type 最近 N 份非关闭职位） */
const REFERENCE_JD_LIMIT = 3;

// ============ 类型 ============

export interface PolishJdInput {
  jdText: string;
  meta?: {
    title?: string;
    level?: string;
    departments?: string[];
    type?: string;
  };
}

export interface PolishJdIssue {
  title: string;
  detail: string;
  severity: '高' | '中' | '低';
}

export interface PolishJdResult {
  issues: PolishJdIssue[];
  improvedJd: string;
}

export interface DraftJdInput {
  title: string;
  departments: string[];
  level: string;
  type: string;
  freeText?: string;
}

export interface DraftJdResult {
  draftJd: string;
}

// ============ 工具函数 ============

/** 从 LLM 返回的 JSON 中剥掉 ```json 围栏（与 match-score.service 同款） */
function stripJsonFence(text: string): string {
  let s = text.trim();
  if (s.startsWith('```json')) s = s.slice(7);
  if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  return s.trim();
}

/** 结构校验 + 必要字段归一化（LLM 输出容错：issues/title/detail 缺字段时补空串 / 截断） */
function normalizePolish(parsed: unknown): PolishJdResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const improvedJd = typeof obj.improvedJd === 'string' ? obj.improvedJd.trim() : '';
  if (!improvedJd) return null;

  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: PolishJdIssue[] = rawIssues
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => {
      const sev = it.severity;
      // severity 兜底：合法三选一，否则默认 '中'
      let normalized: PolishJdIssue['severity'] = '中';
      if (sev === '高' || sev === '中' || sev === '低') normalized = sev;
      return {
        title: typeof it.title === 'string' ? it.title : '',
        detail: typeof it.detail === 'string' ? it.detail : '',
        severity: normalized,
      };
    });

  return { issues, improvedJd };
}

/** draft 结果校验（improvedJd/draftJd 字段名兼容，但 prompt 明确要求 draftJd） */
function normalizeDraft(parsed: unknown): DraftJdResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const draftJd = typeof obj.draftJd === 'string' ? obj.draftJd.trim() : '';
  if (!draftJd) return null;
  return { draftJd };
}

/**
 * 调 LLM 并解析。失败重试 1 次；仍失败返回 null（由调用方决定抛 500）。
 * 复用 match-score.service 的重试模式，但本切片对「JSON 格式异常」不抛 AppError，
 * 而是返回 null 让上层统一抛「AI 返回格式异常，请重试」（PRD §4.4）。
 */
async function callLLMForJson(
  systemPrompt: string,
  userPrompt: string,
  purpose: 'jd-polish' | 'jd-draft',
  // 结构校验器：返回 null/假值 视为输出不合格，与 parse 失败同等触发重试（PRD §10 异常输出重试 1 次）
  validateOutput?: (parsed: unknown) => unknown
): Promise<unknown> {
  let lastErr: unknown = null;
  for (let i = 0; i <= LLM_RETRY_TIMES; i += 1) {
    try {
      const res = await callLLM(userPrompt, systemPrompt, purpose);
      const jsonStr = stripJsonFence(res.content);
      const parsed = JSON.parse(jsonStr);
      // 结构不合格（如缺 improvedJd）也重试一次，不直接放弃
      if (validateOutput && !validateOutput(parsed)) {
        lastErr = new Error('LLM 输出结构校验未通过');
        if (i === LLM_RETRY_TIMES) break;
        continue;
      }
      return parsed;
    } catch (err) {
      lastErr = err;
      if (i === LLM_RETRY_TIMES) break;
    }
  }
  // eslint-disable-next-line no-console
  console.warn(`[jd-assist] LLM 调用失败（purpose=${purpose}）:`, lastErr);
  return null;
}

/** 单字段截断（中英混排按字符截，对 LLM 输入够用） */
function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 写 OperationLog（成功 / 失败统一留痕；detail 不含 JD 全文） */
async function writeOperationLog(args: {
  userId: string;
  purpose: 'jd-polish' | 'jd-draft';
  detail: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId: args.userId,
        targetType: 'Job',
        // polish / draft 均无 jobId，固定填 'new'
        targetId: 'new',
        action: args.purpose === 'jd-polish' ? 'ai_jd_polish' : 'ai_jd_draft',
        detail: args.detail as object,
      },
    });
  } catch (err) {
    // 日志失败不影响主流程
    // eslint-disable-next-line no-console
    console.warn('[jd-assist] OperationLog write failed:', err);
  }
}

// ============ 公开 API ============

/**
 * JD 诊断 + 优化稿生成（PRD §4.4）
 * - 不落库（PRD §4.4）：仅返回结构化诊断 + 优化稿，由前端写入职位表单
 * - 失败/重试：LLM 输出不合法时重试 1 次，仍不合法抛 AppError 500
 * - 审计：无论成功失败均写 OperationLog
 */
export async function polishJd(input: PolishJdInput, userId: string): Promise<PolishJdResult> {
  const jdText = (input.jdText || '').trim();
  if (!jdText) {
    await writeOperationLog({
      userId,
      purpose: 'jd-polish',
      detail: { success: false, error: 'jdText 为空', jdLength: 0 },
    });
    throw new AppError('JD 内容不能为空', 400);
  }

  const meta = input.meta || {};
  const metaLines: string[] = [];
  if (meta.title) metaLines.push(`- 职位名称：${meta.title}`);
  if (meta.level) metaLines.push(`- 职级：${meta.level}`);
  if (meta.departments && meta.departments.length > 0) {
    metaLines.push(`- 部门：${meta.departments.join('、')}`);
  }
  if (meta.type) metaLines.push(`- 类型：${meta.type}`);
  const metaBlock = metaLines.length > 0 ? `\n职位元信息：\n${metaLines.join('\n')}\n` : '';

  const systemPrompt = `你是一位资深招聘 JD 顾问。请基于用户提供的 JD 文本，给出诊断问题清单与完整优化稿。
- 仅返回 JSON，不要任何额外文字。
- issues 元素给出 title（问题概述）、detail（具体说明）、severity（高/中/低）。
- improvedJd 必须是完整可发布的 JD 文本（保留原意，补全缺失模块，如岗位职责 / 任职要求 / 加分项）。`;

  const userPrompt = `当前 JD 全文：${metaBlock}
${jdText}

请返回 JSON：
{
  "issues": [
    {"title": "...", "detail": "...", "severity": "高|中|低"}
  ],
  "improvedJd": "完整优化稿（Markdown 风格，含岗位职责 / 任职要求 / 加分项 等模块）"
}`;

  // callLLMForJson 内部已对 parse 失败与结构不合格各重试 1 次；返回 null 即两次均失败
  const parsed = await callLLMForJson(systemPrompt, userPrompt, 'jd-polish', normalizePolish);

  const result = parsed ? normalizePolish(parsed) : null;
  if (!result) {
    await writeOperationLog({
      userId,
      purpose: 'jd-polish',
      detail: { success: false, error: 'LLM 调用或 JSON 格式校验失败', jdLength: jdText.length },
    });
    throw new AppError('AI 返回格式异常，请重试', 500);
  }

  await writeOperationLog({
    userId,
    purpose: 'jd-polish',
    detail: {
      success: true,
      jdLength: jdText.length,
      issueCount: result.issues.length,
    },
  });

  return result;
}

/**
 * JD 草稿生成（PRD §4.4 / §4.5）
 * - 不落库：仅返回草稿文本，由前端写入职位表单
 * - 风格参考：取同 type 最近 3 份非关闭职位的 description + requirements
 * - 必填校验：title / departments / level / type 缺一抛 400（路由 zod 已挡一道，service 再兜底）
 */
export async function draftJd(input: DraftJdInput, userId: string): Promise<DraftJdResult> {
  const title = (input.title || '').trim();
  const departments = Array.isArray(input.departments) ? input.departments.filter(Boolean) : [];
  const level = (input.level || '').trim();
  const type = (input.type || '').trim();
  const freeText = (input.freeText || '').trim();

  if (!title || departments.length === 0 || !level || !type) {
    await writeOperationLog({
      userId,
      purpose: 'jd-draft',
      detail: { success: false, error: '必填字段缺失', title: title || null },
    });
    throw new AppError('缺少必填字段：title / departments / level / type', 400);
  }

  // 同 type 最近 N 份非关闭职位作为风格参考（PRD §4.5）
  const references = await prisma.job.findMany({
    where: { type, status: { not: 'closed' } },
    orderBy: { createdAt: 'desc' },
    take: REFERENCE_JD_LIMIT,
    select: { title: true, description: true, requirements: true },
  });

  // 截断防 token 爆
  const refBlock =
    references.length > 0
      ? `\n参考 JD（最近 ${references.length} 份同类型职位，已截断每段 ${REFERENCE_JD_FIELD_MAX} 字）：\n${references
          .map(
            (r, idx) =>
              `[${idx + 1}] ${r.title}\n- 描述：${truncate(r.description, REFERENCE_JD_FIELD_MAX)}\n- 要求：${truncate(r.requirements, REFERENCE_JD_FIELD_MAX)}`
          )
          .join('\n\n')}\n`
      : '';

  const freeTextBlock = freeText ? `\n补充说明：\n${freeText}\n` : '';

  const systemPrompt = `你是一位资深招聘 JD 撰稿人。请根据职位信息 + 可选补充 + 同类历史 JD 风格，撰写一份高质量 JD 草稿。
- 仅返回 JSON，不要任何额外文字。
- 草稿必须包含三段结构：「岗位职责 / 任职要求 / 加分项」。
- 草稿用 Markdown 风格排版，便于 HR 直接复制。`;

  const userPrompt = `职位信息：
- 标题：${title}
- 部门：${departments.join('、')}
- 职级：${level}
- 类型：${type}${freeTextBlock}${refBlock}

请返回 JSON：
{
  "draftJd": "完整 JD 草稿（含「## 岗位职责」「## 任职要求」「## 加分项」三段）"
}`;

  // 同上：parse 失败与结构不合格已在 callLLMForJson 内各重试 1 次
  const parsed = await callLLMForJson(systemPrompt, userPrompt, 'jd-draft', normalizeDraft);

  const result = parsed ? normalizeDraft(parsed) : null;
  if (!result) {
    await writeOperationLog({
      userId,
      purpose: 'jd-draft',
      detail: { success: false, error: 'LLM 调用或 JSON 格式校验失败', title, refCount: references.length },
    });
    throw new AppError('AI 返回格式异常，请重试', 500);
  }

  await writeOperationLog({
    userId,
    purpose: 'jd-draft',
    detail: {
      success: true,
      title,
      type,
      refCount: references.length,
      draftLength: result.draftJd.length,
    },
  });

  return result;
}