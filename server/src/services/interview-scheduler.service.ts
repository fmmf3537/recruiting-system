import type { Interview, Prisma } from '@prisma/client';
import { InterviewStatus } from '@prisma/client';
import { RULE_CODE } from '../constants/hr-score-rules';
import prisma from '../lib/prisma';
import { getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { interviewEvaluationService } from './interview-evaluation.service';
import {
  assertCandidateVisible,
  buildCandidateVisibilityWhere,
  type CandidateVisibilityScope,
} from './candidate-visibility.service';
import { emitScoreEvent } from './hr-score-event.service';
import { assertFocusTypeValid } from './interview-outline.service';
import * as notificationService from './notification.service';

// 面试列表查询参数
export interface InterviewListQuery {
  page?: number;
  pageSize?: number;
  candidateId?: string;
  jobId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  round?: string;
}

// 创建面试参数
export interface CreateInterviewInput {
  candidateId: string;
  jobId?: string;
  round: string;
  type: string;
  interviewers: Array<{ id: string; name: string }>;
  scheduledAt: string;
  duration?: number;
  location?: string;
  notes?: string;
  // F3-S：考察方向（字典 interview_focus_type）；可选，service 层校验字典有效性
  focusType?: string;
}

// 更新面试参数
export interface UpdateInterviewInput {
  round?: string;
  type?: string;
  interviewers?: Array<{ id: string; name: string }>;
  scheduledAt?: string;
  duration?: number;
  location?: string;
  notes?: string;
  status?: string;
  // F3-S：考察方向（字典 interview_focus_type）；可选，service 层校验字典有效性
  focusType?: string;
}

// 面试列表返回类型
export interface InterviewListResult {
  interviews: InterviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 面试列表项（含关联信息）
export interface InterviewListItem {
  id: string;
  round: string;
  type: string;
  interviewers: Array<{ id: string; name: string }>;
  scheduledAt: Date;
  duration: number;
  location: string | null;
  notes: string | null;
  status: string;
  candidateId: string;
  candidateName: string;
  jobId: string | null;
  jobTitle: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
  // 已提交评估摘要（最多 1 条，最近优先）；前端读 evaluations?.[0]?.conclusion
  evaluations: Array<{ conclusion: string | null; submittedAt: string }>;
}

/** 比较面试官 id 集合（忽略顺序与姓名） */
function sameInterviewerIds(a: Array<{ id: string }>, b: Array<{ id: string }>): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((i) => i.id));
  return b.every((i) => ids.has(i.id));
}

const CHINA_TIME_ZONE = 'Asia/Shanghai';
const ISO_WITH_TIME_ZONE = /(Z|[+-]\d{2}:\d{2})$/;

/** 只接受带时区的 ISO 时间，防止 Docker/宿主机时区改变面试的实际时刻。 */
function parseScheduledAt(value: string): Date {
  if (!ISO_WITH_TIME_ZONE.test(value)) {
    throw new AppError('面试时间必须使用带时区的 ISO 格式', 400);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('无效的面试时间格式', 400);
  }
  return date;
}

function formatInterviewTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    timeZone: CHINA_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 收集实际变更字段名，供 OperationLog.changedFields 使用 */
function collectChangedFields(
  existing: {
    round: string;
    type: string;
    location: string | null;
    notes: string | null;
    scheduledAt: Date;
    duration: number;
    focusType?: string | null;
  },
  data: UpdateInterviewInput,
  nextScheduledAt: Date,
  prevInterviewers: Array<{ id: string }>,
  nextInterviewers: Array<{ id: string }>
): string[] {
  const changed: string[] = [];
  if (data.round !== undefined && data.round !== existing.round) changed.push('round');
  if (data.type !== undefined && data.type !== existing.type) changed.push('type');
  if (data.location !== undefined && data.location !== existing.location) changed.push('location');
  if (data.notes !== undefined && data.notes !== existing.notes) changed.push('notes');
  if (data.duration !== undefined && data.duration !== existing.duration) changed.push('duration');
  if (data.focusType !== undefined && data.focusType !== existing.focusType) {
    changed.push('focusType');
  }
  if (
    data.scheduledAt !== undefined &&
    nextScheduledAt.getTime() !== existing.scheduledAt.getTime()
  ) {
    changed.push('scheduledAt');
  }
  if (data.interviewers !== undefined && !sameInterviewerIds(prevInterviewers, nextInterviewers)) {
    changed.push('interviewers');
  }
  return changed;
}

