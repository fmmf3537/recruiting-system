import type { Request, Response, NextFunction } from 'express';
import { jobService, type CreateJobInput, type UpdateJobInput, type JobListQuery } from '../services/job.service';
import { asyncHandler } from '../middleware/errorHandler';
import { getUserDepartment } from '../middleware/auth';

/**
 * 职位控制器
 * 处理 HTTP 请求并调用 Service 层
 */
export class JobController {
  /**
   * POST /api/jobs
   * 创建职位
   */
  createJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const data: CreateJobInput = req.body;
    const userId = req.user!.userId;

    const job = await jobService.createJob(data, userId);

    res.status(201).json({
      success: true,
      message: '职位创建成功',
      data: job,
    });
  });

  /**
   * GET /api/jobs
   * 获取职位列表
   */
  getJobs = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const query: JobListQuery = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 10,
      keyword: req.query.keyword as string | undefined,
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
      location: req.query.location as string | undefined,
      department: (getUserDepartment(req) || req.query.department) as string | undefined,
      createdBy: req.query.createdBy as string | undefined,
    };

    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const result = await jobService.getJobs(query, userId, isAdmin);

    res.json({
      success: true,
      data: result.jobs,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  });

  /**
   * GET /api/jobs/:id
   * 获取职位详情
   */
  getJobById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const job = await jobService.getJobById(id, userId, isAdmin);

    res.json({
      success: true,
      data: job,
    });
  });

  /**
   * PATCH /api/jobs/:id
   * 编辑职位
   */
  updateJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const data: UpdateJobInput = req.body;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const job = await jobService.updateJob(id, data, userId, isAdmin);

    res.json({
      success: true,
      message: '职位更新成功',
      data: job,
    });
  });

  /**
   * POST /api/jobs/:id/close
   * 关闭职位
   */
  closeJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const job = await jobService.closeJob(id, userId, isAdmin);

    res.json({
      success: true,
      message: '职位已关闭',
      data: job,
    });
  });

  /**
   * POST /api/jobs/:id/duplicate
   * 复制职位
   */
  duplicateJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const job = await jobService.duplicateJob(id, userId);

    res.status(201).json({
      success: true,
      message: '职位复制成功',
      data: job,
    });
  });

  /**
   * DELETE /api/jobs/:id
   * 删除职位（仅管理员）
   */
  deleteJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { id } = req.params;

    await jobService.deleteJob(id);

    res.json({
      success: true,
      message: '职位删除成功',
    });
  });
}

// 导出单例实例
export const jobController = new JobController();
