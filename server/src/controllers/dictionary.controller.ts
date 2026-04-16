import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { dictionaryService } from '../services/dictionary.service';

export class DictionaryController {
  /**
   * GET /api/dictionaries
   * 查询字典列表
   */
  async getDictionaries(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const category = req.query.category as string | undefined;
      const includeDisabled = req.query.includeDisabled === 'true';
      const items = await dictionaryService.getDictionaries(category, includeDisabled);
      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dictionaries
   * 创建字典项
   */
  async createDictionary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const item = await dictionaryService.createDictionary(req.body);
      res.status(201).json({
        success: true,
        data: item,
        message: '创建成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/dictionaries/:id
   * 更新字典项
   */
  async updateDictionary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const item = await dictionaryService.updateDictionary(id, req.body);
      res.json({
        success: true,
        data: item,
        message: '更新成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/dictionaries/:id
   * 删除字典项
   */
  async deleteDictionary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      await dictionaryService.deleteDictionary(id);
      res.json({
        success: true,
        message: '删除成功',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dictionaryController = new DictionaryController();
