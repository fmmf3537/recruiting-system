import type { Response, NextFunction } from 'express';
import { candidateService } from '../services/candidate.service';
import type { Request } from 'express';

/**
 * 候选人控制器
 * 处理候选人相关的 HTTP 请求
 */
export class CandidateController {
  /**
   * POST /api/candidates
   * 新增候选人（含查重逻辑）
   */
  async createCandidate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await candidateService.createCandidate(req.body, userId);

      // 如果有重复，返回警告信息
      if (result.warning && result.duplicates) {
        res.status(201).json({
          success: true,
          data: result.candidate,
          warning: result.warning,
          duplicates: result.duplicates,
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: result.candidate,
        message: '候选人创建成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/candidates
   * 候选人列表（支持分页和多条件筛选）
   */
  async getCandidates(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
        keyword: req.query.keyword as string | undefined,
        source: req.query.source as string | undefined,
        stage: req.query.stage as string | undefined,
        status: req.query.status as string | undefined,
        education: req.query.education as string | undefined,
        workYearsMin: req.query.workYearsMin ? parseInt(req.query.workYearsMin as string, 10) : undefined,
        workYearsMax: req.query.workYearsMax ? parseInt(req.query.workYearsMax as string, 10) : undefined,
        jobId: req.query.jobId as string | undefined,
      };

      const result = await candidateService.getCandidates(query);

      res.json({
        success: true,
        data: result.candidates,
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
   * GET /api/candidates/:id
   * 候选人详情（含流程记录、面试反馈、Offer 信息）
   */
  async getCandidateById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const candidate = await candidateService.getCandidateById(id);

      res.json({
        success: true,
        data: candidate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/candidates/:id
   * 编辑候选人
   */
  async updateCandidate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const candidate = await candidateService.updateCandidate(id, req.body);

      res.json({
        success: true,
        data: candidate,
        message: '候选人更新成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/candidates/:id/stage
   * 推进候选人流程（必须按顺序验证）
   */
  async advanceStage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      await candidateService.advanceStage(id, req.body, userId);

      res.json({
        success: true,
        message: '流程推进成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/candidates/:id/feedback
   * 添加面试反馈
   */
  async addInterviewFeedback(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      await candidateService.addInterviewFeedback(id, req.body, userId);

      res.status(201).json({
        success: true,
        message: '面试反馈添加成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/candidates/:id/feedback
   * 获取面试反馈列表
   */
  async getInterviewFeedbacks(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const feedbacks = await candidateService.getInterviewFeedbacks(id);

      res.json({
        success: true,
        data: feedbacks,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/candidates/:id
   * 删除候选人（仅管理员）
   */
  async deleteCandidate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      await candidateService.deleteCandidate(id);

      res.json({
        success: true,
        message: '候选人删除成功',
      });
    } catch (error) {
      next(error);
    }
  }
}

// 导出单例实例
export const candidateController = new CandidateController();
