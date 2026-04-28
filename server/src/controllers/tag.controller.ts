import type { Request, Response, NextFunction } from 'express';
import * as tagService from '../services/tag.service';

export class TagController {
  /**
   * GET /api/tags
   * 获取所有标签
   */
  async getTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category } = req.query;
      const tags = await tagService.getTags(category as string | undefined);
      res.json({ success: true, data: tags });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/tags
   * 创建标签
   */
  async createTag(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tag = await tagService.createTag(req.body, req.user?.userId);
      res.status(201).json({ success: true, data: tag });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/tags/:id
   * 更新标签
   */
  async updateTag(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const tag = await tagService.updateTag(id, req.body);
      res.json({ success: true, data: tag });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/tags/:id
   * 删除标签
   */
  async deleteTag(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await tagService.deleteTag(id);
      res.json({ success: true, message: '标签已删除' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/tags/init-presets
   * 初始化预设标签
   */
  async initPresetTags(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await tagService.initPresetTags();
      res.json({ success: true, message: '预设标签初始化完成' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/candidates/:id/tags
   * 获取候选人的标签
   */
  async getCandidateTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const tags = await tagService.getCandidateTags(id);
      res.json({ success: true, data: tags.map((t) => t.tag) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/candidates/:id/tags
   * 设置候选人的标签（全量替换）
   */
  async setCandidateTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { tagIds } = req.body;
      const result = await tagService.setCandidateTags(id, tagIds || []);
      res.json({ success: true, data: result.map((t) => t.tag) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/jobs/:id/tags
   * 获取职位的标签
   */
  async getJobTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const tags = await tagService.getJobTags(id);
      res.json({ success: true, data: tags.map((t) => t.tag) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/jobs/:id/tags
   * 设置职位的标签（全量替换）
   */
  async setJobTags(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { tagIds } = req.body;
      const result = await tagService.setJobTags(id, tagIds || []);
      res.json({ success: true, data: result.map((t) => t.tag) });
    } catch (error) {
      next(error);
    }
  }
}

export const tagController = new TagController();
