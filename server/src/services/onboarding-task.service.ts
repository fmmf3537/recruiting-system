import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateOnboardingTaskInput {
  candidateId: string;
  title: string;
  category: string;
  assigneeId?: string;
  dueDate?: string;
  note?: string;
}

export interface UpdateOnboardingTaskInput {
  title?: string;
  category?: string;
  assigneeId?: string;
  status?: string;
  dueDate?: string;
  note?: string;
}

// 内置标准任务模板
export const DEFAULT_ONBOARDING_TASKS = [
  { title: '收集身份证复印件', category: '材料收集' },
  { title: '收集学历证书', category: '材料收集' },
  { title: '收集离职证明', category: '材料收集' },
  { title: '开通企业邮箱', category: 'IT准备' },
  { title: '配置办公电脑', category: 'IT准备' },
  { title: '开通系统账号', category: 'IT准备' },
  { title: '安排工位', category: '行政安排' },
  { title: '准备办公用品', category: '行政安排' },
  { title: '分配入职导师', category: '培训' },
  { title: '安排入职培训', category: '培训' },
];

export async function getTasksByCandidate(candidateId: string) {
  return prisma.onboardingTask.findMany({
    where: { candidateId },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createTask(data: CreateOnboardingTaskInput) {
  const candidate = await prisma.candidate.findUnique({ where: { id: data.candidateId } });
  if (!candidate) {
    throw new AppError('候选人不存在', 404);
  }

  return prisma.onboardingTask.create({
    data: {
      candidateId: data.candidateId,
      title: data.title,
      category: data.category,
      assigneeId: data.assigneeId,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      note: data.note,
    },
  });
}

export async function updateTask(id: string, data: UpdateOnboardingTaskInput) {
  const existing = await prisma.onboardingTask.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('任务不存在', 404);
  }

  return prisma.onboardingTask.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(data.note !== undefined && { note: data.note }),
    },
  });
}

export async function deleteTask(id: string) {
  const existing = await prisma.onboardingTask.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('任务不存在', 404);
  }

  await prisma.onboardingTask.delete({ where: { id } });
}

/**
 * 为候选人批量生成标准入职任务
 */
export async function generateDefaultTasks(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    throw new AppError('候选人不存在', 404);
  }

  const existingCount = await prisma.onboardingTask.count({ where: { candidateId } });
  if (existingCount > 0) {
    throw new AppError('该候选人已存在入职任务', 400);
  }

  await prisma.onboardingTask.createMany({
    data: DEFAULT_ONBOARDING_TASKS.map((t) => ({
      candidateId,
      title: t.title,
      category: t.category,
      status: 'pending',
    })),
  });

  return getTasksByCandidate(candidateId);
}
