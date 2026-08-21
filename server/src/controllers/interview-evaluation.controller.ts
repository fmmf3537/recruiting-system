import type { Request, Response, NextFunction } from 'express';
import { interviewEvaluationService } from '../services/interview-evaluation.service';

/**
 * 面试评估控制器
 */
export class InterviewEvaluationController {
  /**
   * GET /api/evaluations/my
   * 我的评估列表（面试官视角）
   */
  async getMyEvaluations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
        status: req.query.status as 'pending' | 'submitted' | undefined,
      };

      const result = await interviewEvaluationService.getMyEvaluations(req.user!.userId, query);

      res.json({
        success: true,
        data: result.evaluations,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/evaluations/:id
   * 面试官本人提交/修改评估
   */
  async submitEvaluation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const evaluation = await interviewEvaluationService.submitEvaluation(
        req.params.id,
        req.user!.userId,
        req.body,
      );

      res.json({
        success: true,
        data: evaluation,
        message: '评估提交成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/interviews/:id/evaluations
   * 面试详情聚合各面试官评估
   */
  async getInterviewEvaluations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const evaluations = await interviewEvaluationService.getEvaluationsByInterview(
        req.params.id,
      );

      res.json({
        success: true,
        data: evaluations,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const interviewEvaluationController = new InterviewEvaluationController();
