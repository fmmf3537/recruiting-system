import type { Request, Response, NextFunction } from 'express';
import * as hcRequestService from '../services/hc-request.service';

/**
 * HC编制需求控制器
 */
class HCRequestController {
  /**
   * GET /api/hc-requests — 列表
   */
  async getHCRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hcRequestService.getHCRequests({
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 10,
        status: req.query.status as string,
        department: req.query.department as string,
        keyword: req.query.keyword as string,
        userId: req.user!.userId,
        isAdmin: req.user!.role === 'admin',
      });
      res.json({
        success: true,
        data: result.data,
        pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/hc-requests/:id — 详情
   */
  async getHCRequestById(req: Request, res: Response, next: NextFunction) {
    try {
      const hc = await hcRequestService.getHCRequestById(req.params.id);
      res.json({ success: true, data: hc });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hc-requests — 创建
   */
  async createHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const hc = await hcRequestService.createHCRequest(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: hc, message: '编制申请创建成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/hc-requests/:id — 更新
   */
  async updateHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const hc = await hcRequestService.updateHCRequest(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: hc, message: '编制申请更新成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hc-requests/:id/submit — 提交审批
   */
  async submitHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      await hcRequestService.submitHCRequest(req.params.id, req.user!.userId);
      res.json({ success: true, message: '申请已提交审批' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hc-requests/:id/approve — 审批通过
   */
  async approveHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const hc = await hcRequestService.approveHCRequest(
        req.params.id,
        req.user!.userId,
        req.body.note
      );
      res.json({ success: true, data: hc, message: '审批通过' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hc-requests/:id/reject — 驳回
   */
  async rejectHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const hc = await hcRequestService.rejectHCRequest(
        req.params.id,
        req.user!.userId,
        req.body.note
      );
      res.json({ success: true, data: hc, message: '已驳回' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/hc-requests/:id/create-job — 一键创建职位
   */
  async createJobFromHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await hcRequestService.createJobFromHCRequest(req.params.id, req.user!.userId);
      res.json({ success: true, data: result, message: '职位创建成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/hc-requests/:id — 删除
   */
  async deleteHCRequest(req: Request, res: Response, next: NextFunction) {
    try {
      await hcRequestService.deleteHCRequest(req.params.id, req.user!.userId, req.user!.role === 'admin');
      res.json({ success: true, message: '删除成功' });
    } catch (error) {
      next(error);
    }
  }
}

export const hcRequestController = new HCRequestController();
