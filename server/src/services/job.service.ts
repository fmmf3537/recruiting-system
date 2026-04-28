import type { Job, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { sanitizeHtml } from '../utils/sanitize';

// 职位列表查询参数类型
export interface JobListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  type?: string;
  location?: string;
  department?: string;
  createdBy?: string;
}

// 创建职位参数类型
export interface CreateJobInput {
  title: string;
  departments: string[];
  level: string;
  skills: string[];
  location: string;
  type: string;
  description: string;
  requirements: string;
  status?: string;
  tagIds?: string[];
}

// 更新职位参数类型
export interface UpdateJobInput {
  title?: string;
  departments?: string[];
  level?: string;
  skills?: string[];
  location?: string;
  type?: string;
  description?: string;
  requirements?: string;
  status?: string;
  tagIds?: string[];
}

// 职位列表返回类型
export interface JobListResult {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 职位服务类
 * 封装所有职位相关的业务逻辑
 */
export class JobService {
  /**
   * 创建职位
   */
  async createJob(data: CreateJobInput, createdById: string): Promise<Job> {
    const job = await prisma.job.create({
      data: {
        title: data.title,
        departments: data.departments,
        level: data.level,
        skills: data.skills,
        location: data.location,
        type: data.type,
        status: data.status || 'open',
        description: sanitizeHtml(data.description),
        requirements: sanitizeHtml(data.requirements),
        createdById,
      },
      select: {
        id: true,
        title: true,
        departments: true,
        level: true,
        skills: true,
        location: true,
        type: true,
        status: true,
        description: true,
        requirements: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 如果有标签，创建标签关联
    if (data.tagIds && data.tagIds.length > 0) {
      await prisma.jobTag.createMany({
        data: data.tagIds.map((tagId) => ({ jobId: job.id, tagId })),
        skipDuplicates: true,
      });
    }

    await clearListCache('jobs:list:*');
    return job;
  }

  /**
   * 获取职位列表（支持分页和多条件筛选）
   */
  async getJobs(query: JobListQuery, userId?: string, isAdmin?: boolean): Promise<JobListResult> {
    const {
      page = 1,
      pageSize = 10,
      keyword,
      status,
      type,
      location,
      department,
      createdBy,
    } = query;

    const cacheKey = `jobs:list:${JSON.stringify({ ...query, userId, isAdmin })}`;
    const cached = await getFromCache<JobListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const where: Prisma.JobWhereInput = {};

    // 关键词搜索（标题）
    if (keyword) {
      where.title = {
        contains: keyword,
        mode: 'insensitive',
      };
    }

    // 状态筛选
    if (status) {
      where.status = status;
    }

    // 类型筛选
    if (type) {
      where.type = type;
    }

    // 地域筛选
    if (location) {
      where.location = location;
    }

    // 部门筛选（JSON 数组中包含指定部门）
    // Prisma JSON 数组筛选需要使用 array_contains
    if (department) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (where as any).departments = {
        array_contains: [department],
      };
    }

    // 创建人筛选
    if (createdBy) {
      where.createdById = createdBy;
    }

    // 非管理员只能看到自己创建的职位
    if (!isAdmin && userId) {
      where.createdById = userId;
    }

    // 并行查询数据和总数
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          departments: true,
          level: true,
          skills: true,
          location: true,
          type: true,
          status: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              candidateJobs: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // 批量查询职位标签
    const jobIds = jobs.map((j) => j.id);
    const jobTags = await prisma.jobTag.findMany({
      where: { jobId: { in: jobIds } },
      include: { tag: true },
    });
    const tagsMap = new Map<string, typeof jobTags>();
    for (const jt of jobTags) {
      if (!tagsMap.has(jt.jobId)) {
        tagsMap.set(jt.jobId, []);
      }
      tagsMap.get(jt.jobId)!.push(jt);
    }

    const jobsWithTags = jobs.map((job) => ({
      ...job,
      tags: tagsMap.get(job.id)?.map((jt) => jt.tag) || [],
    }));

    const result = {
      jobs: jobsWithTags as unknown as Job[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await setCache(cacheKey, result, 30);
    return result;
  }

  /**
   * 获取职位详情
   */
  async getJobById(id: string, userId?: string, isAdmin?: boolean): Promise<Job & { _count?: { candidateJobs: number } }> {
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        departments: true,
        level: true,
        skills: true,
        location: true,
        type: true,
        status: true,
        description: true,
        requirements: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            candidateJobs: true,
          },
        },
      },
    });

    if (!job) {
      throw new AppError('职位不存在', 404);
    }

    // 权限检查：非管理员只能查看自己创建的职位
    if (!isAdmin && userId && job.createdById !== userId) {
      throw new AppError('没有权限查看此职位', 403);
    }

