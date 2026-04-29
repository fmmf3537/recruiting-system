import type { Request, Response, NextFunction } from 'express';
import * as automationRuleService from '../services/automation-rule.service';

/**
 * 自动化邮件规则控制器
 */
class AutomationRuleController {
  /**
   * GET /api/automation-rules
   * 获取规则列表
   */
  async getRules(_req: Request, res: Response, next: NextFunction) {
    try {
      const rules = await automationRuleService.getAutomationRules();
      res.json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/automation-rules/:id
   * 获取单条规则
   */
  async getRuleById(req: Request, res: Response, next: NextFunction) {
    try {
      const rule = await automationRuleService.getAutomationRuleById(req.params.id);
      res.json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/automation-rules
   * 创建规则
   */
  async createRule(req: Request, res: Response, next: NextFunction) {
    try {
      const rule = await automationRuleService.createAutomationRule(req.body);
      res.status(201).json({ success: true, data: rule, message: '规则创建成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/automation-rules/:id
   * 更新规则
   */
  async updateRule(req: Request, res: Response, next: NextFunction) {
    try {
      const rule = await automationRuleService.updateAutomationRule(
        req.params.id,
        req.body
      );
      res.json({ success: true, data: rule, message: '规则更新成功' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/automation-rules/:id
   * 删除规则
   */
  async deleteRule(req: Request, res: Response, next: NextFunction) {
    try {
      await automationRuleService.deleteAutomationRule(req.params.id);
      res.json({ success: true, message: '规则删除成功' });
    } catch (error) {
      next(error);
    }
  }
}

export const automationRuleController = new AutomationRuleController();
