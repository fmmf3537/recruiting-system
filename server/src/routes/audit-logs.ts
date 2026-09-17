import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';

const router: RouterType = Router();
const querySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  pageSize: z.string().optional().default('20').transform(Number),
  keyword: z.string().max(100).optional(),
  action: z.string().max(60).optional(),
  targetType: z.string().max(60).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

router.get('/', authenticate, authorize('admin'), validate(querySchema, 'query'), asyncHandler(async (req, res) => {
  const { page, pageSize, keyword, action, targetType, startDate, endDate } = req.query as unknown as z.infer<typeof querySchema>;
  const where = {
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...((startDate || endDate) ? { createdAt: { ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}), ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}) } } : {}),
    ...(keyword ? { user: { OR: [{ name: { contains: keyword, mode: 'insensitive' as const } }, { email: { contains: keyword, mode: 'insensitive' as const } }] } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.operationLog.findMany({ where, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.operationLog.count({ where }),
  ]);
  res.json({ success: true, data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}));

export default router;
