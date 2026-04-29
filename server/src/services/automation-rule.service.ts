import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * 自动化邮件规则服务
 * 管理阶段流转触发自动邮件的规则配置
 */

export interface CreateAutomationRuleInput {
  triggerStage: string;
  triggerStatus: string;
  templateId: string;
  enabled?: boolean;
  description?: string;
}

export interface UpdateAutomationRuleInput {
  triggerStage?: string;
  triggerStatus?: string;
  templateId?: string;
  enabled?: boolean;
  description?: string;
}

/**
 * 获取自动化规则列表
 */
export async function getAutomationRules() {
  return prisma.automationRule.findMany({
    include: {
      template: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 获取单条规则
 */
export async function getAutomationRuleById(id: string) {
  const rule = await prisma.automationRule.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true } },
    },
  });
  if (!rule) {
    throw new AppError('自动化规则不存在', 404);
  }
  return rule;
}

/**
 * 创建自动化规则
 */
export async function createAutomationRule(data: CreateAutomationRuleInput) {
  // 检查模板是否存在
  const template = await prisma.emailTemplate.findUnique({
    where: { id: data.templateId },
  });
  if (!template) {
    throw new AppError('邮件模板不存在', 404);
  }

  return prisma.automationRule.create({
    data: {
      triggerStage: data.triggerStage,
      triggerStatus: data.triggerStatus,
      templateId: data.templateId,
      enabled: data.enabled ?? true,
      description: data.description,
    },
    include: {
      template: { select: { id: true, name: true } },
    },
  });
}

/**
 * 更新自动化规则
 */
export async function updateAutomationRule(id: string, data: UpdateAutomationRuleInput) {
  const existing = await prisma.automationRule.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('自动化规则不存在', 404);
  }

  if (data.templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: data.templateId },
    });
    if (!template) {
      throw new AppError('邮件模板不存在', 404);
    }
  }

  return prisma.automationRule.update({
    where: { id },
    data: {
      ...(data.triggerStage !== undefined && { triggerStage: data.triggerStage }),
      ...(data.triggerStatus !== undefined && { triggerStatus: data.triggerStatus }),
      ...(data.templateId !== undefined && { templateId: data.templateId }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.description !== undefined && { description: data.description }),
    },
    include: {
      template: { select: { id: true, name: true } },
    },
  });
}

/**
 * 删除自动化规则
 */
export async function deleteAutomationRule(id: string) {
  const existing = await prisma.automationRule.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('自动化规则不存在', 404);
  }

  await prisma.automationRule.delete({ where: { id } });
}

/**
 * 根据触发条件获取已启用的规则（供引擎调用）
 */
export async function getEnabledRulesByTrigger(stage: string, status: string) {
  return prisma.automationRule.findMany({
    where: {
      triggerStage: stage,
      triggerStatus: status,
      enabled: true,
    },
    include: {
      template: {
        select: { id: true, name: true, subject: true, body: true, variables: true },
      },
    },
  });
}
