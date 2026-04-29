import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { candidateController } from '../controllers/candidate.controller';
import { tagController } from '../controllers/tag.controller';
import { interviewController } from '../controllers/interview.controller';
import { communicationController } from '../controllers/communication.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { STAGE_ORDER, STAGE_STATUS, INTERVIEW_ROUNDS } from '../constants';

const router: RouterType = Router();

// 简历解析接口限流：1 小时内最多 20 次
const parseResumeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '简历解析次数已达上限，请 1 小时后再试',
    code: 429,
  },
});

// 配置 multer（磁盘存储，临时目录）
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.resolve(process.cwd(), 'uploads', 'temp'));
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// ============ 验证 Schema 定义 ============

// 更新候选人验证 Schema
const updateCandidateSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  phone: z.string().min(11).max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['男', '女']).optional(),
  age: z.number().int().min(18).max(70).optional(),
  education: z.string().optional(),
  school: z.string().optional(),
  workYears: z.number().int().min(0).optional(),
  currentCompany: z.string().optional(),
  currentPosition: z.string().optional(),
  expectedSalary: z.string().optional(),
  resumeUrl: z.string().url().optional(),
  source: z.string().optional(),
  sourceNote: z.string().optional(),
  referrer: z.string().optional(),
  intro: z.string().optional(),
  tagIds: z.array(z.string()).max(20, '最多设置20个标签').optional(),
  skills: z.array(z.string()).max(50, '最多设置50个技能').optional(),
});

// 列表查询验证 Schema
const listCandidatesQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  keyword: z.string().optional(),
  source: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum([...STAGE_STATUS] as [string, ...string[]]).optional(),
  education: z.string().optional(),
  workYearsMin: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  workYearsMax: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  jobId: z.string().optional(),
  tagIds: z.union([z.string(), z.array(z.string())]).optional()
    .transform((val) => {
      if (!val) return undefined;
      return Array.isArray(val) ? val : [val];
    }),
  hasNoJob: z.string().optional().transform((val) => val === 'true'),
});

// 候选人 ID 参数验证
const candidateIdParamSchema = z.object({
  id: z.string().cuid('无效的候选人ID'),
});

// 推进阶段验证 Schema
const advanceStageSchema = z.object({
  stage: z.enum([...STAGE_ORDER] as [string, ...string[]], {
    errorMap: () => ({ message: '无效的阶段' }),
  }),
  status: z.enum([...STAGE_STATUS] as [string, ...string[]], {
    errorMap: () => ({ message: '状态必须是：in_progress, passed 或 rejected' }),
  }),
  rejectReason: z.string().optional(),
  assigneeId: z.string().optional(),
  note: z.string().optional(),
});

// 面试反馈验证 Schema
const interviewFeedbackSchema = z.object({
  round: z.enum([...INTERVIEW_ROUNDS] as [string, ...string[]], {
    errorMap: () => ({ message: '轮次必须是：初试, 复试 或 终面' }),
  }),
  interviewerName: z.string().min(1, '面试官姓名不能为空'),
  interviewTime: z.string().datetime('无效的日期格式'),
  conclusion: z.enum(['pass', 'reject', 'pending'], {
    errorMap: () => ({ message: '结论必须是：pass, reject 或 pending' }),
  }),
  feedbackContent: z.string().min(1, '反馈内容不能为空'),
  rejectReason: z.string().optional(),
});

// 面试列表查询验证 Schema
const listInterviewsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  keyword: z.string().optional(),
  round: z.string().optional(),
  conclusion: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// 批量推进阶段验证 Schema
const batchAdvanceSchema = z.object({
  candidateIds: z.array(z.string().cuid('无效的候选人ID')).min(1, '至少选择一个候选人'),
  stage: z.enum([...STAGE_ORDER] as [string, ...string[]], {
    errorMap: () => ({ message: '无效的阶段' }),
  }),
  status: z.enum([...STAGE_STATUS] as [string, ...string[]], {
    errorMap: () => ({ message: '状态必须是：in_progress, passed 或 rejected' }),
  }),
  rejectReason: z.string().optional(),
  note: z.string().optional(),
});

// 批量设置标签验证 Schema
const batchSetTagsSchema = z.object({
  candidateIds: z.array(z.string().cuid('无效的候选人ID')).min(1, '至少选择一个候选人'),
  tagIds: z.array(z.string()).max(20, '最多设置20个标签'),
});

