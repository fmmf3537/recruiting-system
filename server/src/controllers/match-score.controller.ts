import type { Request, Response, NextFunction } from 'express';

import { logger } from '../lib/logger';
import { scopeFromUser } from '../services/candidate-visibility.service';
import {
  listCandidateMatchScores,
  listJobMatchScores,
  scoreCandidateForJob,
} from '../services/match-score.service';

/**
 * 简历自动打分控制器（F2-S）
 * - POST /api/candidates/:id/match-score 手动触发（同步执行返回结果）
 * - GET  /api/candidates/:id/match-scores 候选人全部职位打分
 * - GET  /api/jobs/:id/match-scores       职位下候选人打分（按综合分降序）
 */
export class MatchScoreController {
  /** 手动触发打分（同步；前端 loading 等待完整结果） */
  async trigger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { jobId } = req.body as { jobId?: string };
      if (!jobId) {
        res.status(400).json({ success: false, error: '缺少 jobId' });
        return;
      }

      const result = await scoreCandidateForJob(id, jobId, {
        triggeredBy: 'manual',
        createdById: req.user!.userId,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, '[MatchScore] 手动触发打分失败');
      next(error);
    }
  }

  /** 候选人维度的打分列表 */
  async listByCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const scores = await listCandidateMatchScores(id, scopeFromUser(req.user!));
      res.json({ success: true, data: scores });
    } catch (error) {
      next(error);
    }
  }

  /** 职位维度的打分列表 */
  async listByJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const scores = await listJobMatchScores(id, scopeFromUser(req.user!));
      res.json({ success: true, data: scores });
    } catch (error) {
      next(error);
    }
  }
}

export const matchScoreController = new MatchScoreController();
