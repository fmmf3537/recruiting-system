import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { statsController } from '../controllers/stats.controller';
import { statsService } from '../services/stats.service';

import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// ============ 验证 Schema 定义 ============

// 日期范围查询验证 Schema
const dateRangeQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD').optional(),
});

// ============ 辅助函数 ============

/**
 * 将数据转换为 CSV 格式
 */
function convertToCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
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

// ============ 路由定义 ============

/**
 * GET /api/stats/dashboard
 * 数据看板：核心 KPI + 近 7 天新增候选人趋势
 * 权限：登录用户
 */
router.get(
  '/dashboard',
  authenticate,
  statsController.getDashboard
);

/**
 * GET /api/stats/workload/export
 * 导出工作量统计 CSV
 * 权限：登录用户
 */
router.get(
  '/workload/export',
  authenticate,
  async (_req, res, next) => {
    try {
      const stats = await statsService.getWorkloadStats(undefined);
      const rows = stats.map((s) => [
        s.userName,
        s.newCandidates,
        s.stageAdvances,
        s.interviews,
        s.offers,
      ]);
      
      const csvContent = '\uFEFF成员,新增候选人,阶段推进,面试次数,发放 Offer\n' + 
        rows.map(r => r.join(',')).join('\n');
      const filename = `工作量统计_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/stats/workload
 * 工作量统计
 * 权限：登录用户
 */
router.get(
  '/workload',
  authenticate,
  validate(dateRangeQuerySchema, 'query'),
  statsController.getWorkloadStats
);

/**
 * GET /api/stats/channel/export
 * 导出渠道效果分析 CSV
 * 权限：登录用户
 */
router.get(
  '/channel/export',
  authenticate,
  async (req, res, next) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = (startDate && endDate) 
        ? statsService.parseDateRange(startDate, endDate)
        : undefined;

      const stats = await statsService.getChannelStats(dateRange);
      
      const headers = ['渠道', '候选人数量', '入职数量', '转化率(%)'];
      const rows = stats.map((s) => [
        s.source,
        s.candidateCount,
        s.hiredCount,
        s.conversionRate,
      ]);
      
      const csvContent = '\uFEFF' + convertToCSV(headers, rows);
      const filename = `渠道效果分析_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/stats/channel
 * 渠道效果分析
 * 权限：登录用户
 */
router.get(
  '/channel',
  authenticate,
  validate(dateRangeQuerySchema, 'query'),
  statsController.getChannelStats
);

/**
 * GET /api/stats/jobs/export
 * 导出职位维度统计 CSV
 * 权限：登录用户
 */
router.get(
  '/jobs/export',
  authenticate,
  async (req, res, next) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const dateRange = (startDate && endDate) 
        ? statsService.parseDateRange(startDate, endDate)
        : undefined;

      const stats = await statsService.getJobStats(dateRange);
      
      const headers = ['职位', '部门', '候选人', '面试', 'Offer', '入职'];
      const rows = stats.map((s) => [
        s.jobTitle,
        s.department,
        s.candidateCount,
        s.interviewCount,
        s.offerCount,
        s.hiredCount,
      ]);
      
      const csvContent = '\uFEFF' + convertToCSV(headers, rows);
      const filename = `职位维度统计_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(csvContent);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/stats/jobs
 * 职位维度统计
 * 权限：登录用户
 */
router.get(
  '/jobs',
  authenticate,
  validate(dateRangeQuerySchema, 'query'),
  statsController.getJobStats
);

/**
 * GET /api/stats/funnel
 * 招聘漏斗统计
 * 权限：登录用户
 */
router.get(
  '/funnel',
  authenticate,
  validate(dateRangeQuerySchema, 'query'),
  statsController.getFunnelStats
);

export default router;
