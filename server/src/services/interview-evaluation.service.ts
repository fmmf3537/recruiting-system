import type { InterviewEvaluation, Prisma } from '@prisma/client';
import { InterviewFeedbackStatus, InterviewStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import * as notificationService from './notification.service';

// 评估维度结构（dimensions Json 数组元素），维度项由字典 evaluation_dimension 配置
export interface EvaluationDimension {
  name: string;
  score: number;
  comment?: string;
}

// 提交评估参数
export interface SubmitEvaluationInput {
  dimensions: EvaluationDimension[];
  overallScore: number;
  conclusion: string;
}

// 我的评估列表查询参数
export interface MyEvaluationQuery {
  page?: number;
  pageSize?: number;
  status?: 'pending' | 'submitted';
}

// 催收阈值：面试结束（scheduledAt + duration）后 24 小时仍未提交则催收
const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * 面试评估服务
 * 处理结构化面试评估的生成、提交、查询与催收
 */
export class InterviewEvaluationService {
  /**
   * 面试创建时，按 interviewers 为每位面试官生成一条待填评估记录
   */
  async createPendingEvaluations(
    interviewId: string,
    interviewers: Array<{ id: string; name: string }>
  ): Promise<void> {
    await prisma.interviewEvaluation.createMany({
      data: interviewers.map((interviewer) => ({
        interviewId,
        interviewerId: interviewer.id,
      })),
    });
  }

  /**
   * 面试官本人提交/修改自己的评估（重复提交即修改）
   */
  async submitEvaluation(
    id: string,
    userId: string,
    data: SubmitEvaluationInput
  ): Promise<InterviewEvaluation> {
    const evaluation = await prisma.interviewEvaluation.findUnique({ where: { id } });
    if (!evaluation) {
      throw new AppError('评估记录不存在', 404);
    }
    // 仅评估归属的面试官本人可提交/修改
    if (evaluation.interviewerId !== userId) {
      throw new AppError('只能提交本人的面试评估', 403);
    }

    const submitted = await prisma.interviewEvaluation.update({
      where: { id },
      data: {
        // Prisma Json 字段需要 InputJsonValue 类型，此处 dimensions 结构已受 zod 校验
        dimensions: data.dimensions as unknown as Prisma.InputJsonValue,
        overallScore: data.overallScore,
        conclusion: data.conclusion,
        submittedAt: new Date(),
      },
    });
    await this.refreshFeedbackStatus(evaluation.interviewId);
    return submitted;
  }

  /**
   * 评估提交后检查是否仍有待填项。最后一份评估提交时，通知候选人负责人进入招聘决策。
   */
  async refreshFeedbackStatus(interviewId: string): Promise<void> {
    const [pendingCount, interview] = await Promise.all([
      prisma.interviewEvaluation.count({
        where: { interviewId, submittedAt: null },
      }),
      prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          candidate: { select: { name: true, createdById: true } },
        },
      }),
    ]);

    if (!interview || interview.status !== InterviewStatus.completed) return;
    const feedbackStatus =
      pendingCount === 0
        ? InterviewFeedbackStatus.all_submitted
        : InterviewFeedbackStatus.pending;

    if (interview.feedbackStatus === feedbackStatus) return;
    await prisma.interview.update({
      where: { id: interviewId },
      data: { feedbackStatus },
    });

    if (feedbackStatus === InterviewFeedbackStatus.all_submitted) {
      void notificationService
        .createNotification({
          recipientId: interview.candidate.createdById,
          title: `面试反馈已齐：${interview.candidate.name}`,
          content: `「${interview.candidate.name}」的${interview.round}面试官均已提交评估，请进行招聘决策。`,
          type: 'interview_feedback_completed',
          businessId: interviewId,
          businessType: 'interview',
        })
        .catch(() => {});
    }
  }

  /**
   * 我的评估列表（面试官视角：待评估 + 已提交）
   */
  async getMyEvaluations(userId: string, query: MyEvaluationQuery) {
    const { page = 1, pageSize = 10, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.InterviewEvaluationWhereInput = { interviewerId: userId };
    if (status === 'pending') where.submittedAt = null;
    if (status === 'submitted') where.submittedAt = { not: null };

    const [items, total] = await Promise.all([
      prisma.interviewEvaluation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          interview: {
            include: {
              candidate: { select: { id: true, name: true } },
              job: { select: { title: true } },
            },
          },
        },
      }),
      prisma.interviewEvaluation.count({ where }),
    ]);

    return {
      evaluations: items.map((item) => ({
        id: item.id,
        interviewId: item.interviewId,
        submittedAt: item.submittedAt,
        dimensions: item.dimensions as EvaluationDimension[] | null,
        overallScore: item.overallScore,
        conclusion: item.conclusion,
        interview: {
          id: item.interview.id,
          round: item.interview.round,
          type: item.interview.type,
          scheduledAt: item.interview.scheduledAt,
          duration: item.interview.duration,
          status: item.interview.status,
          candidateId: item.interview.candidate.id,
          candidateName: item.interview.candidate.name,
          jobTitle: item.interview.job?.title || null,
        },
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 面试详情聚合：各面试官的评估明细（含未提交的占位记录）
   */
  async getEvaluationsByInterview(interviewId: string) {
    const evaluations = await prisma.interviewEvaluation.findMany({
      where: { interviewId },
      include: {
        interviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return evaluations.map((item) => ({
      id: item.id,
      interviewerId: item.interviewerId,
      interviewerName: item.interviewer.name,
      dimensions: item.dimensions as EvaluationDimension[] | null,
      overallScore: item.overallScore,
      conclusion: item.conclusion,
      submittedAt: item.submittedAt,
    }));
  }

  /**
   * 催收扫描：面试结束 24 小时后仍未提交评估的面试官，发送站内催收通知
   * 每条评估仅催收一次（remindedAt 标记）；now 可注入便于测试
   */
  async sendEvaluationReminders(now: Date = new Date()): Promise<number> {
    // 粗筛：面试时间早于 24 小时前（duration > 0，满足精确条件者必被覆盖），再在 JS 层精确判断
    const pendingEvaluations = await prisma.interviewEvaluation.findMany({
      where: {
        submittedAt: null,
        remindedAt: null,
        interview: {
          status: { in: [InterviewStatus.scheduled, InterviewStatus.completed] },
          scheduledAt: { lt: new Date(now.getTime() - REMINDER_DELAY_MS) },
        },
      },
      include: {
        interview: {
          include: {
            candidate: { select: { name: true } },
          },
        },
      },
    });

    let reminded = 0;
    for (const evaluation of pendingEvaluations) {
      const { interview } = evaluation;
      // 精确判断：面试结束时间已满 24 小时
      const interviewEnd = interview.scheduledAt.getTime() + interview.duration * 60000;
      if (now.getTime() - interviewEnd < REMINDER_DELAY_MS) {
        continue;
      }

      await notificationService.createNotification({
        recipientId: evaluation.interviewerId,
        title: `面试评估催收：${interview.candidate.name}`,
        content: `您担任「${interview.candidate.name}」${interview.round}的面试官，面试已结束超过 24 小时，请尽快提交面试评估。`,
        type: 'evaluation_reminder',
        businessId: interview.id,
        businessType: 'interview',
      });
      await prisma.interviewEvaluation.update({
        where: { id: evaluation.id },
        data: { remindedAt: now },
      });
      reminded += 1;
    }

    return reminded;
  }
}

export const interviewEvaluationService = new InterviewEvaluationService();
