import type { Request, Response, NextFunction } from 'express';
import { communicationService } from '../services/communication.service';

/**
 * 沟通记录控制器
 */
export class CommunicationController {
  /**
   * POST /api/communications
   * 创建沟通记录
   */
  async createCommunication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const log = await communicationService.createCommunication(req.body, userId);

      res.status(201).json({
        success: true,
        data: log,
        message: '沟通记录已添加',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/communications
   * 沟通记录列表
   */
  async getCommunications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        pageSize: req.query.pageSize
          ? parseInt(req.query.pageSize as string, 10)
          : undefined,
        candidateId: req.query.candidateId as string | undefined,
        type: req.query.type as string | undefined,
      };

      const result = await communicationService.getCommunications(query) as {
        communications: unknown[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };

      res.json({
        success: true,
        data: result.communications,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/candidates/:id/communications
   * 获取候选人的沟通记录
   */
  async getCommunicationsByCandidate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const logs = await communicationService.getCommunicationsByCandidate(
        req.params.id
      );

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/communications/:id
   * 更新沟通记录
   */
  async updateCommunication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const log = await communicationService.updateCommunication(
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        data: log,
        message: '沟通记录已更新',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/communications/:id
   * 删除沟通记录
   */
  async deleteCommunication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await communicationService.deleteCommunication(req.params.id);

      res.json({
        success: true,
        message: '沟通记录已删除',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/communications/follow-ups
   * 获取待跟进提醒列表
   */
  async getPendingFollowUps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.query.mine === 'true' ? req.user!.userId : undefined;
      const logs = await communicationService.getPendingFollowUps(userId);

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const communicationController = new CommunicationController();
