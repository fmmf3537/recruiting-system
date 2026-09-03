import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireMatrixPermission, requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { exportAdminReport, getAdminReport, getTeamRanking } from '../services/hr-score-report.service';
import { getMyCurrentRules, listRules, updateRule } from '../services/hr-score-rule.service';
import {
  canViewUserScores,
  formatDateISO,
  getMyScores,
  type ScorePeriod,
} from '../services/hr-score-snapshot.service';
import { normalizeUserRole } from '../services/role-permission.service';

const router: RouterType = Router();

const periodEnum = z.enum(['week', 'month', 'quarter', 'year', 'day']);

const myQuerySchema = z.object({
  period: periodEnum.optional().default('week'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  userId: z.string().max(50).optional(),
});

const periodQuerySchema = z.object({
  period: periodEnum.optional().default('week'),
});

const reportQuerySchema = z.object({
  period: periodEnum.optional().default('month'),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

const exportQuerySchema = z.object({
  period: periodEnum.optional().default('month'),
});

const ruleCodeParamSchema = z.object({
  code: z.string().min(1).max(50),
});

const updateRuleBodySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});

router.use(authenticate);

/**
 * GET /api/hr-score/my
 * 本人积分明细 + 周期聚合 + 排名。admin 可通过 userId 查看他人；hr 看他人 403。
 */
router.get(
  '/my',
  requireRole('hr', 'admin'),
  requireMatrixPermission('hr-score:read'),
  validate(myQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { period, page, pageSize, userId } = req.query as unknown as {
      period: ScorePeriod;
      page: number;
      pageSize: number;
      userId?: string;
    };
    const actorId = req.user!.userId;
    const targetUserId = userId || actorId;
    if (!canViewUserScores(req.user!.role, actorId, targetUserId)) {
      throw new AppError('无权查看他人积分明细', 403);
    }
    const result = await getMyScores(targetUserId, period, page, pageSize);
    const rules = await getMyCurrentRules();
    res.json({
      success: true,
      data: {
        events: result.events,
        aggregate: result.aggregate,
        rank: result.rank,
        rules,
      },
      pagination: result.pagination,
    });
  }),
);

/**
 * GET /api/hr-score/team
 * hr 看名次 + 自己的分，他人分数置空；admin 看全部分数。
 */
router.get(
  '/team',
  requireRole('hr', 'admin'),
  requireMatrixPermission('hr-score:read'),
  validate(periodQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { period } = req.query as unknown as { period: ScorePeriod };
    const rows = await getTeamRanking(period);
    const role = normalizeUserRole(req.user!.role);
    const selfId = req.user!.userId;
    const data = rows.map((row) => {
      const isSelf = row.userId === selfId;
      const showScore = role === 'admin' || isSelf;
      return {
        userId: row.userId,
        userName: row.userName,
        rank: row.rank,
        isSelf,
        totalScore: showScore ? row.totalScore : null,
        businessPts: showScore ? row.businessPts : null,
        processPts: showScore ? row.processPts : null,
      };
    });
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/hr-score/report
 * admin 报表：趋势 / 环比 / TopN。
 */
router.get(
  '/report',
  requireRole('admin'),
  validate(reportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { period, from, to } = req.query as unknown as {
      period: ScorePeriod;
      from?: string;
      to?: string;
    };
    const data = await getAdminReport(period, from, to);
    res.json({ success: true, data });
  }),
);

/**
 * GET /api/hr-score/export
 * admin 导出 CSV（UTF-8 BOM）。
 */
router.get(
  '/export',
  requireRole('admin'),
  validate(exportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { period } = req.query as unknown as { period: ScorePeriod };
    const csv = await exportAdminReport(period);
    const date = formatDateISO(new Date());
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=hr-score-${period}-${date}.csv`);
    res.send(csv);
  }),
);

/**
 * GET /api/hr-score/rules
 * admin 规则字典列表。
 */
router.get(
  '/rules',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const data = await listRules();
    res.json({ success: true, data });
  }),
);

/**
 * PATCH /api/hr-score/rules/:code
 * admin 启停用 / 调分值。已记分不追溯。
 */
router.patch(
  '/rules/:code',
  requireRole('admin'),
  validate(ruleCodeParamSchema, 'params'),
  validate(updateRuleBodySchema),
  asyncHandler(async (req, res) => {
    const { code } = req.params as { code: string };
    const data = await updateRule(code, req.body);
    res.json({ success: true, data });
  }),
);

export default router;
