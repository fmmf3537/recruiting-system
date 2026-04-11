import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { jobController } from '../controllers/job.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// ============ 验证 Schema 定义 ============

// 创建职位验证 Schema
const createJobSchema = z.object({
  title: z.string().min(2, '职位名称至少2个字符').max(100, '职位名称最多100个字符'),
  departments: z.array(z.string()).min(1, '至少选择一个部门'),
  level: z.string().min(1, '职级不能为空'),
  skills: z.array(z.string()).default([]),
  location: z.string().min(1, '地域不能为空'),
  type: z.enum(['社招', '校招', '实习生'], {
    errorMap: () => ({ message: '类型必须是：社招、校招或实习生' }),
  }),
  description: z.string().min(1, '职位描述不能为空'),
  requirements: z.string().min(1, '职位要求不能为空'),
  status: z.enum(['open', 'paused', 'closed']).optional().default('open'),
});

// 更新职位验证 Schema（所有字段可选）
const updateJobSchema = z.object({
  title: z.string().min(2).max(100).optional(),
  departments: z.array(z.string()).optional(),
  level: z.string().optional(),
  skills: z.array(z.string()).optional(),
  location: z.string().optional(),
  type: z.enum(['社招', '校招', '实习生']).optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  status: z.enum(['open', 'paused', 'closed']).optional(),
});

// 职位 ID 参数验证
const jobIdParamSchema = z.object({
  id: z.string().cuid('无效的职位ID'),
});

// 列表查询验证 Schema
const listJobsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  keyword: z.string().optional(),
  status: z.enum(['open', 'paused', 'closed']).optional(),
  type: z.enum(['社招', '校招', '实习生']).optional(),
  location: z.string().optional(),
  department: z.string().optional(),
  createdBy: z.string().optional(),
});

// ============ 路由定义 ============

/**
 * POST /api/jobs
 * 创建职位
 * 权限：登录用户
 */
router.post(
  '/',
  authenticate,
  validate(createJobSchema),
  jobController.createJob
);

/**
 * GET /api/jobs
 * 获取职位列表（支持分页和多条件筛选）
 * 权限：登录用户（普通成员只能看到自己创建的）
 */
router.get(
  '/',
  authenticate,
  validate(listJobsQuerySchema, 'query'),
  jobController.getJobs
);

/**
 * GET /api/jobs/:id
 * 获取职位详情（含候选人数量统计）
 * 权限：登录用户（普通成员只能查看自己创建的）
 */
router.get(
  '/:id',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.getJobById
);

/**
 * PATCH /api/jobs/:id
 * 编辑职位
 * 权限：登录用户（普通成员只能编辑自己创建的，管理员可编辑所有）
 */
router.patch(
  '/:id',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  validate(updateJobSchema),
  jobController.updateJob
);

/**
 * POST /api/jobs/:id/close
 * 关闭职位
 * 权限：登录用户（普通成员只能关闭自己创建的，管理员可关闭所有）
 */
router.post(
  '/:id/close',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.closeJob
);

/**
 * POST /api/jobs/:id/duplicate
 * 复制职位（标题自动追加"（副本）"）
 * 权限：登录用户
 */
router.post(
  '/:id/duplicate',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.duplicateJob
);

/**
 * DELETE /api/jobs/:id
 * 删除职位
 * 权限：仅管理员
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(jobIdParamSchema, 'params'),
  jobController.deleteJob
);

export default router;