/**
 * 面试安排服务
 * 处理面试的创建、查询、更新、取消等业务逻辑
 */
export class InterviewSchedulerService {
  /**
   * 创建面试安排（含面试官冲突检测）
   */
  async createInterview(
    data: CreateInterviewInput,
    createdById: string,
    scope?: CandidateVisibilityScope
  ): Promise<Interview> {
    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: data.candidateId },
    });
    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能为可见范围内的候选人安排面试
    await assertCandidateVisible(data.candidateId, scope);

    // F3-S：考察方向字典校验（可选；不提供则放行）
    await assertFocusTypeValid(data.focusType);

    // 验证职位（如果指定）
    if (data.jobId) {
      const job = await prisma.job.findUnique({ where: { id: data.jobId } });
      if (!job) {
        throw new AppError('职位不存在', 404);
      }
    }

    // 面试官冲突检测（创建时不排除任何 id）
    const scheduledAt = parseScheduledAt(data.scheduledAt);
    const duration = data.duration || 60;
    await this.assertNoInterviewerConflicts(
      data.interviewers.map((i) => i.id),
      scheduledAt,
      duration
    );

    // 创建面试
    const interview = await prisma.interview.create({
      data: {
        candidateId: data.candidateId,
        jobId: data.jobId || null,
        round: data.round,
        type: data.type,
        interviewers: data.interviewers,
        scheduledAt,
        duration,
        location: data.location || null,
        notes: data.notes || null,
        // F3-S：考察方向（已校验通过）；不提供则落 null（兼容存量面试）
        focusType: data.focusType ?? null,
        status: InterviewStatus.scheduled,
        createdById,
      },
    });

    await clearListCache('interviews:list:*');

    // 按 interviewers 为每位面试官生成待填的结构化评估记录
    await interviewEvaluationService.createPendingEvaluations(interview.id, data.interviewers);

    // 异步发送面试安排通知
    const interviewTime = formatInterviewTime(scheduledAt);
    // 通知候选人负责人
    void notificationService
      .createNotification({
        recipientId: candidate.createdById,
        title: `面试安排：${candidate.name}`,
        content: `${candidate.name} 的${data.round}已安排在 ${interviewTime}，时长${duration}分钟`,
        type: 'interview_scheduled',
        businessId: interview.id,
        businessType: 'interview',
      })
      .catch((e) => console.error('[Notification] 面试通知发送失败:', e));

    // 通知每位面试官
    data.interviewers.forEach((interviewer) => {
      void notificationService
        .createNotification({
          recipientId: interviewer.id,
          title: `面试邀请：${candidate.name}`,
          content: `您被指定为「${candidate.name}」的${data.round}面试官，时间：${interviewTime}，时长${duration}分钟`,
          type: 'interview_scheduled',
          businessId: interview.id,
          businessType: 'interview',
        })
        .catch(() => {}); // 单个面试官通知失败不影响其他
    });

    return interview;
  }

  /**
   * 获取面试详情
   */
  async getInterviewById(id: string) {
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: { id: true, name: true, phone: true, email: true },
        },
        job: {
          select: { id: true, title: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!interview) {
      throw new AppError('面试安排不存在', 404);
    }

    return interview;
  }

  /**
   * 获取面试列表（支持分页和筛选）
   */
  async getInterviews(
    query: InterviewListQuery,
    scope?: CandidateVisibilityScope
  ): Promise<InterviewListResult> {
    const {
      page = 1,
      pageSize = 10,
      candidateId,
      jobId,
      status,
      startDate,
      endDate,
      round,
    } = query;

    // 缓存 key 包含完整可见性范围，避免不同角色/部门的成员共享同一份缓存
    const cacheKey = `interviews:list:${scope ? `${JSON.stringify(scope)}:` : ''}${JSON.stringify(query)}`;
    const cached = await getFromCache<InterviewListResult>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;

    const where: Prisma.InterviewWhereInput = {};

    if (candidateId) where.candidateId = candidateId;
    if (jobId) where.jobId = jobId;
    if (status) where.status = status as InterviewStatus;
    // 轮次精确匹配（初试/复试/终面）；未传则不限制
    if (round) where.round = round;

    // 数据可见性：member 仅可见范围内候选人的面试安排（admin 不过滤）
    const visibilityWhere = scope ? await buildCandidateVisibilityWhere(scope) : undefined;
    if (visibilityWhere) {
      where.candidate = visibilityWhere;
    }

    if (startDate || endDate) {
      where.scheduledAt = {};
      if (startDate) where.scheduledAt.gte = new Date(startDate);
      if (endDate) where.scheduledAt.lte = new Date(endDate);
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { scheduledAt: 'desc' },
        include: {
          candidate: { select: { id: true, name: true } },
          job: { select: { id: true, title: true } },
          createdBy: { select: { id: true, name: true } },
          // 已提交评估：最近 1 条，供列表「评估」列（前端 evaluations[0].conclusion）
          evaluations: {
            where: { submittedAt: { not: null } },
            orderBy: { updatedAt: 'desc' },
            select: { conclusion: true, submittedAt: true },
            take: 1,
          },
        },
      }),
      prisma.interview.count({ where }),
    ]);

    const result: InterviewListResult = {
      interviews: interviews.map((it) => ({
        id: it.id,
        round: it.round,
        type: it.type,
        interviewers: it.interviewers as Array<{ id: string; name: string }>,
        scheduledAt: it.scheduledAt,
        duration: it.duration,
        location: it.location,
        notes: it.notes,
        status: it.status,
        candidateId: it.candidateId,
        candidateName: it.candidate.name,
        jobId: it.jobId,
        jobTitle: it.job?.title || null,
        createdById: it.createdById,
        createdByName: it.createdBy?.name || null,
        createdAt: it.createdAt,
        evaluations: it.evaluations.map((e) => ({
          conclusion: e.conclusion,
          submittedAt: e.submittedAt ? e.submittedAt.toISOString() : '',
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await setCache(cacheKey, result, 30);
    return result;
  }

  /**
   * 更新面试安排（仅 scheduled；改时间/时长/面试官需冲突检测并排除自身）
   */
  async updateInterview(
    id: string,
    data: UpdateInterviewInput,
    scope?: CandidateVisibilityScope
  ): Promise<Interview> {
    const existing = await prisma.interview.findUnique({
      where: { id },
      include: { candidate: { select: { id: true, name: true, createdById: true } } },
    });
    if (!existing) {
      throw new AppError('面试安排不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的面试
    await assertCandidateVisible(existing.candidateId, scope);

    if (existing.status !== InterviewStatus.scheduled) {
      throw new AppError('只能修改待进行的面试安排', 400);
    }

    const prevInterviewers = (existing.interviewers as Array<{ id: string; name: string }>) || [];
    const nextInterviewers = data.interviewers !== undefined ? data.interviewers : prevInterviewers;
    const nextScheduledAt =
      data.scheduledAt !== undefined ? parseScheduledAt(data.scheduledAt) : existing.scheduledAt;
    const nextDuration = data.duration !== undefined ? data.duration : existing.duration;

    // 时间 / 时长 / 面试官任一变化才做冲突检测，且必须排除当前面试 id
    if (
      data.scheduledAt !== undefined ||
      data.duration !== undefined ||
      data.interviewers !== undefined
    ) {
      await this.assertNoInterviewerConflicts(
        nextInterviewers.map((i) => i.id),
        nextScheduledAt,
        nextDuration,
        id
      );
    }

    const interviewersChanged = !sameInterviewerIds(prevInterviewers, nextInterviewers);
    if (data.interviewers !== undefined && interviewersChanged) {
      await this.syncInterviewEvaluations(id, nextInterviewers);
    }

    const updateData: Prisma.InterviewUpdateInput = {};

    if (data.round !== undefined) updateData.round = data.round;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.interviewers !== undefined) updateData.interviewers = data.interviewers;
    if (data.scheduledAt !== undefined) updateData.scheduledAt = nextScheduledAt;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.notes !== undefined) updateData.notes = data.notes;
    // F3-S：focusType 字典有效性校验 + 透传（显式 null 也允许，便于清除）
    if (data.focusType !== undefined) {
      await assertFocusTypeValid(data.focusType);
      updateData.focusType = data.focusType;
    }

    const interview = await prisma.interview.update({
      where: { id },
      data: updateData,
    });

    await clearListCache('interviews:list:*');

    const operatorId = scope?.userId || existing.createdById;
    await this.writeInterviewOperationLog(operatorId, id, 'interview_updated', {
      changedFields: collectChangedFields(
        existing,
        data,
        nextScheduledAt,
        prevInterviewers,
        nextInterviewers
      ),
      from: {
        round: existing.round,
        scheduledAt: existing.scheduledAt.toISOString(),
        interviewerIds: prevInterviewers.map((i) => i.id),
        location: existing.location,
      },
      to: {
        round: data.round !== undefined ? data.round : existing.round,
        scheduledAt: nextScheduledAt.toISOString(),
        interviewerIds: nextInterviewers.map((i) => i.id),
        location: data.location !== undefined ? data.location : existing.location,
      },
      notesChanged: data.notes !== undefined && data.notes !== existing.notes,
    });

    // 通知候选人负责人 + 新增面试官（失败不阻断）
    const candidateName = existing.candidate?.name || '候选人';
    const interviewTime = formatInterviewTime(nextScheduledAt);
    const nextRound = data.round !== undefined ? data.round : existing.round;
    if (existing.candidate?.createdById) {
      void notificationService
        .createNotification({
          recipientId: existing.candidate.createdById,
          title: `面试变更：${candidateName}`,
          content: `${candidateName} 的${nextRound}安排已更新，时间：${interviewTime}，时长${nextDuration}分钟`,
          type: 'interview_updated',
          businessId: id,
          businessType: 'interview',
        })
        .catch((e) => console.error('[Notification] 面试更新通知发送失败:', e));
    }
    const prevIdSet = new Set(prevInterviewers.map((i) => i.id));
    nextInterviewers
      .filter((i) => !prevIdSet.has(i.id))
      .forEach((interviewer) => {
        void notificationService
          .createNotification({
            recipientId: interviewer.id,
            title: `面试邀请：${candidateName}`,
            content: `您被指定为「${candidateName}」的${nextRound}面试官，时间：${interviewTime}，时长${nextDuration}分钟`,
            type: 'interview_updated',
            businessId: id,
            businessType: 'interview',
          })
          .catch(() => {});
      });

    return interview;
  }

  /**
   * 取消面试（状态改为 cancelled，不物理删除；completed 不可取消）
   */
  async cancelInterview(
    id: string,
    reason?: string,
    scope?: CandidateVisibilityScope
  ): Promise<Interview> {
    const existing = await prisma.interview.findUnique({
      where: { id },
      include: { candidate: { select: { id: true, name: true, createdById: true } } },
    });
    if (!existing) {
      throw new AppError('面试安排不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的面试
    await assertCandidateVisible(existing.candidateId, scope);

    if (existing.status === InterviewStatus.cancelled) {
      throw new AppError('面试已经取消', 400);
    }

    if (existing.status === InterviewStatus.completed) {
      throw new AppError('已完成的面试不能取消', 400);
    }

    const interview = await prisma.interview.update({
      where: { id },
      data: {
        status: InterviewStatus.cancelled,
        notes: reason ? `${existing.notes || ''}\n取消原因：${reason}`.trim() : existing.notes,
      },
    });

    await clearListCache('interviews:list:*');

    const operatorId = scope?.userId || existing.createdById;
    await this.writeInterviewOperationLog(operatorId, id, 'interview_cancelled', {
      reason: reason || '',
    });

    // 通知候选人负责人与所有面试官（失败不阻断）
    const candidateName = existing.candidate?.name || '候选人';
    const reasonSuffix = reason ? `，原因：${reason}` : '';
    if (existing.candidate?.createdById) {
      void notificationService
        .createNotification({
          recipientId: existing.candidate.createdById,
          title: `面试取消：${candidateName}`,
          content: `${candidateName} 的${existing.round}已取消${reasonSuffix}`,
          type: 'interview_cancelled',
          businessId: id,
          businessType: 'interview',
        })
        .catch((e) => console.error('[Notification] 面试取消通知发送失败:', e));
    }
    const cancelInterviewers = (existing.interviewers as Array<{ id: string; name: string }>) || [];
    cancelInterviewers.forEach((interviewer) => {
      void notificationService
        .createNotification({
          recipientId: interviewer.id,
          title: `面试取消：${candidateName}`,
          content: `「${candidateName}」的${existing.round}已取消${reasonSuffix}`,
          type: 'interview_cancelled',
          businessId: id,
          businessType: 'interview',
        })
        .catch(() => {});
    });

    return interview;
  }

  /**
   * 校验当前用户是否为该场面试官之一（按 interviewers JSON 的 id 匹配）
   * 不存在 → 404；不在名单 → 403。admin 旁路由 controller 处理，本方法不做角色判断。
   */
  async assertInterviewerOf(interviewId: string, userId: string): Promise<void> {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { interviewers: true },
    });
    if (!interview) {
      throw new AppError('面试安排不存在', 404);
    }
    // Prisma Json 可能是 JsonValue，操作前收窄为数组
    const list = Array.isArray(interview.interviewers)
      ? (interview.interviewers as Array<{ id?: string }>)
      : [];
    if (!list.some((u) => u.id === userId)) {
      throw new AppError('仅参与本次面试的面试官可标记完成', 403);
    }
  }

  /**
   * 标记面试完成（状态联动到反馈录入）
   */
  async completeInterview(id: string): Promise<Interview> {
    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('面试安排不存在', 404);
    }

    if (existing.status !== InterviewStatus.scheduled) {
      throw new AppError('只能将待进行的面试标记为完成', 400);
    }

    const interview = await prisma.interview.update({
      where: { id },
      data: { status: InterviewStatus.completed },
    });

    // F4-S1 考核积分：完成一场面试 +10，归属安排面试的 HR（本方法无操作人入参）
    try {
      await emitScoreEvent({
        ruleCode: RULE_CODE.interview_complete,
        userId: existing.createdById,
        targetType: 'Interview',
        targetId: id,
        remark: '面试完成',
      });
    } catch {
      // F4-S1 发射失败不阻塞主流程
    }

    await clearListCache('interviews:list:*');
    return interview;
  }

  /**
   * 获取候选人的面试安排列表
   */
  async getInterviewsByCandidate(candidateId: string, scope?: CandidateVisibilityScope) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 越权访问范围外候选人时返回 403
    await assertCandidateVisible(candidateId, scope);

    return prisma.interview.findMany({
      where: { candidateId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        job: { select: { id: true, title: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * 获取面试官在指定时间段的冲突（用于前端日历）
   */
  async getInterviewerConflicts(_interviewerId: string, startDate: string, endDate: string) {
    return prisma.interview.findMany({
      where: {
        status: InterviewStatus.scheduled,
        scheduledAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        // 注意：Prisma 对 JSON 数组的筛选有限，冲突检查在 JS 层面做 interviewers 匹配
      },
      select: {
        id: true,
        interviewers: true,
        scheduledAt: true,
        duration: true,
        candidate: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /**
   * 面试官时间冲突检测；excludeInterviewId 用于更新时排除自身，避免自己和自己冲突
   */
  private async assertNoInterviewerConflicts(
    interviewerIds: string[],
    scheduledAt: Date,
    duration: number,
    excludeInterviewId?: string
  ): Promise<void> {
    const scheduledEnd = new Date(scheduledAt.getTime() + duration * 60000);

    const conflicts = await prisma.interview.findMany({
      where: {
        status: InterviewStatus.scheduled,
        ...(excludeInterviewId ? { id: { not: excludeInterviewId } } : {}),
        AND: [
          { scheduledAt: { lt: scheduledEnd } },
          {
            // 粗筛：开始时间落在新面试前 480 分钟内（时长上限 480），精确重叠在 JS 判断
            scheduledAt: { gte: new Date(scheduledAt.getTime() - 480 * 60000) },
          },
        ],
      },
      include: {
        candidate: { select: { name: true } },
      },
    });

    for (const conflict of conflicts) {
      const conflictEnd = new Date(conflict.scheduledAt.getTime() + conflict.duration * 60000);
      if (conflictEnd <= scheduledAt || conflict.scheduledAt >= scheduledEnd) {
        continue; // 无时间重叠
      }

      const conflictInterviewers = conflict.interviewers as Array<{ id: string; name: string }>;
      const overlappingInterviewers = conflictInterviewers.filter((ci) =>
        interviewerIds.includes(ci.id)
      );

      if (overlappingInterviewers.length > 0) {
        const names = overlappingInterviewers.map((i) => i.name).join('、');
        throw new AppError(
          `面试官 ${names} 在 ${formatInterviewTime(conflict.scheduledAt)} 已有面试安排（候选人：${conflict.candidate.name}）`,
          409
        );
      }
    }
  }

  /**
   * 同步面试官变更到 InterviewEvaluation：新增待填、删除未提交；已提交者禁止移除
   */
  private async syncInterviewEvaluations(
    interviewId: string,
    nextInterviewers: Array<{ id: string; name: string }>
  ): Promise<void> {
    const existingEvals = await prisma.interviewEvaluation.findMany({
      where: { interviewId },
      select: { id: true, interviewerId: true, submittedAt: true },
    });

    const nextIds = new Set(nextInterviewers.map((i) => i.id));

    const submittedBlocked = existingEvals.filter(
      (e) => e.submittedAt != null && !nextIds.has(e.interviewerId)
    );
    if (submittedBlocked.length > 0) {
      throw new AppError('已提交评估的面试官不可移除', 400);
    }

    const toDeleteIds = existingEvals
      .filter((e) => e.submittedAt == null && !nextIds.has(e.interviewerId))
      .map((e) => e.id);
    if (toDeleteIds.length > 0) {
      await prisma.interviewEvaluation.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
    }

    const existingInterviewerIds = new Set(existingEvals.map((e) => e.interviewerId));
    const toAdd = nextInterviewers.filter((i) => !existingInterviewerIds.has(i.id));
    if (toAdd.length > 0) {
      await interviewEvaluationService.createPendingEvaluations(interviewId, toAdd);
    }
  }

  /**
   * 写面试操作日志；失败仅记 console.error，不阻断主流程
   */
  private async writeInterviewOperationLog(
    userId: string,
    interviewId: string,
    action: string,
    detail: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.operationLog.create({
        data: {
          userId,
          targetType: 'Interview',
          targetId: interviewId,
          action,
          detail: detail as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      console.error('[OperationLog] Interview 操作日志写入失败:', e);
    }
  }
}

export const interviewSchedulerService = new InterviewSchedulerService();
