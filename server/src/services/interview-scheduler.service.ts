import type { Interview, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
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
    createdById: string
  ): Promise<Interview> {
    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: data.candidateId },
    });
    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 验证职位（如果指定）
    if (data.jobId) {
      const job = await prisma.job.findUnique({ where: { id: data.jobId } });
      if (!job) {
        throw new AppError('职位不存在', 404);
      }
    }

    // 面试官冲突检测
    const scheduledAt = new Date(data.scheduledAt);
    const duration = data.duration || 60;
    const scheduledEnd = new Date(scheduledAt.getTime() + duration * 60000);

    const interviewerIds = data.interviewers.map((i) => i.id);
    const conflicts = await prisma.interview.findMany({
      where: {
        status: 'scheduled',
        AND: [
          { scheduledAt: { lt: scheduledEnd } },
          {
            // 面试结束时间 > 新面试开始时间
            // 用 scheduledAt + (duration minutes * 60000 ms) 判定
            scheduledAt: { gte: new Date(scheduledAt.getTime() - 120 * 60000) },
          },
        ],
      },
      include: {
        candidate: { select: { name: true } },
      },
    });

    // 检查是否有面试官冲突（在 JS 层面精确判断时间重叠）
    for (const conflict of conflicts) {
      const conflictEnd = new Date(
        conflict.scheduledAt.getTime() + conflict.duration * 60000
      );
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
          `面试官 ${names} 在 ${conflict.scheduledAt.toLocaleString('zh-CN')} 已有面试安排（候选人：${conflict.candidate.name}）`,
          409
        );
      }
    }

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
        status: 'scheduled',
        createdById,
      },
    });

    await clearListCache('interviews:list:*');

    // 异步发送面试安排通知
    const interviewTime = scheduledAt.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    // 通知候选人负责人
    void notificationService.createNotification({
      recipientId: candidate.createdById,
      title: `面试安排：${candidate.name}`,
      content: `${candidate.name} 的${data.round}已安排在 ${interviewTime}，时长${duration}分钟`,
      type: 'interview_scheduled',
      businessId: interview.id,
      businessType: 'interview',
    }).catch((e) => console.error('[Notification] 面试通知发送失败:', e));

    // 通知每位面试官
    data.interviewers.forEach((interviewer) => {
      void notificationService.createNotification({
        recipientId: interviewer.id,
        title: `面试邀请：${candidate.name}`,
        content: `您被指定为「${candidate.name}」的${data.round}面试官，时间：${interviewTime}，时长${duration}分钟`,
        type: 'interview_scheduled',
        businessId: interview.id,
        businessType: 'interview',
      }).catch(() => {}); // 单个面试官通知失败不影响其他
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
  async getInterviews(query: InterviewListQuery): Promise<InterviewListResult> {
    const {
      page = 1,
      pageSize = 10,
      candidateId,
      jobId,
      status,
      startDate,
      endDate,
    } = query;

    const cacheKey = `interviews:list:${JSON.stringify(query)}`;
    const cached = await getFromCache<InterviewListResult>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;

    const where: Prisma.InterviewWhereInput = {};

    if (candidateId) where.candidateId = candidateId;
    if (jobId) where.jobId = jobId;
    if (status) where.status = status;

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
   * 更新面试安排
   */
  async updateInterview(
    id: string,
    data: UpdateInterviewInput
  ): Promise<Interview> {
    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('面试安排不存在', 404);
    }

    if (existing.status !== 'scheduled') {
      throw new AppError('只能修改待进行的面试安排', 400);
    }

    const updateData: Prisma.InterviewUpdateInput = {};

    if (data.round !== undefined) updateData.round = data.round;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.interviewers !== undefined) updateData.interviewers = data.interviewers;
    if (data.scheduledAt !== undefined) updateData.scheduledAt = new Date(data.scheduledAt);
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const interview = await prisma.interview.update({
      where: { id },
      data: updateData,
    });

    await clearListCache('interviews:list:*');
    return interview;
  }

  /**
   * 取消面试
   */
  async cancelInterview(id: string, reason?: string): Promise<Interview> {
    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('面试安排不存在', 404);
    }

    if (existing.status === 'cancelled') {
      throw new AppError('面试已经取消', 400);
    }

    if (existing.status === 'completed') {
      throw new AppError('已完成的面试不能取消', 400);
    }

    const interview = await prisma.interview.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: reason
          ? `${existing.notes || ''}\n取消原因：${reason}`.trim()
          : existing.notes,
      },
    });

    await clearListCache('interviews:list:*');
    return interview;
  }

  /**
   * 标记面试完成（状态联动到反馈录入）
   */
  async completeInterview(id: string): Promise<Interview> {
    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('面试安排不存在', 404);
    }

    if (existing.status !== 'scheduled') {
      throw new AppError('只能将待进行的面试标记为完成', 400);
    }

    const interview = await prisma.interview.update({
      where: { id },
      data: { status: 'completed' },
    });

    await clearListCache('interviews:list:*');
    return interview;
  }

  /**
   * 获取候选人的面试安排列表
   */
  async getInterviewsByCandidate(candidateId: string) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

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
  async getInterviewerConflicts(
    _interviewerId: string,
    startDate: string,
    endDate: string
  ) {
    return prisma.interview.findMany({
      where: {
        status: 'scheduled',
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
}

export const interviewSchedulerService = new InterviewSchedulerService();
