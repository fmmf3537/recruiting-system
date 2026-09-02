import type { Request, Response, NextFunction } from 'express';

import { logger } from '../lib/logger';
import { draftJd, polishJd } from '../services/jd-assist.service';

/**
 * JD 完善与辅助生成控制器（F1-S）
 * - POST /api/jobs/ai-polish 诊断 + 优化稿
 * - POST /api/jobs/ai-draft   从零生成草稿
 * 两个接口均不落库（PRD §4.4）：仅返回 AI 产出，由前端写入职位表单
 */
export class JdAssistController {
  /** 诊断 + 优化稿 */
  async polish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await polishJd(req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, '[JdAssist] polishJd 失败');
      next(error);
    }
  }

  /** 从零生成草稿 */
  async draft(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await draftJd(req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, '[JdAssist] draftJd 失败');
      next(error);
    }
  }
}

export const jdAssistController = new JdAssistController();