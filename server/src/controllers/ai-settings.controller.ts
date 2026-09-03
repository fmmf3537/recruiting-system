import { Request, Response, NextFunction } from 'express';
import * as aiSettingsService from '../services/ai-settings.service';

/**
 * AI 提供方/密钥设置（admin）
 */
export class AiSettingsController {
  /**
   * GET /api/settings/ai-providers
   */
  async listProviders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await aiSettingsService.listProviders();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/settings/ai-providers/:provider
   */
  async updateProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await aiSettingsService.updateProvider(
        req.params.provider,
        req.body,
        req.user!.userId
      );
      res.json({ success: true, data, message: '保存成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/settings/ai-providers/test
   */
  async testConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await aiSettingsService.testConnection(req.body, req.user!.userId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const aiSettingsController = new AiSettingsController();