    const jobTags = await prisma.jobTag.findMany({
      where: { jobId: id },
      include: { tag: true },
    });

    return {
      ...job,
      tags: jobTags.map((jt) => jt.tag),
    } as unknown as Job & { _count?: { candidateJobs: number }; tags: Array<{ id: string; name: string; color: string }> };
  }

  /**
   * 更新职位
   */
  async updateJob(
    id: string,
    data: UpdateJobInput,
    userId: string,
    isAdmin?: boolean
  ): Promise<Job> {
    // 先查询职位
    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: { id: true, createdById: true, status: true },
    });

    if (!existingJob) {
      throw new AppError('职位不存在', 404);
    }

    // 权限检查：非管理员只能更新自己创建的职位
    if (!isAdmin && existingJob.createdById !== userId) {
      throw new AppError('没有权限更新此职位', 403);
    }

    // 已关闭的职位不能编辑
    if (existingJob.status === 'closed') {
      throw new AppError('已关闭的职位不能编辑', 400);
    }

    const updateData: Prisma.JobUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.departments !== undefined) updateData.departments = data.departments;
    if (data.level !== undefined) updateData.level = data.level;
    if (data.skills !== undefined) updateData.skills = data.skills;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.description !== undefined) updateData.description = sanitizeHtml(data.description);
    if (data.requirements !== undefined) updateData.requirements = sanitizeHtml(data.requirements);
    if (data.status !== undefined) updateData.status = data.status;

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        title: true,
        departments: true,
        level: true,
        skills: true,
        location: true,
        type: true,
        status: true,
        description: true,
        requirements: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 如果传了标签，更新标签关联
    if (data.tagIds !== undefined) {
      await prisma.jobTag.deleteMany({ where: { jobId: id } });
      if (data.tagIds.length > 0) {
        await prisma.jobTag.createMany({
          data: data.tagIds.map((tagId) => ({ jobId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    await clearListCache('jobs:list:*');
    return job;
  }

  /**
   * 关闭职位
   */
  async closeJob(id: string, userId: string, isAdmin?: boolean): Promise<Job> {
    // 先查询职位
    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: { id: true, createdById: true, status: true },
    });

    if (!existingJob) {
      throw new AppError('职位不存在', 404);
    }

    // 权限检查
    if (!isAdmin && existingJob.createdById !== userId) {
      throw new AppError('没有权限关闭此职位', 403);
    }

    // 已经是关闭状态
    if (existingJob.status === 'closed') {
      throw new AppError('职位已经是关闭状态', 400);
    }

    const job = await prisma.job.update({
      where: { id },
      data: { status: 'closed' },
      select: {
        id: true,
        title: true,
        departments: true,
        level: true,
        skills: true,
        location: true,
        type: true,
        status: true,
        description: true,
        requirements: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return job;
  }

  /**
   * 复制职位
   */
  async duplicateJob(id: string, userId: string): Promise<Job> {
    // 查询原职位
    const originalJob = await prisma.job.findUnique({
      where: { id },
    });

    if (!originalJob) {
      throw new AppError('职位不存在', 404);
    }

    // 创建新职位，标题添加"（副本）"
    const newJob = await prisma.job.create({
      data: {
        title: `${originalJob.title}（副本）`,
        departments: originalJob.departments as string[],
        level: originalJob.level,
        skills: originalJob.skills as string[],
        location: originalJob.location,
        type: originalJob.type,
        status: 'open', // 副本默认开启
        description: originalJob.description,
        requirements: originalJob.requirements,
        createdById: userId,
      },
      select: {
        id: true,
        title: true,
        departments: true,
        level: true,
        skills: true,
        location: true,
        type: true,
        status: true,
        description: true,
        requirements: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return newJob;
  }

  /**
   * 删除职位（仅管理员）
   * 有关联候选人的职位也可以删除，关联关系会被级联删除
   */
  async deleteJob(id: string): Promise<{ candidateCount: number }> {
    // 查询职位
    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingJob) {
      throw new AppError('职位不存在', 404);
    }

    // 检查关联候选人数量（用于前端警告）
    const candidateCount = await prisma.candidateJob.count({
      where: { jobId: id },
    });

    // 删除职位（关联的 candidateJob 记录会被级联删除）
    await prisma.job.delete({
      where: { id },
    });

    return { candidateCount };
  }

  /**
   * 检查用户是否有权限操作职位
   */
  async checkPermission(jobId: string, userId: string, isAdmin?: boolean): Promise<boolean> {
    if (isAdmin) return true;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { createdById: true },
    });

    if (!job) return false;

    return job.createdById === userId;
  }
}

// 导出单例实例
export const jobService = new JobService();
