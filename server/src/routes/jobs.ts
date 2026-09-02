import { Router, type Router as RouterType } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { JOB_STATUS } from '../constants';
import { jobController } from '../controllers/job.controller';
import { jdAssistController } from '../controllers/jd-assist.controller';
import { matchScoreController } from '../controllers/match-score.controller';
import { tagController } from '../controllers/tag.controller';
import { authenticate, authorize } from '../middleware/auth';
import { requireMatrixPermission } from '../middleware/role';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// F1-S：JD 完善 / 草稿生成接口限流（两接口独立计数）
const aiJdAssistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AI 辅助生成调用过于频繁，请稍后再试',
    code: 429,
  },
});

// ============ 验证 Schema 定义 ============

// 创建职位验证 Schema
const createJobSchema = z.object({
  title: z.string().min(2, '职位名称至少2个字符').max(200, '职位名称最多200个字符'),
  departments: z.array(z.string().max(50)).min(1, '至少选择一个部门'),
  level: z.string().min(1, '职级不能为空').max(50),
  skills: z.array(z.string().max(50)).default([]),
  location: z.string().min(1, '地域不能为空').max(50),
  type: z.string().min(1, '招聘类型不能为空').max(50),
  description: z.string().min(1, '职位描述不能为空').max(5000),
  requirements: z.string().min(1, '职位要求不能为空').max(5000),
  status: z.enum([...JOB_STATUS] as [string, ...string[]]).optional().default('open'),
  tagIds: z.array(z.string().max(50)).max(20, '最多设置20个标签').optional(),
  // 关联招聘流程模板（可空，空则使用该 type 的默认模板）
  pipelineTemplateId: z.string().max(50).nullable().optional(),
});

// 更新职位验证 Schema（所有字段可选）
const updateJobSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  departments: z.array(z.string().max(50)).optional(),
  level: z.string().max(50).optional(),
  skills: z.array(z.string().max(50)).optional(),
  location: z.string().max(50).optional(),
  type: z.string().max(50).optional(),
  description: z.string().max(5000).optional(),
  requirements: z.string().max(5000).optional(),
  status: z.enum([...JOB_STATUS] as [string, ...string[]]).optional(),
  tagIds: z.array(z.string().max(50)).max(20, '最多设置20个标签').optional(),
  pipelineTemplateId: z.string().max(50).nullable().optional(),
});

// 职位 ID 参数验证
const jobIdParamSchema = z.object({
  id: z.string().max(50).cuid('无效的职位ID'),
});

// 列表查询验证 Schema
const listJobsQuerySchema = z.object({
  page: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  keyword: z.string().max(100).optional(),
  status: z.enum(['open', 'paused', 'closed']).optional(),
  type: z.string().max(50).optional(),
  location: z.string().max(50).optional(),
  department: z.string().max(50).optional(),
  createdBy: z.string().max(50).optional(),
});

// ============ 路由定义 ============

// F1-S：JD 完善与辅助生成（不落库，输出由前端写入职位表单）
const aiPolishSchema = z.object({
  jdText: z.string().min(10, 'JD 内容至少 10 个字符').max(20000, 'JD 内容最多 20000 字'),
  meta: z
    .object({
      title: z.string().max(200).optional(),
      level: z.string().max(50).optional(),
      departments: z.array(z.string().max(50)).max(10).optional(),
      type: z.string().max(20).optional(),
    })
    .partial()
    .optional(),
});

const aiDraftSchema = z.object({
  title: z.string().min(2, '职位名称至少 2 个字符').max(100),
  departments: z.array(z.string().max(50)).min(1, '至少选择一个部门').max(10),
  level: z.string().max(50),
  type: z.string().max(20),
  freeText: z.string().max(2000).optional(),
});

/**
 * POST /api/jobs/ai-polish
 * JD 诊断 + 优化稿生成
 * 权限：登录用户 + ai:jd-assist（admin / hr / hiring_manager；interviewer 403）
 */
router.post(
  '/ai-polish',
  authenticate,
  aiJdAssistLimiter,
  requireMatrixPermission('ai:jd-assist'),
  validate(aiPolishSchema),
  jdAssistController.polish
);

/**
 * POST /api/jobs/ai-draft
 * JD 草稿从零生成
 * 权限：登录用户 + ai:jd-assist
 */
router.post(
  '/ai-draft',
  authenticate,
  aiJdAssistLimiter,
  requireMatrixPermission('ai:jd-assist'),
  validate(aiDraftSchema),
  jdAssistController.draft
);

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
 * GET /api/jobs/:id/match-scores
 * 职位下候选人简历-JD 匹配打分列表（按综合分降序）
 * 权限：登录用户（按职位部门可见性过滤：admin 全量；member 仅本部门职位）
 */
router.get(
  '/:id/match-scores',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  matchScoreController.listByJob
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

// ============ 职位标签 ============

const setTagsSchema = z.object({
  tagIds: z.array(z.string().max(50)).max(20, '最多设置20个标签'),
});

/**
 * GET /api/jobs/:id/tags
 * 获取职位的标签
 */
router.get(
  '/:id/tags',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  tagController.getJobTags
);

/**
 * PUT /api/jobs/:id/tags
 * 设置职位的标签
 */
router.put(
  '/:id/tags',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  validate(setTagsSchema),
  tagController.setJobTags
);

export default router;
