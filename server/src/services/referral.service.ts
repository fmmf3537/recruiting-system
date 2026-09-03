import path from 'path';
import { mkdirSync } from 'fs';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { env } from '../lib/env';
import { AppError } from '../middleware/errorHandler';
import {
  validateAndRenameUpload,
  buildFileApiPath,
} from '../utils/upload-file';
import { createUploadRecord } from './file.service';
import { candidateService } from './candidate.service';
import { createNotification } from './notification.service';
import { resumeParseQueue } from '../lib/queue';

// F5-S：猎头推荐通道 - 公开侧 service
// 包含链接解析、文件落地、查重、候选人创建、简历解析触发、站内通知、OperationLog
// 文件落地链路：multer tmp uuid → validateAndRenameUpload (magic bytes + UUID rename)
//              → createUploadRecord (uploadedById = 链接创建人)
//              → buildFileApiPath
// 完全复用 routes/upload.ts 的 processUploadedFile 链路，本文件未修改 upload.ts

// ============ 常量 ============

/** token 格式：32 位 hex（crypto.randomBytes(16).toString('hex')） */
const TOKEN_HEX_RE = /^[a-f0-9]{32}$/i;

/** 公开提交固定成功响应（B1：人工复核决策 B） */
const SUCCESS_RESPONSE = { success: true, message: '已提交，将由 HR 联系候选人' } as const;

/** 公开提交重复候选人内部标记（写入候选人 sourceNote；§3.3-6） */
const DUPLICATE_SOURCE_NOTE = '疑似重复待核实（与现有候选人手机号/邮箱重复）';

// ============ 类型 ============

export interface SubmitReferralForm {
  name: string;
  phone: string;
  email?: string;
  reason?: string;
}

export interface ReferralInfo {
  agencyName: string;
  jobTitle: string | null;
}

export interface SubmitReferralResult {
  candidateId: string;
  fileAbsolutePath: string;
  filename: string;
  duplicated: boolean;
}

// ============ 私有：链接可用性校验 ============

interface UsableLink {
  id: string;
  agencyId: string;
  createdById: string;
  jobId: string | null;
  token: string;
  agency: { id: string; name: string; enabled: boolean };
  job: { id: string; title: string } | null;
}

/**
 * 解析 token 并校验链接可用性。
 * 四种失效统一抛 AppError('链接已失效', 410)：
 *   1) token 不存在
 *   2) disabledAt 非空
 *   3) expiresAt 已过
 *   4) agency.enabled === false
 * 异常信息严格保持一致，不向调用方泄露细分原因（§3.3-2）
 */
async function assertLinkUsable(token: string): Promise<UsableLink> {
  // 不合法 token 格式直接视作不存在，避免不必要的 DB 探测
  if (!TOKEN_HEX_RE.test(token)) {
    throw new AppError('链接已失效', 410);
  }

  const link = await prisma.agencyLink.findUnique({
    where: { token },
    include: {
      agency: { select: { id: true, name: true, enabled: true } },
      job: { select: { id: true, title: true } },
    },
  });

  if (!link) {
    throw new AppError('链接已失效', 410);
  }
  if (link.disabledAt) {
    throw new AppError('链接已失效', 410);
  }
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    throw new AppError('链接已失效', 410);
  }
  if (!link.agency.enabled) {
    throw new AppError('链接已失效', 410);
  }

  return link as UsableLink;
}

// ============ 公开接口 ============

/**
 * GET /api/referral/:token —— 落地页信息
 * 仅返回 { agencyName, jobTitle } 两字段（§3.3-8 字段收敛）
 */
export async function getReferralInfo(token: string): Promise<ReferralInfo> {
  const link = await assertLinkUsable(token);
  return {
    agencyName: link.agency.name,
    jobTitle: link.job ? link.job.title : null,
  };
}

/**
 * POST /api/referral/:token —— 公开提交推荐
 * 流程（§4.4 步骤 1-9）：
 *  1) assertLinkUsable（410 拦截）
 *  2) 文件落地：validateAndRenameUpload + createUploadRecord + buildFileApiPath
 *  3) 查重：checkDuplicate（email 空串时传 undefined 跳过邮箱维度）
 *  4) createCandidate：source = '猎头:' + name，education 暂存空串由解析回填，
 *     **不传 jobIds** 以绕过 F2-S AI 自动打分钩子（A1 决策）
 *  5) link.jobId 非空时直接 candidateJob.create（仍不触发打分钩子）
 *  6) 简历解析：resumeParseQueue.add 带 candidateId（F5-S 模式，worker 不删文件 + 回填空字段）
 *  7) 站内通知链接创建人
 *  8) OperationLog
 *  9) 返回固定成功响应（B1 决策：不含 candidateId）
 *
 * 失败处理：已创建的上传记录 / 候选人尽量不回滚（与既有风格一致，失败由 HR 清理），
 * 但简历文件已落库而候选人创建失败时在日志里明显标记便于人工干预。
 */
