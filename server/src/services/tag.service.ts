import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateTagInput {
  name: string;
  color?: string;
  category?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
  category?: string;
}

// 预设标签
const PRESET_TAGS = [
  { name: '高潜', color: '#67C23A', category: 'preset' },
  { name: '优先跟进', color: '#E6A23C', category: 'preset' },
  { name: '期望过高', color: '#F56C6C', category: 'preset' },
  { name: '薪资不匹配', color: '#909399', category: 'preset' },
  { name: '异地接受', color: '#409EFF', category: 'preset' },
  { name: '可内推', color: '#9254DE', category: 'preset' },
];

/**
 * 获取所有标签
 */
export async function getTags(category?: string) {
  const where = category ? { category } : {};
  return prisma.tag.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

/**
 * 根据ID获取标签
 */
export async function getTagById(id: string) {
  return prisma.tag.findUnique({
    where: { id },
  });
}

/**
 * 创建标签
 */
export async function createTag(data: CreateTagInput, createdById?: string) {
  return prisma.tag.create({
    data: {
      name: data.name,
      color: data.color || '#409EFF',
      category: data.category || 'custom',
      createdById,
    },
  });
}

/**
 * 标签写权限校验：预设标签仅管理员可改删；自定义标签限创建者或管理员
 */
function assertTagWritable(
  tag: { category: string; createdById: string | null },
  userId: string,
  isAdmin: boolean
): void {
  if (isAdmin) return;
  if (tag.category === 'preset') {
    throw new AppError('预设标签仅管理员可修改或删除', 403);
  }
  if (tag.createdById !== userId) {
    throw new AppError('只能操作自己创建的标签', 403);
  }
}

/**
 * 更新标签（预设限管理员，自定义限创建者或管理员）
 */
export async function updateTag(
  id: string,
  data: UpdateTagInput,
  userId: string,
  isAdmin: boolean
) {
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) {
    throw new AppError('标签不存在', 404);
  }
  assertTagWritable(tag, userId, isAdmin);
  return prisma.tag.update({
    where: { id },
    data,
  });
}

/**
 * 删除标签（级联删除关联记录；预设限管理员，自定义限创建者或管理员）
 */
export async function deleteTag(id: string, userId: string, isAdmin: boolean) {
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) {
    throw new AppError('标签不存在', 404);
  }
  assertTagWritable(tag, userId, isAdmin);
  return prisma.tag.delete({
    where: { id },
  });
}

/**
 * 初始化预设标签（如果不存在）
 */
export async function initPresetTags() {
  const existing = await prisma.tag.findMany({
    where: { category: 'preset' },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((t) => t.name));

  const toCreate = PRESET_TAGS.filter((t) => !existingNames.has(t.name));
  if (toCreate.length > 0) {
    await prisma.tag.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
}

/**
 * 为候选人添加标签
 */
export async function addTagToCandidate(candidateId: string, tagId: string) {
  return prisma.candidateTag.create({
    data: { candidateId, tagId },
  });
}

/**
 * 移除候选人的标签
 */
export async function removeTagFromCandidate(candidateId: string, tagId: string) {
  return prisma.candidateTag.deleteMany({
    where: { candidateId, tagId },
  });
}

/**
 * 设置候选人的标签（全量替换）
 */
export async function setCandidateTags(candidateId: string, tagIds: string[]) {
  await prisma.candidateTag.deleteMany({
    where: { candidateId },
  });

  if (tagIds.length === 0) return [];

  await prisma.candidateTag.createMany({
    data: tagIds.map((tagId) => ({ candidateId, tagId })),
    skipDuplicates: true,
  });

  return prisma.candidateTag.findMany({
    where: { candidateId },
    include: { tag: true },
  });
}

/**
 * 获取候选人的标签
 */
export async function getCandidateTags(candidateId: string) {
  return prisma.candidateTag.findMany({
    where: { candidateId },
    include: { tag: true },
  });
}

/**
 * 为职位添加标签
 */
export async function addTagToJob(jobId: string, tagId: string) {
  return prisma.jobTag.create({
    data: { jobId, tagId },
  });
}

/**
 * 移除职位的标签
 */
export async function removeTagFromJob(jobId: string, tagId: string) {
  return prisma.jobTag.deleteMany({
    where: { jobId, tagId },
  });
}

/**
 * 设置职位的标签（全量替换）
 */
export async function setJobTags(jobId: string, tagIds: string[]) {
  await prisma.jobTag.deleteMany({
    where: { jobId },
  });

  if (tagIds.length === 0) return [];

  await prisma.jobTag.createMany({
    data: tagIds.map((tagId) => ({ jobId, tagId })),
    skipDuplicates: true,
  });

  return prisma.jobTag.findMany({
    where: { jobId },
    include: { tag: true },
  });
}

/**
 * 获取职位的标签
 */
export async function getJobTags(jobId: string) {
  return prisma.jobTag.findMany({
    where: { jobId },
    include: { tag: true },
  });
}