/**
 * GET /api/candidates
 * 候选人列表（支持分页和多条件筛选）
 * 权限：登录用户
 */
router.get(
  '/',
  authenticate,
  validate(listCandidatesQuerySchema, 'query'),
  candidateController.getCandidates
);

/**
 * POST /api/candidates
 * 新增候选人（含查重逻辑）
 * 权限：登录用户
 */
router.post(
  '/',
  authenticate,
  candidateController.createCandidate
);

/**
 * GET /api/candidates/activities
 * 获取近期候选人动态
 * 权限：登录用户
 */
router.get(
  '/activities',
  authenticate,
  candidateController.getRecentActivities
);

/**
 * GET /api/candidates/interviews
 * 获取面试列表（支持分页和筛选）
 * 权限：登录用户
 */
router.get(
  '/interviews',
  authenticate,
  validate(listInterviewsQuerySchema, 'query'),
  candidateController.getInterviewList
);

/**
 * POST /api/candidates/parse-resume
 * 提交简历解析任务（异步）
 * 权限：登录用户
 */
router.post(
  '/parse-resume',
  authenticate,
  parseResumeLimiter,
  upload.single('file'),
  candidateController.parseResume
);

/**
 * GET /api/candidates/parse-resume/:jobId
 * 查询简历解析任务状态
 * 权限：登录用户
 */
router.get(
  '/parse-resume/:jobId',
  authenticate,
  validate(z.object({ jobId: z.string() }), 'params'),
  candidateController.getParseResumeStatus
);

/**
 * GET /api/candidates/:id
 * 候选人详情（含流程记录、面试反馈、Offer 信息）
 * 权限：登录用户
 */
router.get(
  '/:id',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  candidateController.getCandidateById
);

/**
 * PATCH /api/candidates/:id
 * 编辑候选人
 * 权限：登录用户
 */
router.patch(
  '/:id',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(updateCandidateSchema),
  candidateController.updateCandidate
);

/**
 * POST /api/candidates/:id/stage
 * 推进候选人流程（必须按顺序验证）
 * 权限：登录用户
 */
router.post(
  '/:id/stage',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(advanceStageSchema),
  candidateController.advanceStage
);

/**
 * POST /api/candidates/:id/feedback
 * 添加面试反馈
 * 权限：登录用户
 */
router.post(
  '/:id/feedback',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(interviewFeedbackSchema),
  candidateController.addInterviewFeedback
);

/**
 * GET /api/candidates/:id/feedback
 * 获取面试反馈列表
 * 权限：登录用户
 */
router.get(
  '/:id/feedback',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  candidateController.getInterviewFeedbacks
);

/**
 * DELETE /api/candidates/:id
 * 删除候选人（创建者或管理员）
 * 权限：登录用户
 */
router.delete(
  '/:id',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  candidateController.deleteCandidate
);

// ============ 候选人标签 ============

const setTagsSchema = z.object({
  tagIds: z.array(z.string()).max(20, '最多设置20个标签'),
});

/**
 * GET /api/candidates/:id/tags
 * 获取候选人的标签
 */
router.get(
  '/:id/tags',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  tagController.getCandidateTags
);

/**
 * PUT /api/candidates/:id/tags
 * 设置候选人的标签
 */
router.put(
  '/:id/tags',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  validate(setTagsSchema),
  tagController.setCandidateTags
);

// ============ 候选人的面试安排 ============

/**
 * GET /api/candidates/:id/interviews
 * 获取候选人的面试安排列表
 */
router.get(
  '/:id/interviews',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  interviewController.getInterviewsByCandidate
);

/**
 * GET /api/candidates/:id/communications
 * 获取候选人的沟通记录
 */
router.get(
  '/:id/communications',
  authenticate,
  validate(candidateIdParamSchema, 'params'),
  communicationController.getCommunicationsByCandidate
);

// ============ 批量操作 ============

/**
 * POST /api/candidates/batch/advance
 * 批量推进候选人阶段
 */
router.post(
  '/batch/advance',
  authenticate,
  validate(batchAdvanceSchema),
  candidateController.batchAdvanceStage
);

/**
 * POST /api/candidates/batch/tags
 * 批量设置候选人标签
 */
router.post(
  '/batch/tags',
  authenticate,
  validate(batchSetTagsSchema),
  candidateController.batchSetTags
);

export default router;
