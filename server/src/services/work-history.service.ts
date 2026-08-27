import type { WorkHistory } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// WorkHistory 相关类型
export interface CreateWorkHistoryInput {
  candidateId: string;
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export class WorkHistoryService {
  /**
   * 创建工作经历
   */
  async createWorkHistory(data: CreateWorkHistoryInput): Promise<WorkHistory> {
    const { candidateId, ...historyData } = data;

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    return prisma.workHistory.create({
      data: {
        candidateId,
        company: historyData.company,
        position: historyData.position,
        startDate: historyData.startDate ? new Date(historyData.startDate) : null,
        endDate: historyData.endDate ? new Date(historyData.endDate) : null,
        description: historyData.description,
      },
    });
  }

  /**
   * 批量创建工作经历
   */
  async createWorkHistories(
    candidateId: string,
    histories: Array<{
      company: string;
      position: string;
      startDate?: string;
      endDate?: string;
      description?: string;
    }>
  ): Promise<WorkHistory[]> {
    if (histories.length === 0) {
      return [];
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    await prisma.workHistory.createMany({
      data: histories.map((h) => ({
        candidateId,
        company: h.company,
        position: h.position,
        startDate: h.startDate ? new Date(h.startDate) : null,
        endDate: h.endDate ? new Date(h.endDate) : null,
        description: h.description,
      })),
    });

    return prisma.workHistory.findMany({
      where: { candidateId },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * 获取候选人的工作经历列表
   */
  async getWorkHistories(candidateId: string): Promise<WorkHistory[]> {
    return prisma.workHistory.findMany({
      where: { candidateId },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * 更新工作经历
   */
  async updateWorkHistory(
    id: string,
    data: Partial<{
      company: string;
      position: string;
      startDate: string;
      endDate: string;
      description: string;
    }>
  ): Promise<WorkHistory> {
    const history = await prisma.workHistory.findUnique({
      where: { id },
    });

    if (!history) {
      throw new AppError('工作经历不存在', 404);
    }

    return prisma.workHistory.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  /**
   * 删除工作经历
   */
  async deleteWorkHistory(id: string): Promise<void> {
    const history = await prisma.workHistory.findUnique({
      where: { id },
    });

    if (!history) {
      throw new AppError('工作经历不存在', 404);
    }

    await prisma.workHistory.delete({
      where: { id },
    });
  }
}

export const workHistoryService = new WorkHistoryService();
