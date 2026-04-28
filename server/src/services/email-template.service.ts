import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * 邮件模板服务
 * 提供邮件模板的 CRUD 和变量渲染
 */

export interface CreateEmailTemplateInput {
  name: string;
  subject: string;
  body: string;
  variables?: string[];
}

export interface UpdateEmailTemplateInput {
  name?: string;
  subject?: string;
  body?: string;
  variables?: string[];
}

/**
 * 渲染模板（将 {{变量名}} 替换为实际值）
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
}

/**
 * 创建邮件模板
 */
export async function createEmailTemplate(
  data: CreateEmailTemplateInput,
  createdById: string
) {
  const template = await prisma.emailTemplate.create({
    data: {
      name: data.name,
      subject: data.subject,
      body: data.body,
      variables: data.variables || [],
      createdById,
    },
  });
  return template;
}

/**
 * 获取邮件模板列表
 */
export async function getEmailTemplates() {
  return prisma.emailTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * 获取单个邮件模板
 */
export async function getEmailTemplateById(id: string) {
  const template = await prisma.emailTemplate.findUnique({
    where: { id },
  });
  if (!template) {
    throw new AppError('邮件模板不存在', 404);
  }
  return template;
}

/**
 * 更新邮件模板
 */
export async function updateEmailTemplate(id: string, data: UpdateEmailTemplateInput) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('邮件模板不存在', 404);
  }

  return prisma.emailTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.variables !== undefined && { variables: data.variables }),
    },
  });
}

/**
 * 删除邮件模板
 */
export async function deleteEmailTemplate(id: string) {
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('邮件模板不存在', 404);
  }

  await prisma.emailTemplate.delete({ where: { id } });
}

/**
 * 根据模板渲染邮件内容
 */
export async function renderEmailByTemplate(
  templateId: string,
  variables: Record<string, string>
) {
  const template = await getEmailTemplateById(templateId);
  return {
    subject: renderTemplate(template.subject, variables),
    body: renderTemplate(template.body, variables),
  };
}
