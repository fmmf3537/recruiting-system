import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { offerService } from '../services/offer.service';
import { scopeFromUser } from '../services/candidate-visibility.service';

/**
 * Offer 控制器
 * 处理 Offer 相关的 HTTP 请求
 */
export class OfferController {
  /**
   * GET /api/offers
   * 获取 Offer 列表
   */
  async getOffers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
        result: req.query.result as string | undefined,
      };

      // 可见性范围由 JWT 用户信息构建，实际过滤逻辑集中在 service 层
      const result = await offerService.getOffers(query, scopeFromUser(req.user!));

      res.json({
        success: true,
        data: result.offers,
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
   * GET /api/offers/:candidateId
   * 获取某候选人 Offer
   */
  async getOfferByCandidateId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const offer = await offerService.getOfferByCandidateId(
        candidateId,
        scopeFromUser(req.user!)
      );

      res.json({
        success: true,
        data: offer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/offers
   * 创建 Offer
   */
  async createOffer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const offer = await offerService.createOffer(req.body, scopeFromUser(req.user!));

      res.status(201).json({
        success: true,
        data: offer,
        message: 'Offer 创建成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/offers/:candidateId
   * 更新 Offer（result=accepted 时自动推进到入职阶段）
   */
  async updateOffer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const offer = await offerService.updateOffer(
        candidateId,
        req.body,
        scopeFromUser(req.user!)
      );

      res.json({
        success: true,
        data: offer,
        message: 'Offer 更新成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/offers/:candidateId/result
   * 更新 Offer 结果
   */
  async updateOfferResult(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const { result } = req.body;
      const offer = await offerService.updateOfferResult(
        candidateId,
        result,
        scopeFromUser(req.user!)
      );

      res.json({
        success: true,
        data: offer,
        message: 'Offer 结果更新成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/offers/:candidateId/submit
   * 提交审批（draft/rejected → pending_approval）
   */
  async submitOfferApproval(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const { approverId } = req.body;
      const offer = await offerService.submitOfferApproval(
        candidateId,
        approverId,
        req.user!.userId,
        scopeFromUser(req.user!)
      );

      res.json({
        success: true,
        data: offer,
        message: '已提交审批',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/offers/:candidateId/approve
   * 审批通过（仅 admin 或指定审批人）
   */
  async approveOffer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const { note } = req.body;
      const offer = await offerService.approveOffer(
        candidateId,
        req.user!.userId,
        req.user!.role === 'admin',
        note
      );

      res.json({
        success: true,
        data: offer,
        message: '审批通过',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/offers/:candidateId/reject
   * 审批驳回（仅 admin 或指定审批人，需填写意见）
   */
  async rejectOffer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const { note } = req.body;
      const offer = await offerService.rejectOffer(
        candidateId,
        req.user!.userId,
        req.user!.role === 'admin',
        note
      );

      res.json({
        success: true,
        data: offer,
        message: '已驳回',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/offers/:candidateId/send
   * 标记已发送（approved → sent）
   */
  async markOfferSent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const offer = await offerService.markOfferSent(
        candidateId,
        req.user!.userId,
        scopeFromUser(req.user!)
      );

      res.json({
        success: true,
        data: offer,
        message: '已标记为已发送',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/offers/:candidateId/join
   * 标记入职
   */
  async markAsJoined(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      const { actualJoinDate } = req.body;
      const offer = await offerService.markAsJoined(
        candidateId,
        actualJoinDate,
        scopeFromUser(req.user!)
      );

      res.json({
        success: true,
        data: offer,
        message: '入职标记成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/offers/:candidateId
   * 删除 Offer
   */
  async deleteOffer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { candidateId } = req.params;
      await offerService.deleteOffer(candidateId, scopeFromUser(req.user!));

      res.json({
        success: true,
        message: 'Offer 删除成功',
      });
    } catch (error) {
      next(error);
    }
  }
}

// 导出单例实例
export const offerController = new OfferController();
