import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middleware/errorHandler';
import { dictionaryService } from '../services/dictionary.service';
import { parseXlsxImportRows } from '../utils/xlsx-import';

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

  /**
   * GET /api/dictionaries/categories
   * 分类清单（登录可读）：内置分类 ∪ 库中已有分类
   */
  async getCategories(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await dictionaryService.getCategories();
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/dictionaries/import
   * 批量导入 Excel（仅 admin）
   */
  async importDictionaries(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const file = req.file;
      if (!file?.buffer) {
        throw new AppError('文件缺失', 400);
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      if (ext !== '.xlsx' && ext !== '.xls') {
        throw new AppError('不支持的文件类型，仅支持 xlsx/xls 文件', 400);
      }

      const detected = await fileTypeFromBuffer(file.buffer);
      // 校验策略：真实 xlsx/.xls 的 magic bytes 一定能被 file-type 识别（zip 头 PK）。
      // 识别不出 = 伪造或非 Excel 内容 → 直接拒绝，不信任 multer 按扩展名猜的 mimetype。
      // xlsx 偶发被识别为 application/zip → 仅当扩展名为 .xlsx 时接受。
      const allowedMimes = new Set([
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ]);
      const mimeOk =
        !!detected?.mime &&
        (allowedMimes.has(detected.mime) ||
          (detected.mime === 'application/zip' && ext === '.xlsx'));
      if (!mimeOk) {
        throw new AppError('不支持的文件类型，仅支持 xlsx/xls 文件', 400);
      }

      const parsed = await parseXlsxImportRows(file.buffer);
      if (!parsed.rows.length) {
        throw new AppError('文件没有有效数据行', 400);
      }

      const data = await dictionaryService.importDictionaries(
        parsed.rows,
        req.user!.userId,
        parsed.skipped
      );
      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dictionaryController = new DictionaryController();
