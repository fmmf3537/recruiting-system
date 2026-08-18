import type { Request, Response, NextFunction } from 'express';
import * as onboardingTaskService from '../services/onboarding-task.service';
import { scopeFromUser } from '../services/candidate-visibility.service';

export async function getTasksByCandidate(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId } = req.params;
    // 可见性范围由 JWT 用户信息构建，实际过滤逻辑集中在 service 层
    const tasks = await onboardingTaskService.getTasksByCandidate(
      candidateId,
      scopeFromUser(req.user!)
    );
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await onboardingTaskService.createTask(req.body, scopeFromUser(req.user!));
    res.status(201).json({ success: true, data: task, message: '任务创建成功' });
  } catch (error) {
    next(error);
  }
}

export async function updateTask(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await onboardingTaskService.updateTask(req.params.id, req.body);
    res.json({ success: true, data: task, message: '任务更新成功' });
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction) {
  try {
    await onboardingTaskService.deleteTask(req.params.id);
    res.json({ success: true, message: '任务删除成功' });
  } catch (error) {
    next(error);
  }
}

export async function generateDefaultTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const { candidateId } = req.params;
    const tasks = await onboardingTaskService.generateDefaultTasks(
      candidateId,
      scopeFromUser(req.user!)
    );
    res.json({ success: true, data: tasks, message: '标准任务已生成' });
  } catch (error) {
    next(error);
  }
}
