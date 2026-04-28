import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  getTasksByCandidate,
  createTask,
  updateTask,
  deleteTask,
  generateDefaultTasks,
} from '../controllers/onboarding-task.controller';

const router: RouterType = Router();

const candidateIdParamSchema = z.object({
  candidateId: z.string().cuid('无效的候选人ID'),
});

const taskIdParamSchema = z.object({
  id: z.string().cuid('无效的任务ID'),
});

const createTaskSchema = z.object({
  candidateId: z.string().cuid('无效的候选人ID'),
  title: z.string().min(1, '任务名称不能为空'),
  category: z.string().min(1, '分类不能为空'),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  dueDate: z.string().optional(),
  note: z.string().optional(),
});

// 获取候选人的入职任务
router.get(
  '/candidates/:candidateId',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  getTasksByCandidate
);

// 创建任务
router.post('/', authenticate, validate(createTaskSchema), createTask);

// 更新任务
router.patch('/:id', authenticate, validate(taskIdParamSchema, 'params'), validate(updateTaskSchema), updateTask);

// 删除任务
router.delete('/:id', authenticate, validate(taskIdParamSchema, 'params'), deleteTask);

// 批量生成标准任务
router.post(
  '/candidates/:candidateId/generate',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  generateDefaultTasks
);

export default router;
