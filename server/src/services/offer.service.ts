import type { Offer, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { clearStatsCache, getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { autoSendEmailOnStageTransition } from './email-auto-sender.service';
import * as notificationService from './notification.service';

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
  async getOffers(query: OfferListQuery): Promise<OfferListResult> {
    const { page = 1, pageSize = 10, result } = query;
    const cacheKey = `offers:list:${JSON.stringify(query)}`;
    const cached = await getFromCache<OfferListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * pageSize;

    const where: Prisma.OfferWhereInput = {};
    if (result) {
      where.result = result;
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
    candidateId: string
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
  async createOffer(data: CreateOfferInput): Promise<Offer> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: data.candidateId },
      include: { offer: true },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

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
        result: 'pending',
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
    data: UpdateOfferInput
  ): Promise<Offer> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 检查 Offer 是否存在
    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    const updateData: Prisma.OfferUpdateInput = {};

    if (data.salary !== undefined) updateData.salary = data.salary;
    if (data.offerDate !== undefined) updateData.offerDate = new Date(data.offerDate);
    if (data.expectedJoinDate !== undefined) {
      updateData.expectedJoinDate = data.expectedJoinDate ? new Date(data.expectedJoinDate) : null;
    }
    if (data.note !== undefined) updateData.note = data.note;
    if (data.result !== undefined) updateData.result = data.result;

    // 如果标记为已入职，自动设置 joined
    if (data.result === 'accepted') {
      updateData.joined = true;
      updateData.actualJoinDate = new Date();
    }

    const offer = await prisma.offer.update({
      where: { candidateId },
      data: updateData,
    });

    // 如果 result=accepted，自动推进候选人到"入职"阶段
    if (data.result === 'accepted') {
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
            status: 'passed',
            enteredAt: new Date(),
            completedAt: new Date(),
            note: 'Offer 已接受，自动推进到入职',
          },
        });

        // 异步触发入职邮件
        void autoSendEmailOnStageTransition(candidateId, '入职', 'passed', 'system');
      }
    }

    // 异步发送 Offer 状态变更通知
    if (data.result) {
      const resultLabel = data.result === 'accepted' ? '已接受' : data.result === 'rejected' ? '已拒绝' : '待确认';
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
    result: string
  ): Promise<Offer> {
    return this.updateOffer(candidateId, { result });
  }

  /**
   * 标记入职
   */
  async markAsJoined(
    candidateId: string,
    actualJoinDate: string
  ): Promise<Offer> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 检查 Offer 是否存在
    const existingOffer = await prisma.offer.findUnique({
      where: { candidateId },
    });

    if (!existingOffer) {
      throw new AppError('该候选人暂无 Offer', 404);
    }

    if (existingOffer.result !== 'accepted') {
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
  async deleteOffer(candidateId: string): Promise<void> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

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
