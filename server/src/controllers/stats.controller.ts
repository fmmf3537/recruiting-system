import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { statsService } from '../services/stats.service';

/**
 * 统计控制器
 * 处理统计相关的 HTTP 请求
 */
export class StatsController {
  /**
   * GET /api/stats/dashboard
   * 数据看板统计
   */
  async getDashboard(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await statsService.getDashboardStats();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/workload
   * 工作量统计
   */
  async getWorkloadStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = statsService.parseDateRange(startDate, endDate);

      const stats = await statsService.getWorkloadStats(dateRange);

      res.json({
        success: true,
        data: stats,
        dateRange: {
          startDate: dateRange.startDate.toISOString().split('T')[0],
          endDate: dateRange.endDate.toISOString().split('T')[0],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/channel
   * 渠道效果分析
   */
  async getChannelStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = statsService.parseDateRange(startDate, endDate);

      const stats = await statsService.getChannelStats(dateRange);

      res.json({
        success: true,
        data: stats,
        dateRange: {
          startDate: dateRange.startDate.toISOString().split('T')[0],
          endDate: dateRange.endDate.toISOString().split('T')[0],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/jobs
   * 职位维度统计
   */
  async getJobStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = statsService.parseDateRange(startDate, endDate);

      const stats = await statsService.getJobStats(dateRange);

      res.json({
        success: true,
        data: stats,
        dateRange: {
          startDate: dateRange.startDate.toISOString().split('T')[0],
          endDate: dateRange.endDate.toISOString().split('T')[0],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/referral
   * 内推统计
   */
  async getReferralStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = statsService.parseDateRange(startDate, endDate);

      const stats = await statsService.getReferralStats(dateRange);

      res.json({
        success: true,
        data: stats,
        dateRange: {
          startDate: dateRange.startDate.toISOString().split('T')[0],
          endDate: dateRange.endDate.toISOString().split('T')[0],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/funnel
   * 招聘漏斗统计
   */
  async getFunnelStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = statsService.parseDateRange(startDate, endDate);

      const stats = await statsService.getFunnelStats(dateRange);

      res.json({
        success: true,
        data: stats,
        dateRange: {
          startDate: dateRange.startDate.toISOString().split('T')[0],
          endDate: dateRange.endDate.toISOString().split('T')[0],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/workload/export
   * 导出工作量统计 Excel
   */
  async exportWorkloadStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = (startDate && endDate) 
        ? statsService.parseDateRange(startDate, endDate)
        : undefined;

      // 使用 statsService 获取数据
      const exportData = await statsService.exportWorkloadStats(dateRange);
      const csvContent = '\uFEFF' + this.convertToCSV(exportData.headers, exportData.rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename.replace('.xlsx', '.csv')}"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export workload stats error:', error);
      next(error);
    }
  }

  /**
   * GET /api/stats/channel/export
   * 导出渠道效果分析 Excel
   */
  async exportChannelStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = (startDate && endDate)
        ? statsService.parseDateRange(startDate, endDate)
        : undefined;

      const exportData = await statsService.exportChannelStats(dateRange);

      const csvContent = this.convertToCSV(exportData.headers, exportData.rows);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename.replace('.xlsx', '.csv')}"`);
      res.send('\uFEFF' + csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/stats/jobs/export
   * 导出职位维度统计 Excel
   */
  async exportJobStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = (startDate && endDate)
        ? statsService.parseDateRange(startDate, endDate)
        : undefined;

      const exportData = await statsService.exportJobStats(dateRange);

      const csvContent = this.convertToCSV(exportData.headers, exportData.rows);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename.replace('.xlsx', '.csv')}"`);
      res.send('\uFEFF' + csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 将数据转换为 CSV 格式
   */
  private convertToCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
    // 处理空数据情况
    if (!headers || headers.length === 0) {
      return '';
    }

    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) {
        return '';
      }
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.map(escapeCSV).join(',');
    
    if (!rows || rows.length === 0) {
      return headerLine;
    }
    
    const rowLines = rows.map((row) => row.map(escapeCSV).join(','));
    
    return [headerLine, ...rowLines].join('\n');
  }
}

// 导出单例实例
export const statsController = new StatsController();