export async function submitReferral(
  token: string,
  form: SubmitReferralForm,
  file: Express.Multer.File
): Promise<SubmitReferralResult> {
  const link = await assertLinkUsable(token);

  // 2) 文件落地：复用 upload.ts 的 processUploadedFile 链路（multer tmp → validate → uploadRecord → url）
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  try {
    mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    logger.error({ err }, '[F5-S] 创建上传目录失败');
    throw new AppError('文件上传目录不可用', 500);
  }

  const { filename, mimetype, size } = await validateAndRenameUpload(
    file.path,
    uploadDir,
    file.mimetype
  );
  const fileAbsolutePath = path.join(uploadDir, filename);
  const resumeUrl = buildFileApiPath(filename);

  await createUploadRecord({
    filename,
    originalName: file.originalname,
    mimetype,
    size,
    uploadedById: link.createdById,
  });

  // 3) 查重（§3.3-6：email 空串时跳过邮箱维度，避免空串互相误伤）
  // 复用 duplicate-checker 的实现，但这里直接调用以避开 createCandidate 强耦合的 scope
  const { checkDuplicate } = await import('./duplicate-checker.service');
  const dupResult = await checkDuplicate(form.phone, form.email || undefined, undefined, undefined);
  const duplicated = dupResult.duplicates.length > 0 || dupResult.hasHiddenDuplicate === true;

  // 4) 创建候选人 —— 不传 jobIds，绕过 F2-S AI 自动打分钩子（A1）
  const consentAt = new Date();
  // M6 合规补强：候选人授权文案需覆盖「AI 处理」用途（PRD §8.6）
  // 简历经 AI 解析 / 评分，会发送给第三方 LLM 服务，授权声明必须显式说明
  const consentNote = `猎头机构（${link.agency.name}）承诺已获候选人授权，并知悉简历可能经第三方 AI 服务处理（用于简历解析、人岗匹配等招聘用途）`;

  let candidateId: string;
  try {
    const created = await candidateService.createCandidate(
      {
        name: form.name,
        phone: form.phone,
        email: form.email || '', // schema 必填，邮箱选填时存空串
        education: '', // 必填占位，简历解析回填
        resumeUrl,
        source: `猎头:${link.agency.name}`,
        sourceNote: duplicated ? DUPLICATE_SOURCE_NOTE : undefined,
        intro: form.reason,
        consentAt: consentAt.toISOString(),
        consentNote,
      },
      link.createdById
      // 故意不传 scope：公开入口，无登录上下文；查重在上方已显式调用
    );
    candidateId = created.candidate.id;
  } catch (e) {
    // 候选人创建失败但简历已落库：明显标记便于人工清理
    logger.error(
      { err: e, filename, linkId: link.id, fileAbsolutePath },
      '[F5-S] 候选人创建失败，简历文件已落库待人工清理'
    );
    throw e;
  }

  // 5) 绑定职位：直接 candidateJob.create（**不**走 createCandidate 的 jobIds 路径）
  if (link.jobId) {
    try {
      await prisma.candidateJob.create({
        data: { candidateId, jobId: link.jobId },
      });
    } catch (e) {
      // 唯一冲突（同一候选人-职位已存在）忽略；其它错误抛出
      const code = (e as { code?: string })?.code;
      if (code !== 'P2002') {
        logger.error({ err: e, candidateId, jobId: link.jobId }, '[F5-S] candidateJob.create 失败');
        throw e;
      }
    }
  }

  // 6) 触发简历解析（F5-S 模式：worker 不删文件，按空字段回填候选人）
  try {
    await resumeParseQueue.add('parse', {
      filePath: fileAbsolutePath,
      mimetype,
      userId: link.createdById,
      candidateId,
    });
  } catch (e) {
    logger.error({ err: e, candidateId }, '[F5-S] 投递简历解析任务失败');
    // 失败不阻塞主流程
  }

  // 7) 站内通知链接创建人
  try {
    const duplicatedHint = duplicated ? '（疑似重复，建议核实）' : '';
    const jobHint = link.job ? `职位：${link.job.title}` : '不限职位';
    await createNotification({
      recipientId: link.createdById,
      title: `新猎头推荐：${form.name}`,
      content: `机构：${link.agency.name}，${jobHint}${duplicatedHint}`,
      type: 'agency_referral',
      businessId: candidateId,
      businessType: 'candidate',
    });
  } catch (e) {
    logger.error({ err: e, candidateId }, '[F5-S] 通知创建失败');
  }

  // 8) OperationLog（§3.3-7）
  await writeOpLogSafe({
    userId: link.createdById,
    targetType: 'Candidate',
    targetId: candidateId,
    action: 'agency_referral_submit',
    detail: {
      agencyId: link.agencyId,
      linkId: link.id,
      tokenSuffix: link.token.slice(-4),
      duplicated,
    } as Prisma.InputJsonValue,
  });

  return { candidateId, fileAbsolutePath, filename, duplicated };
}

// 暴露给 controller 的成功响应（避免在 controller 重复硬编码文案）
export function getSubmitSuccessResponse(): typeof SUCCESS_RESPONSE {
  return { ...SUCCESS_RESPONSE };
}

// ============ 私有：OperationLog ============

async function writeOpLogSafe(entry: {
  userId: string;
  targetType: string;
  targetId: string;
  action: string;
  detail: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId: entry.userId,
        targetType: entry.targetType,
        targetId: entry.targetId,
        action: entry.action,
        detail: entry.detail,
      },
    });
  } catch (e) {
    logger.error({ err: e, action: entry.action }, '[F5-S] OperationLog 写入失败');
  }
}

// re-export 给单测断言（避免单测重复硬编 token 长度）
export const __TEST__ = { TOKEN_HEX_RE, SUCCESS_RESPONSE, DUPLICATE_SOURCE_NOTE };