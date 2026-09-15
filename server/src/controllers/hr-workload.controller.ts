import type { NextFunction, Request, Response } from 'express';
import { hrWorkloadService, type HrWorkloadQuery } from '../services/hr-workload.service';

function queryFromReq(req: Request): HrWorkloadQuery {
  const q = req.query as {
    period: HrWorkloadQuery['period'];
    date: string;
    department?: string;
    hrId?: string;
  };
  return {
    period: q.period,
    date: q.date,
    department: q.department,
    hrId: q.hrId,
  };
}

/**
 * HR 工作负载监控控制器（只取参、调 service、写响应）
 */
export class HrWorkloadController {
  async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await hrWorkloadService.getOverview(queryFromReq(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getUserDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as unknown as {
        period: HrWorkloadQuery['period'];
        date: string;
        department?: string;
        hrId?: string;
        includeTimeline?: boolean;
        includeCandidates?: boolean;
      };
      const data = await hrWorkloadService.getUserDetail(req.params.hrId, {
        period: q.period,
        date: q.date,
        department: q.department,
        includeTimeline: q.includeTimeline,
        includeCandidates: q.includeCandidates,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async exportOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { buffer, filename } = await hrWorkloadService.exportOverview(
        queryFromReq(req),
        req.user!.userId,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
}

export const hrWorkloadController = new HrWorkloadController();
