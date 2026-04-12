import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => ({
  default: {
    job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    candidateJob: {
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { JobService } from '../../src/services/job.service';
import { AppError } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

describe('JobService - 职位服务单元测试', () => {
  let service: JobService;

  beforeEach(() => {
    service = new JobService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createJob - 创建职位', () => {
    const createData = {
      title: '前端工程师',
      departments: ['技术部'],
      level: 'P5',
      skills: ['Vue', 'TypeScript'],
      location: '北京',
      type: '社招',
      description: '<p>前端开发职位</p>',
      requirements: '<p>3年以上经验</p>',
    };

    it('应成功创建职位', async () => {
      vi.mocked(prisma.job.create).mockResolvedValue({
        id: 'job-1',
        ...createData,
        status: 'open',
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.createJob(createData, 'user-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('job-1');
      expect(prisma.job.create).toHaveBeenCalled();
    });

    it('应使用默认状态 open', async () => {
      vi.mocked(prisma.job.create).mockResolvedValue({
        id: 'job-1',
        ...createData,
        status: 'open',
        createdById: 'user-1',
      } as any);

      await service.createJob(createData, 'user-1');

      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'open',
          }),
        })
      );
    });
  });

  describe('getJobs - 获取职位列表', () => {
    it('应返回分页列表', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([
        {
          id: 'job-1',
          title: '前端工程师',
          departments: ['技术部'],
          _count: { candidateJobs: 5 },
        },
      ] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(1);

      const result = await service.getJobs({ page: 1, pageSize: 10 });

      expect(result.jobs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('应支持关键词搜索', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(0);

      await service.getJobs({ keyword: '前端' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: expect.objectContaining({
              contains: '前端',
              mode: 'insensitive',
            }),
          }),
        })
      );
    });

    it('应支持状态筛选', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(0);

      await service.getJobs({ status: 'open' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'open',
          }),
        })
      );
    });

    it('应支持类型筛选', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(0);

      await service.getJobs({ type: '社招' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: '社招',
          }),
        })
      );
    });

    it('应支持地域筛选', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(0);

      await service.getJobs({ location: '北京' });

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            location: '北京',
          }),
        })
      );
    });

    it('非管理员只能看到自己创建的职位', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(0);

      await service.getJobs({}, 'user-1', false);

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdById: 'user-1',
          }),
        })
      );
    });

    it('管理员可以看到所有职位', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.job.count).mockResolvedValue(0);

      await service.getJobs({}, 'admin-1', true);

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            createdById: expect.anything(),
          }),
        })
      );
    });
  });

  describe('getJobById - 获取职位详情', () => {
    it('应返回职位详情', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        title: '前端工程师',
        createdById: 'user-1',
        createdBy: { id: 'user-1', name: '管理员', email: 'admin@test.com' },
        _count: { candidateJobs: 5 },
      } as any);

      const result = await service.getJobById('job-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('job-1');
    });

    it('职位不存在时应抛出错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue(null);

      await expect(service.getJobById('non-existent')).rejects.toThrow('职位不存在');
    });

    it('非管理员查看他人职位应抛出权限错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        title: '前端工程师',
        createdById: 'other-user',
      } as any);

      await expect(service.getJobById('job-1', 'user-1', false)).rejects.toThrow('没有权限查看此职位');
    });

    it('管理员可以查看任意职位', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        title: '前端工程师',
        createdById: 'other-user',
      } as any);

      const result = await service.getJobById('job-1', 'admin-1', true);

      expect(result).toBeDefined();
    });
  });

  describe('updateJob - 更新职位', () => {
    const updateData = {
      title: '高级前端工程师',
      status: 'paused',
    };

    it('应成功更新职位', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'user-1',
        status: 'open',
      } as any);
      vi.mocked(prisma.job.update).mockResolvedValue({
        id: 'job-1',
        title: '高级前端工程师',
        status: 'paused',
      } as any);

      const result = await service.updateJob('job-1', updateData, 'user-1');

      expect(prisma.job.update).toHaveBeenCalled();
    });

    it('职位不存在时应抛出错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue(null);

      await expect(service.updateJob('non-existent', updateData, 'user-1')).rejects.toThrow('职位不存在');
    });

    it('非管理员更新他人职位应抛出权限错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'other-user',
        status: 'open',
      } as any);

      await expect(service.updateJob('job-1', updateData, 'user-1', false)).rejects.toThrow('没有权限更新此职位');
    });

    it('已关闭的职位不能编辑', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'user-1',
        status: 'closed',
      } as any);

      await expect(service.updateJob('job-1', updateData, 'user-1')).rejects.toThrow('已关闭的职位不能编辑');
    });
  });

  describe('closeJob - 关闭职位', () => {
    it('应成功关闭职位', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'user-1',
        status: 'open',
      } as any);
      vi.mocked(prisma.job.update).mockResolvedValue({
        id: 'job-1',
        status: 'closed',
      } as any);

      const result = await service.closeJob('job-1', 'user-1');

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: { status: 'closed' },
        })
      );
    });

    it('职位不存在时应抛出错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue(null);

      await expect(service.closeJob('non-existent', 'user-1')).rejects.toThrow('职位不存在');
    });

    it('非管理员关闭他人职位应抛出权限错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'other-user',
        status: 'open',
      } as any);

      await expect(service.closeJob('job-1', 'user-1', false)).rejects.toThrow('没有权限关闭此职位');
    });

    it('已关闭的职位不能再关闭', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'user-1',
        status: 'closed',
      } as any);

      await expect(service.closeJob('job-1', 'user-1')).rejects.toThrow('职位已经是关闭状态');
    });
  });

  describe('duplicateJob - 复制职位', () => {
    it('应成功复制职位', async () => {
      const originalJob = {
        id: 'job-1',
        title: '前端工程师',
        departments: ['技术部'] as string[],
        level: 'P5',
        skills: ['Vue'] as string[],
        location: '北京',
        type: '社招',
        description: '<p>描述</p>',
        requirements: '<p>要求</p>',
        status: 'open',
        createdById: 'user-1',
      };
      vi.mocked(prisma.job.findUnique).mockResolvedValue(originalJob as any);
      vi.mocked(prisma.job.create).mockResolvedValue({
        id: 'job-2',
        title: '前端工程师（副本）',
        departments: ['技术部'],
      } as any);

      const result = await service.duplicateJob('job-1', 'user-1');

      expect(result.title).toContain('（副本）');
      expect(prisma.job.create).toHaveBeenCalled();
    });

    it('原职位不存在时应抛出错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue(null);

      await expect(service.duplicateJob('non-existent', 'user-1')).rejects.toThrow('职位不存在');
    });

    it('复制的职位默认状态为开放', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        title: '前端工程师',
        departments: ['技术部'] as string[],
        level: 'P5',
        skills: ['Vue'] as string[],
        location: '北京',
        type: '社招',
        description: '<p>描述</p>',
        requirements: '<p>要求</p>',
        status: 'closed',
        createdById: 'user-1',
      } as any);
      vi.mocked(prisma.job.create).mockResolvedValue({
        id: 'job-2',
        title: '前端工程师（副本）',
        status: 'open',
      } as any);

      await service.duplicateJob('job-1', 'user-1');

      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'open',
          }),
        })
      );
    });
  });

  describe('deleteJob - 删除职位', () => {
    it('应成功删除职位', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
      } as any);
      vi.mocked(prisma.candidateJob.count).mockResolvedValue(3);
      vi.mocked(prisma.job.delete).mockResolvedValue({} as any);

      const result = await service.deleteJob('job-1');

      expect(result.candidateCount).toBe(3);
      expect(prisma.job.delete).toHaveBeenCalledWith({
        where: { id: 'job-1' },
      });
    });

    it('职位不存在时应抛出错误', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue(null);

      await expect(service.deleteJob('non-existent')).rejects.toThrow('职位不存在');
    });
  });

  describe('checkPermission - 权限检查', () => {
    it('管理员应有权限', async () => {
      const result = await service.checkPermission('job-1', 'admin-1', true);
      expect(result).toBe(true);
    });

    it('创建者应有权限', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'user-1',
      } as any);

      const result = await service.checkPermission('job-1', 'user-1', false);
      expect(result).toBe(true);
    });

    it('非创建者应无权限', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-1',
        createdById: 'other-user',
      } as any);

      const result = await service.checkPermission('job-1', 'user-1', false);
      expect(result).toBe(false);
    });

    it('职位不存在应返回false', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue(null);

      const result = await service.checkPermission('non-existent', 'user-1', false);
      expect(result).toBe(false);
    });
  });
});