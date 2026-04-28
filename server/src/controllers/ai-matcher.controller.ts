import type { Request, Response, NextFunction } from 'express';
import { recommendCandidatesForJob } from '../services/ai-matcher.service';

/**
 * AI 人岗匹配控制器
 */

export async function getRecommendations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jobId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;

    const recommendations = await recommendCandidatesForJob(jobId, limit);

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    next(error);
  }
}
