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
      console.error('【创建候选人错误】', error);
      next(error);
    }
  }

  /**
   * GET /api/candidates/:id
   * 候选人详情（含流程记录、面试反馈、Offer 信息）
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
   * POST /api/candidates/parse-resume
   * 解析简历
   */
  async parseResume(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          success: false,
          message: '请上传简历文件',
        });
        return;
      }

      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        res.status(400).json({
          success: false,
          message: '只支持 PDF 和 DOCX 格式的简历',
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          message: '简历文件大小不能超过 10MB',
        });
        return;
      }

      const { parseResume } = await import('../services/resume-parser.service');
      const result = await parseResume(file.buffer, file.mimetype);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const errorMsg = `【简历解析错误】${new Date().toISOString()}\n${error}`;
      console.error(errorMsg);
      // 写入文件以便查看
      const fs = await import('fs');
      fs.appendFileSync('resume-parse-error.log', errorMsg + '\n\n');
      next(error);
    }
  }

  /**
   * DELETE /api/candidates/:id
   * 删除候选人（创建者或管理员）
   */
  async deleteCandidate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      await candidateService.deleteCandidate(id, userId, isAdmin);

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
