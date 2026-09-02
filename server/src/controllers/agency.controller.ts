import type { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  createAgency,
  updateAgency,
  listAgencies,
  createAgencyLink,
  disableAgencyLink,
  getAgencyStats,
} from '../services/agency.service';

// F5-S：猎头机构管理控制器（薄壳）
// 仅做参数取用 → 调 service → 统一响应格式

class AgencyController {
  /** POST /api/agencies */
  createAgency = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.user!.userId;
    const agency = await createAgency(req.body, userId);
    res.status(201).json({ success: true, message: '机构创建成功', data: agency });
  });

  /** PATCH /api/agencies/:id */
  updateAgency = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const agency = await updateAgency(id, req.body);
    res.json({ success: true, message: '机构更新成功', data: agency });
  });

  /** GET /api/agencies */
  listAgencies = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const agencies = await listAgencies();
    res.json({ success: true, data: agencies });
  });

  /** POST /api/agencies/:id/links */
  createLink = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const link = await createAgencyLink(id, req.body, userId);
    res.status(201).json({ success: true, message: '链接生成成功', data: link });
  });

  /** DELETE /api/agencies/links/:linkId */
  disableLink = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { linkId } = req.params;
    const userId = req.user!.userId;
    await disableAgencyLink(linkId, userId);
    res.json({ success: true, message: '链接已停用' });
  });

  /** GET /api/agencies/:id/stats */
  getStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const stats = await getAgencyStats(id);
    res.json({ success: true, data: stats });
  });
}

export const agencyController = new AgencyController();