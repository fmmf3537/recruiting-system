import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getRecommendations } from '../controllers/ai-matcher.controller';

const router: RouterType = Router();

const jobIdParamSchema = z.object({
  jobId: z.string().cuid('无效的职位ID'),
});

const querySchema = z.object({
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 5)),
});

/**
 * GET /api/ai-matcher/jobs/:jobId/recommendations
 * 为指定职位推荐匹配的候选人
 */
router.get(
  '/jobs/:jobId/recommendations',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  validate(querySchema, 'query'),
  getRecommendations
);

export default router;
