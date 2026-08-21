import { Request, Response, NextFunction } from 'express';
import * as pipelineTemplateService from '../services/pipeline-template.service';

/**
 * 招聘流程模板控制器
 */
export class PipelineTemplateController {
  /**
   * GET /api/pipeline-templates
   * 模板列表（admin 管理用）
   */
  async getTemplates(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await pipelineTemplateService.getPipelineTemplates();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/pipeline-templates/stages?candidateId=xxx
   * 获取候选人适用的阶段数组（推进弹窗下拉用）；不传 candidateId 时返回默认模板阶段
   */
  async getStages(req: Request, res: Response, next: NextFunction) {
    try {
      const candidateId = req.query.candidateId as string | undefined;
      const stages = candidateId
        ? await pipelineTemplateService.getCandidatePipelineStages(candidateId)
        : // 未指定候选人时返回全局默认模板阶段（批量推进等场景）
          await pipelineTemplateService.getDefaultPipelineStages();
      res.json({ success: true, data: stages });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/pipeline-templates
   * 新建模板（admin）
   */
  async createTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await pipelineTemplateService.createPipelineTemplate(req.body);
      res.status(201).json({ success: true, data, message: '模板创建成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/pipeline-templates/:id
   * 更新模板（admin，含启停用、阶段排序）
   */
  async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await pipelineTemplateService.updatePipelineTemplate(req.params.id, req.body);
      res.json({ success: true, data, message: '模板更新成功' });
    } catch (error) {
      next(error);
    }
  }
}

export const pipelineTemplateController = new PipelineTemplateController();
