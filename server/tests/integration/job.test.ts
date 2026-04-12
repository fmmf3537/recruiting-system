import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jobRoutes from '../../src/routes/jobs';
import { jobService } from '../../src/services/job.service';

// Mock job service
vi.mock('../../src/services/job.service', () => ({
  jobService: {
    createJob: vi.fn(),
    getJobs: vi.fn(),
    getJobById: vi.fn(),
    updateJob: vi.fn(),
    closeJob: vi.fn(),
    duplicateJob: vi.fn(),
    deleteJob: vi.fn(),
    checkPermission: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'test@test.com', role: 'admin' };
    next();
  },
  authorize: () => (req: any, res: any, next: any) => next(),
}));

describe('职位模块 API 测试', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', jobRoutes);
    vi.clearAllMocks();
  });

  describe('POST /api/jobs - 创建职位', () => {
    const validJob = {
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
      const mockJob = {
        id: 'job-1',
        ...validJob,
        status: 'open',
        createdById: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(jobService.createJob).mockResolvedValue(mockJob as any);

      const res = await request(app)
        .post('/api/jobs')
        .send(validJob)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('job-1');
    });

    it('缺少必填字段应返回错误', async () => {
      const invalidJob = {
        title: '前端工程师',
        // 缺少 departments, skills 等必填字段
      };

      const res = await request(app)
        .post('/api/jobs')
        .send(invalidJob)
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/jobs - 获取职位列表', () => {
    it('应返回职位列表', async () => {
      vi.mocked(jobService.getJobs).mockResolvedValue({
        jobs: [
          { id: 'job-1', title: '前端工程师', status: 'open' },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });

      const res = await request(app)
        .get('/api/jobs')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('应支持分页参数', async () => {
      vi.mocked(jobService.getJobs).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 2,
        pageSize: 20,
        totalPages: 0,
      });

      const res = await request(app)
        .get('/api/jobs')
        .query({ page: 2, pageSize: 20 })
        .expect(200);

      expect(jobService.getJobs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 }),
        'user-1',
        true
      );
    });

    it('应支持关键词搜索', async () => {
      vi.mocked(jobService.getJobs).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      await request(app)
        .get('/api/jobs')
        .query({ keyword: '前端' })
        .expect(200);

      expect(jobService.getJobs).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: '前端' }),
        expect.anything(),
        expect.anything()
      );
    });

    it('应支持状态筛选', async () => {
      vi.mocked(jobService.getJobs).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      await request(app)
        .get('/api/jobs')
        .query({ status: 'open' })
        .expect(200);

      expect(jobService.getJobs).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'open' }),
        expect.anything(),
        expect.anything()
      );
    });

    it('应支持类型筛选', async () => {
      vi.mocked(jobService.getJobs).mockResolvedValue({
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      await request(app)
        .get('/api/jobs')
        .query({ type: '社招' })
        .expect(200);

      expect(jobService.getJobs).toHaveBeenCalledWith(
        expect.objectContaining({ type: '社招' }),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('GET /api/jobs/:id - 获取职位详情', () => {
    it('应返回职位详情', async () => {
      vi.mocked(jobService.getJobById).mockResolvedValue({
        id: 'job-1',
        title: '前端工程师',
        status: 'open',
      } as any);

      const res = await request(app)
        .get('/api/jobs/job-1')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('job-1');
    });

    it('职位不存在应返回404', async () => {
      vi.mocked(jobService.getJobById).mockRejectedValue(new Error('职位不存在'));

      const res = await request(app)
        .get('/api/jobs/non-existent')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/jobs/:id - 更新职位', () => {
    it('应成功更新职位', async () => {
      vi.mocked(jobService.updateJob).mockResolvedValue({
        id: 'job-1',
        title: '高级前端工程师',
      } as any);

      const res = await request(app)
        .patch('/api/jobs/job-1')
        .send({ title: '高级前端工程师' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('职位不存在应返回404', async () => {
      vi.mocked(jobService.updateJob).mockRejectedValue(new Error('职位不存在'));

      const res = await request(app)
        .patch('/api/jobs/non-existent')
        .send({ title: '新标题' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('无权限更新应返回403', async () => {
      vi.mocked(jobService.updateJob).mockRejectedValue(new Error('没有权限更新此职位'));

      const res = await request(app)
        .patch('/api/jobs/job-1')
        .send({ title: '新标题' })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/jobs/:id/close - 关闭职位', () => {
    it('应成功关闭职位', async () => {
      vi.mocked(jobService.closeJob).mockResolvedValue({
        id: 'job-1',
        status: 'closed',
      } as any);

      const res = await request(app)
        .post('/api/jobs/job-1/close')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('职位不存在应返回404', async () => {
      vi.mocked(jobService.closeJob).mockRejectedValue(new Error('职位不存在'));

      const res = await request(app)
        .post('/api/jobs/non-existent/close')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/jobs/:id/duplicate - 复制职位', () => {
    it('应成功复制职位', async () => {
      vi.mocked(jobService.duplicateJob).mockResolvedValue({
        id: 'job-2',
        title: '前端工程师（副本）',
      } as any);

      const res = await request(app)
        .post('/api/jobs/job-1/duplicate')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toContain('（副本）');
    });

    it('原职位不存在应返回404', async () => {
      vi.mocked(jobService.duplicateJob).mockRejectedValue(new Error('职位不存在'));

      const res = await request(app)
        .post('/api/jobs/non-existent/duplicate')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/jobs/:id - 删除职位', () => {
    it('应成功删除职位', async () => {
      vi.mocked(jobService.deleteJob).mockResolvedValue({
        candidateCount: 0,
      } as any);

      const res = await request(app)
        .delete('/api/jobs/job-1')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('职位不存在应返回404', async () => {
      vi.mocked(jobService.deleteJob).mockRejectedValue(new Error('职位不存在'));

      const res = await request(app)
        .delete('/api/jobs/non-existent')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });
});