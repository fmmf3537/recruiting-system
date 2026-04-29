import type { CommunicationLog, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';

// 创建沟通记录参数
export interface CreateCommunicationInput {
  candidateId: string;
  type: string;
  content: string;
  result?: string;
  followUpAt?: string;
}

// 更新沟通记录参数
export interface UpdateCommunicationInput {
  type?: string;
  content?: string;
  result?: string;
  followUpAt?: string;
}

// 沟通记录列表查询参数
export interface CommunicationListQuery {
  page?: number;
  pageSize?: number;
  candidateId?: string;
  type?: string;
}

/**
 * 候选人沟通记录服务
 */
export class CommunicationService {
  /**
   * 创建沟通记录
   */
  async createCommunication(
    data: CreateCommunicationInput,
    createdById: string
  ): Promise<CommunicationLog> {
    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: data.candidateId },
    });
    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    const log = await prisma.communicationLog.create({
      data: {
        candidateId: data.candidateId,
        type: data.type,
        content: data.content,
        result: data.result || null,
        followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        createdById,
      },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    await clearListCache('communications:list:*');
    return log;
  }

  /**
   * 获取沟通记录详情
   */
  async getCommunicationById(id: string) {
    const log = await prisma.communicationLog.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        candidate: { select: { id: true, name: true } },
      },
    });

    if (!log) {
      throw new AppError('沟通记录不存在', 404);
    }

    return log;
  }

  /**
   * 获取沟通记录列表（支持分页和筛选）
   */
  async getCommunications(query: CommunicationListQuery) {
    const { page = 1, pageSize = 20, candidateId, type } = query;

    const cacheKey = `communications:list:${JSON.stringify(query)}`;
    const cached = await getFromCache(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;

    const where: Prisma.CommunicationLogWhereInput = {};
    if (candidateId) where.candidateId = candidateId;
    if (type) where.type = type;

    const [logs, total] = await Promise.all([
      prisma.communicationLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          candidate: { select: { id: true, name: true } },
        },
      }),
      prisma.communicationLog.count({ where }),
    ]);

    const result = {
      communications: logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await setCache(cacheKey, result, 30);
    return result;
  }

  /**
   * 获取某候选人的所有沟通记录（按时间倒序）
   */
  async getCommunicationsByCandidate(candidateId: string) {
    return prisma.communicationLog.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * 更新沟通记录
   */
  async updateCommunication(
    id: string,
    data: UpdateCommunicationInput
  ): Promise<CommunicationLog> {
    const existing = await prisma.communicationLog.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('沟通记录不存在', 404);
    }

    const log = await prisma.communicationLog.update({
      where: { id },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.result !== undefined && { result: data.result }),
        ...(data.followUpAt !== undefined && {
          followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    await clearListCache('communications:list:*');
    return log;
  }

  /**
   * 删除沟通记录
   */
  async deleteCommunication(id: string): Promise<void> {
    const existing = await prisma.communicationLog.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('沟通记录不存在', 404);
    }

    await prisma.communicationLog.delete({ where: { id } });
    await clearListCache('communications:list:*');
  }

  /**
   * 获取待跟进提醒列表
   */
  async getPendingFollowUps(createdById?: string) {
    const where: Prisma.CommunicationLogWhereInput = {
      followUpAt: { not: null },
    };

    if (createdById) {
      where.createdById = createdById;
    }

    return prisma.communicationLog.findMany({
      where,
      orderBy: { followUpAt: 'asc' },
      include: {
        candidate: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }
}

export const communicationService = new CommunicationService();
