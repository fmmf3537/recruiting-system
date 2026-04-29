import type { Request, Response, NextFunction } from 'express';
import { interviewSchedulerService } from '../services/interview-scheduler.service';

/**
 * 面试安排控制器
 */
export class InterviewController {
  /**
   * POST /api/interviews
   * 创建面试安排
   */
  async createInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const interview = await interviewSchedulerService.createInterview(req.body, userId);

      res.status(201).json({
        success: true,
        data: interview,
        message: '面试安排创建成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/interviews
   * 面试列表（支持分页和筛选）
   */
  async getInterviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
        candidateId: req.query.candidateId as string | undefined,
        jobId: req.query.jobId as string | undefined,
        status: req.query.status as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      };

      const result = await interviewSchedulerService.getInterviews(query);

      res.json({
        success: true,
        data: result.interviews,
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
   * GET /api/interviews/:id
   * 面试详情
   */
  async getInterviewById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await interviewSchedulerService.getInterviewById(req.params.id);

      res.json({
        success: true,
        data: interview,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/interviews/:id
   * 更新面试安排
   */
  async updateInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await interviewSchedulerService.updateInterview(
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        data: interview,
        message: '面试安排更新成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/interviews/:id/cancel
   * 取消面试
   */
  async cancelInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reason = req.body.reason as string | undefined;
      await interviewSchedulerService.cancelInterview(req.params.id, reason);

      res.json({
        success: true,
        message: '面试已取消',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/interviews/:id/complete
   * 标记面试完成
   */
  async completeInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await interviewSchedulerService.completeInterview(req.params.id);

      res.json({
        success: true,
        message: '面试已标记为完成，请及时录入面试反馈',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/candidates/:id/interviews
   * 获取候选人的面试安排列表
   */
  async getInterviewsByCandidate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const interviews = await interviewSchedulerService.getInterviewsByCandidate(
        req.params.id
      );

      res.json({
        success: true,
        data: interviews,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/interviews/conflicts
   * 查询面试官冲突
   */
  async getInterviewerConflicts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { interviewerId, startDate, endDate } = req.query;

      if (!interviewerId || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: '缺少必要参数：interviewerId, startDate, endDate',
        });
        return;
      }

      const conflicts = await interviewSchedulerService.getInterviewerConflicts(
        interviewerId as string,
        startDate as string,
        endDate as string
      );

      res.json({
        success: true,
        data: conflicts,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const interviewController = new InterviewController();
