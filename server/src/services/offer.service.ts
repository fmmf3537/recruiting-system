import type { Offer, Prisma } from '@prisma/client';
import { OfferResult, OfferStatus, StageStatus } from '@prisma/client';
import { RULE_CODE } from '../constants/hr-score-rules';
import { offerApprovalTotal } from '../lib/metrics';
import prisma from '../lib/prisma';
import { clearStatsCache, getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { autoSendEmailOnStageTransition } from './email-auto-sender.service';
import { emitScoreEvent } from './hr-score-event.service';
import * as notificationService from './notification.service';
import {
  assertCandidateVisible,
  buildCandidateVisibilityWhere,
  type CandidateVisibilityScope,
} from './candidate-visibility.service';

// Offer 列表查询参数类型
export interface OfferListQuery {
  page?: number;
  pageSize?: number;
  result?: string;
}

// 创建 Offer 参数类型
export interface CreateOfferInput {
  candidateId: string;
  salary: string;
  offerDate: string;
  expectedJoinDate?: string;
  note?: string;
}

// 更新 Offer 参数类型
export interface UpdateOfferInput {
  salary?: string;
  offerDate?: string;
  expectedJoinDate?: string;
  result?: string;
  note?: string;
}

// Offer 列表返回类型
export interface OfferListResult {
  offers: Array<Offer & { candidate: { id: string; name: string; email: string; phone: string } }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Offer 服务类
 * 封装所有 Offer 相关的业务逻辑
 */
export class OfferService {
  /**
   * 获取 Offer 列表
   */
  async getOffers(
    query: OfferListQuery,
    scope?: CandidateVisibilityScope
  ): Promise<OfferListResult> {
    const { page = 1, pageSize = 10, result } = query;
    // 缓存 key 包含完整可见性范围，避免不同角色/部门的成员共享同一份缓存
    const cacheKey = `offers:list:${scope ? `${JSON.stringify(scope)}:` : ''}${JSON.stringify(query)}`;
    const cached = await getFromCache<OfferListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * pageSize;

    const where: Prisma.OfferWhereInput = {};
    if (result) {
      where.result = result as OfferResult;
    }

    // 数据可见性：member 仅可见范围内候选人的 Offer（admin 不过滤）
    const visibilityWhere = scope ? await buildCandidateVisibilityWhere(scope) : undefined;
    if (visibilityWhere) {
      where.candidate = visibilityWhere;
    }

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          candidate: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.offer.count({ where }),
    ]);

    const res = {
      offers: offers as unknown as Array<
        Offer & { candidate: { id: string; name: string; email: string; phone: string } }
      >,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await setCache(cacheKey, res, 30);
    return res;
  }

  /**
   * 获取某候选人的 Offer
   */
  async getOfferByCandidateId(
    candidateId: string,
    scope?: CandidateVisibilityScope
  ): Promise<
    Offer & {
      candidate: {
        id: string;
        name: string;
        email: string;
        phone: string;
        candidateJobs: Array<{
          job: { id: string; title: string };
        }>;
      };
    }
  > {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        candidateJobs: {
          include: {
            job: {
              select: { id: true, title: true },
            },
          },
        },
      },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 越权访问范围外候选人时返回 403
    await assertCandidateVisible(candidateId, scope);

    const offer = await prisma.offer.findUnique({
      where: { candidateId },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            candidateJobs: {
              include: {
                job: {
                  select: { id: true, title: true },
                },
              },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    return offer as unknown as Offer & {
      candidate: {
        id: string;
        name: string;
        email: string;
        phone: string;
        candidateJobs: Array<{
          job: { id: string; title: string };
        }>;
      };
    };
  }

  /**
   * 创建 Offer
   */
  async createOffer(data: CreateOfferInput, scope?: CandidateVisibilityScope): Promise<Offer> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: data.candidateId },
      include: { offer: true },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能为可见范围内的候选人创建 Offer
    await assertCandidateVisible(data.candidateId, scope);

    if (candidate.offer) {
      throw new AppError('该候选人已有 Offer', 409);
    }

    const offer = await prisma.offer.create({
      data: {
        candidateId: data.candidateId,
        salary: data.salary,
        offerDate: new Date(data.offerDate),
        expectedJoinDate: data.expectedJoinDate ? new Date(data.expectedJoinDate) : null,
        note: data.note,
        result: OfferResult.pending,
        joined: false,
      },
    });

    await clearStatsCache();
    await clearListCache('offers:list:*');
    return offer;
  }

  /**
   * 更新 Offer
   * 当 result=accepted 时自动推进到入职阶段
   */
  async updateOffer(
    candidateId: string,
    data: UpdateOfferInput,
    scope?: CandidateVisibilityScope
  ): Promise<Offer> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的 Offer
    await assertCandidateVisible(candidateId, scope);

    // 检查 Offer 是否存在
    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    // 审批流约束：审批通过（approved/sent）后才允许录入候选人答复；
    // 历史 Offer 迁移后 status=sent，不受此限制
    if (
      data.result !== undefined
      && existingOffer.status !== OfferStatus.approved
      && existingOffer.status !== OfferStatus.sent
    ) {
      throw new AppError('Offer 审批通过后才能录入候选人答复', 400);
    }

    const updateData: Prisma.OfferUpdateInput = {};

    if (data.salary !== undefined) updateData.salary = data.salary;
    if (data.offerDate !== undefined) updateData.offerDate = new Date(data.offerDate);
    if (data.expectedJoinDate !== undefined) {
      updateData.expectedJoinDate = data.expectedJoinDate ? new Date(data.expectedJoinDate) : null;
    }
    if (data.note !== undefined) updateData.note = data.note;
    if (data.result !== undefined) updateData.result = data.result as OfferResult;

    // 如果标记为已入职，自动设置 joined
    if (data.result === OfferResult.accepted) {
      updateData.joined = true;
      updateData.actualJoinDate = new Date();
    }

    const offer = await prisma.offer.update({
      where: { candidateId },
      data: updateData,
    });

    // F4-S1 考核积分：Offer 被拒 -10，负分归属招聘负责人（候选人创建人）
    if (data.result === OfferResult.rejected) {
      try {
        await emitScoreEvent({
          ruleCode: RULE_CODE.offer_rejected,
          userId: candidate.createdById,
          targetType: 'Offer',
          targetId: offer.id,
          remark: 'Offer 被拒',
        });
      } catch {
        // F4-S1 发射失败不阻塞主流程
      }
    }

    // 如果 result=accepted，自动推进候选人到"入职"阶段
    if (data.result === OfferResult.accepted) {
      // 检查是否已有入职阶段记录
      const existingStage = await prisma.stageRecord.findFirst({
        where: {
          candidateId,
          stage: '入职',
        },
      });

      if (!existingStage) {
        // 创建入职阶段记录
        await prisma.stageRecord.create({
          data: {
            candidateId,
            stage: '入职',
            status: StageStatus.passed,
            enteredAt: new Date(),
            completedAt: new Date(),
            note: 'Offer 已接受，自动推进到入职',
          },
        });

        // 异步触发入职邮件
        void autoSendEmailOnStageTransition(candidateId, '入职', StageStatus.passed, 'system');
      }

      // F4-S1 考核积分：候选人入职 +50，统一归属候选人创建人
      // （与 candidate.service.advanceStage 的入职事件靠唯一约束 P2002 去重，只记一次）
      try {
        await emitScoreEvent({
          ruleCode: RULE_CODE.candidate_joined,
          userId: candidate.createdById,
          targetType: 'Candidate',
          targetId: candidateId,
          remark: 'Offer 接受后自动推进到入职',
        });
      } catch {
        // F4-S1 发射失败不阻塞主流程
      }
    }

    // 异步发送 Offer 状态变更通知
    if (data.result) {
      const resultLabel = data.result === OfferResult.accepted ? '已接受' : data.result === OfferResult.rejected ? '已拒绝' : '待确认';
      void notificationService.createNotification({
        recipientId: candidate.createdById,
        title: `Offer 状态变更：${candidate.name}`,
        content: `${candidate.name} 的 Offer 状态变更为：${resultLabel}`,
        type: 'offer_status',
        businessId: candidateId,
        businessType: 'offer',
      }).catch((e) => console.error('[Notification] Offer通知发送失败:', e));
    }

    await clearStatsCache();
    return offer;
  }

  /**
   * 更新 Offer 结果（快捷方法）
   */
  async updateOfferResult(
    candidateId: string,
    result: string,
    scope?: CandidateVisibilityScope
  ): Promise<Offer> {
    return this.updateOffer(candidateId, { result }, scope);
  }

  /**
   * 提交审批（draft/rejected → pending_approval）
   * 参照 HCRequest 提交模式：提交时指定审批人，并发送站内通知
   */
  async submitOfferApproval(
    candidateId: string,
    approverId: string,
    userId: string,
    scope?: CandidateVisibilityScope
  ): Promise<Offer> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的 Offer
    await assertCandidateVisible(candidateId, scope);

    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    if (existingOffer.status !== OfferStatus.draft && existingOffer.status !== OfferStatus.rejected) {
      throw new AppError('仅草稿或已驳回的 Offer 可提交审批', 400);
    }

    // 校验审批人存在
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
    });

    if (!approver) {
      throw new AppError('审批人不存在', 400);
    }

    const offer = await prisma.offer.update({
      where: { candidateId },
      data: {
        status: OfferStatus.pending_approval,
        approverId,
        // 重新提交时清空上一轮审批痕迹
        approveNote: null,
        approvedAt: null,
        rejectedAt: null,
      },
    });

    await this.logOperation(userId, offer.id, 'offer_submitted', { candidateId, approverId });

    // 站内通知审批人（参照 HCRequest 通知模式，失败不阻断主流程）
    void notificationService.createNotification({
      recipientId: approverId,
      title: `Offer 待审批：${candidate.name}`,
      content: `${candidate.name} 的 Offer（薪资：${offer.salary}）已提交审批，请及时处理`,
      type: 'offer_approval',
      businessId: offer.id,
      businessType: 'offer',
    }).catch((e) => console.error('[Notification] Offer审批通知发送失败:', e));

    await clearListCache('offers:list:*');
    return offer;
  }

  /**
   * 审批通过（pending_approval → approved）
   * 仅 admin 或被指定的审批人可操作
   */
  async approveOffer(
    candidateId: string,
    userId: string,
    isAdmin: boolean,
    note?: string
  ): Promise<Offer> {
    const { candidate, offer } = await this.getPendingApprovalOffer(candidateId);
    this.assertApprover(offer, userId, isAdmin);

    const updated = await prisma.offer.update({
      where: { candidateId },
      data: {
        status: OfferStatus.approved,
        approvedAt: new Date(),
        approveNote: note || null,
      },
    });

    await this.logOperation(userId, updated.id, 'offer_approved', { candidateId, note });

    // 站内通知创建人（候选人创建者）审批结果
    void notificationService.createNotification({
      recipientId: candidate.createdById,
      title: `Offer 审批通过：${candidate.name}`,
      content: `${candidate.name} 的 Offer 已通过审批，可标记发送并录入候选人答复`,
      type: 'offer_approval',
      businessId: updated.id,
      businessType: 'offer',
    }).catch((e) => console.error('[Notification] Offer审批通知发送失败:', e));

    await clearListCache('offers:list:*');
    offerApprovalTotal.inc({ action: 'approve', role: isAdmin ? 'admin' : 'member' });
    return updated;
  }

  /**
   * 审批驳回（pending_approval → rejected）
   * 仅 admin 或被指定的审批人可操作，驳回必须填写审批意见
   */
  async rejectOffer(
    candidateId: string,
    userId: string,
    isAdmin: boolean,
    note: string
  ): Promise<Offer> {
    if (!note) {
      throw new AppError('驳回必须填写审批意见', 400);
    }

    const { candidate, offer } = await this.getPendingApprovalOffer(candidateId);
    this.assertApprover(offer, userId, isAdmin);

    const updated = await prisma.offer.update({
      where: { candidateId },
      data: {
        status: OfferStatus.rejected,
        rejectedAt: new Date(),
        approveNote: note,
      },
    });

    await this.logOperation(userId, updated.id, 'offer_rejected', { candidateId, note });
    offerApprovalTotal.inc({ action: 'reject', role: isAdmin ? 'admin' : 'member' });

    // 站内通知创建人（候选人创建者）审批结果
    void notificationService.createNotification({
      recipientId: candidate.createdById,
      title: `Offer 已驳回：${candidate.name}`,
      content: `${candidate.name} 的 Offer 未通过审批，意见：${note}`,
      type: 'offer_approval',
      businessId: updated.id,
      businessType: 'offer',
    }).catch((e) => console.error('[Notification] Offer审批通知发送失败:', e));

    await clearListCache('offers:list:*');
    return updated;
  }

  /**
   * 标记已发送（approved → sent）
   * 审批通过后才允许标记发送
   */
  async markOfferSent(
    candidateId: string,
    userId: string,
    scope?: CandidateVisibilityScope
  ): Promise<Offer> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的 Offer
    await assertCandidateVisible(candidateId, scope);

    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    if (existingOffer.status !== OfferStatus.approved) {
      throw new AppError('仅审批通过的 Offer 可标记为已发送', 400);
    }

    const offer = await prisma.offer.update({
      where: { candidateId },
      data: { status: OfferStatus.sent },
    });

    await this.logOperation(userId, offer.id, 'offer_sent', { candidateId });

    // F4-S1 考核积分：发出 Offer +30，归属发送人（发射失败不影响 Offer 状态）
    try {
      await emitScoreEvent({
        ruleCode: RULE_CODE.offer_sent,
        userId,
        targetType: 'Offer',
        targetId: offer.id,
        remark: 'Offer 已发送',
      });
    } catch {
      // F4-S1 发射失败不阻塞主流程
    }

    await clearListCache('offers:list:*');
    return offer;
  }

  /**
   * 审批操作公共前置校验：候选人/Offer 存在且处于审批中
   */
  private async getPendingApprovalOffer(
    candidateId: string
  ): Promise<{ candidate: { id: string; name: string; createdById: string }; offer: Offer }> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    const offer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!offer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    if (offer.status !== OfferStatus.pending_approval) {
      throw new AppError('仅审批中的 Offer 可以审批', 400);
    }

    return { candidate, offer };
  }

  /**
   * 审批权限校验：仅 admin 或被指定的审批人可以审批
   */
  private assertApprover(offer: Offer, userId: string, isAdmin: boolean): void {
    if (!isAdmin && offer.approverId !== userId) {
      throw new AppError('仅管理员或指定审批人可以审批', 403);
    }
  }

  /**
   * 写入操作日志（日志失败不阻断主流程）
   */
  private async logOperation(
    userId: string,
    targetId: string,
    action: string,
    detail: Prisma.InputJsonValue
  ): Promise<void> {
    try {
      await prisma.operationLog.create({
        data: {
          userId,
          targetType: 'Offer',
          targetId,
          action,
          detail,
        },
      });
    } catch (e) {
      console.error('[OperationLog] Offer 操作日志写入失败:', e);
    }
  }

  /**
   * 标记入职
   */
  async markAsJoined(
    candidateId: string,
    actualJoinDate: string,
    scope?: CandidateVisibilityScope
  ): Promise<Offer> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的 Offer
    await assertCandidateVisible(candidateId, scope);

    // 检查 Offer 是否存在
    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    if (existingOffer.result !== OfferResult.accepted) {
      throw new AppError('候选人尚未接受 Offer，无法标记入职', 400);
    }

    const offer = await prisma.offer.update({
      where: { candidateId },
      data: {
        joined: true,
        actualJoinDate: new Date(actualJoinDate),
      },
    });

    await clearStatsCache();
    return offer;
  }

  /**
   * 删除 Offer
   */
  async deleteOffer(candidateId: string, scope?: CandidateVisibilityScope): Promise<void> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 数据可见性校验：member 只能操作可见范围内候选人的 Offer
    await assertCandidateVisible(candidateId, scope);

    // 检查 Offer 是否存在
    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    await prisma.offer.delete({
      where: { candidateId },
    });

    await clearStatsCache();
    await clearListCache('offers:list:*');
  }
}

// 导出单例实例
export const offerService = new OfferService();
