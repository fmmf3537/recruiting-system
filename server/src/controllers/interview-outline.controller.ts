import type { Request, Response, NextFunction } from 'express';

import { logger } from '../lib/logger';
import { scopeFromUser } from '../services/candidate-visibility.service';
import {
  finalizeOutline,
  generateOutline,
  listOutlines,
} from '../services/interview-outline.service';

/**
 * 面试问题大纲控制器（F3-S）
 * - POST  /api/interviews/:id/question-outline  生成/再生成
 * - GET   /api/interviews/:id/question-outlines 版本列表
 * - PATCH /api/interviews/:id/question-outline/:version 手动定稿
 * 三接口均走 service 层做权限 / 字典 / 版本上限校验
 */
export class InterviewOutlineController {
  /** 生成/再生成大纲 */
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.user!;
      const result = await generateOutline(
        id,
        req.body as { focusType: string; adjustNote?: string },
        { userId: user.userId, role: user.role, department: user.department },
        scopeFromUser(user),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, '[InterviewOutline] generate 失败');
      next(error);
    }
  }

  /** 版本列表 */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.user!;
      const result = await listOutlines(
        id,
        { userId: user.userId, role: user.role, department: user.department },
        scopeFromUser(user),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** 手动定稿 */
  async finalize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, version } = req.params;
      const user = req.user!;
      const result = await finalizeOutline(
        id,
        Number(version),
        (req.body as { outline: unknown }).outline,
        { userId: user.userId, role: user.role, department: user.department },
        scopeFromUser(user),
      );
      res.json({ success: true, data: result, message: '大纲已定稿' });
    } catch (error) {
      logger.error({ err: error }, '[InterviewOutline] finalize 失败');
      next(error);
    }
  }
}

export const interviewOutlineController = new InterviewOutlineController();