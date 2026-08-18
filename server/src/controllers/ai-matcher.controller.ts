import type { Request, Response, NextFunction } from 'express';
import { recommendCandidatesForJob } from '../services/ai-matcher.service';
import { scopeFromUser } from '../services/candidate-visibility.service';

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

    // 可见性范围由 JWT 用户信息构建，实际过滤逻辑集中在 service 层
    const recommendations = await recommendCandidatesForJob(
      jobId,
      limit,
      scopeFromUser(req.user!)
    );

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    next(error);
  }
}
