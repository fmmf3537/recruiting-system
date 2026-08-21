import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { STAGE_ORDER } from '../constants';

/**
 * 招聘流程模板服务
 * 支持按职位类型自定义招聘阶段（如校招含「笔试」、实习仅一轮面试）。
 * 阶段解析优先级：职位指定模板 → 该职位 type 的默认模板 → 全局默认模板 → STAGE_ORDER 常量兜底
 */

// 阶段数组解析：stages 为 Json 字段，结构约定为字符串数组
export function parseStages(stages: unknown): string[] {
  if (!Array.isArray(stages)) {
    return [];
  }
  return stages.filter((s): s is string => typeof s === 'string');
}

// 表为空（未 seed）时的兜底阶段，保持与历史七阶段一致
const FALLBACK_STAGES: string[] = [...STAGE_ORDER];

export interface PipelineTemplateInput {
  name: string;
  type: string;
  stages: string[];
  enabled?: boolean;
  isDefault?: boolean;
}

/**
 * 查询默认模板：优先该 type 的默认模板，其次全局任意默认模板
 */
async function findDefaultTemplate(type?: string) {
  if (type) {
    const typed = await prisma.pipelineTemplate.findFirst({
      where: { type, isDefault: true, enabled: true },
    });
    if (typed) {
      return typed;
    }
  }
  return prisma.pipelineTemplate.findFirst({
    where: { isDefault: true, enabled: true },
  });
}

/**
 * 解析候选人适用的招聘阶段（有序数组）
 * 规则：候选人关联的第一个职位指定了启用模板 → 用该模板；
 * 否则用该职位 type 的默认模板；未关联职位 → 全局默认模板；均无 → 七阶段常量兜底
 */
export async function getCandidatePipelineStages(candidateId: string): Promise<string[]> {
  const candidateJob = await prisma.candidateJob.findFirst({
    where: { candidateId },
    include: { job: { include: { pipelineTemplate: true } } },
  });

  // 职位显式指定了启用中的模板
  const assigned = candidateJob?.job.pipelineTemplate;
  if (assigned?.enabled) {
    const stages = parseStages(assigned.stages);
    if (stages.length > 0) {
      return stages;
    }
  }

  // 回退默认模板（优先职位 type，未关联职位时查全局默认）
  const defaultTemplate = await findDefaultTemplate(candidateJob?.job.type);
  const stages = defaultTemplate ? parseStages(defaultTemplate.stages) : [];
  return stages.length > 0 ? stages : FALLBACK_STAGES;
}

/**
 * 获取全局默认模板阶段（批量推进等不针对单个候选人的场景）
 */
export async function getDefaultPipelineStages(): Promise<string[]> {
  const defaultTemplate = await findDefaultTemplate();
  const stages = defaultTemplate ? parseStages(defaultTemplate.stages) : [];
  return stages.length > 0 ? stages : FALLBACK_STAGES;
}

/**
 * 模板列表（管理页用，含禁用）
 */
export async function getPipelineTemplates() {
  return prisma.pipelineTemplate.findMany({
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * 新建模板
 * 若设为默认模板，先清除同 type 下其他模板的默认标记
 */
export async function createPipelineTemplate(data: PipelineTemplateInput) {
  if (data.stages.length === 0) {
    throw new AppError('阶段列表不能为空', 400);
  }
  if (data.isDefault) {
    await prisma.pipelineTemplate.updateMany({
      where: { type: data.type, isDefault: true },
      data: { isDefault: false },
    });
  }
  return prisma.pipelineTemplate.create({
    data: {
      name: data.name,
      type: data.type,
      stages: data.stages,
      enabled: data.enabled ?? true,
      isDefault: data.isDefault ?? false,
    },
  });
}

/**
 * 更新模板（含启停用、阶段排序调整）
 */
export async function updatePipelineTemplate(id: string, data: Partial<PipelineTemplateInput>) {
  const existing = await prisma.pipelineTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('模板不存在', 404);
  }
  if (data.stages && data.stages.length === 0) {
    throw new AppError('阶段列表不能为空', 400);
  }
  // 设为默认模板时，清除同 type 下其他模板的默认标记
  if (data.isDefault) {
    await prisma.pipelineTemplate.updateMany({
      where: { type: data.type ?? existing.type, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }
  return prisma.pipelineTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.stages !== undefined && { stages: data.stages }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  });
}
