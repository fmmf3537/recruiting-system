import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { candidateController } from '../controllers/candidate.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 配置 multer（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
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
  intro: z.string().optional(),
});

// 列表查询验证 Schema
const listCandidatesQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  keyword: z.string().optional(),
  source: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum(['in_progress', 'passed', 'rejected']).optional(),
  education: z.string().optional(),
  workYearsMin: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  workYearsMax: z.string().optional().transform((val) => (val ? parseInt(val, 10) : undefined)),
  jobId: z.string().optional(),
});

// 候选人 ID 参数验证
const candidateIdParamSchema = z.object({
  id: z.string().cuid('无效的候选人ID'),
});

// 推进阶段验证 Schema
const advanceStageSchema = z.object({
  stage: z.enum(['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'], {
    errorMap: () => ({ message: '无效的阶段' }),
  }),
  status: z.enum(['in_progress', 'passed', 'rejected'], {
    errorMap: () => ({ message: '状态必须是：in_progress, passed 或 rejected' }),
  }),
  rejectReason: z.string().optional(),
  assigneeId: z.string().optional(),
  note: z.string().optional(),
});

// 面试反馈验证 Schema
const interviewFeedbackSchema = z.object({
  round: z.enum(['初试', '复试', '终面'], {
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
 * POST /api/candidates/parse-resume
 * 解析简历
 * 权限：登录用户
 */
router.post(
  '/parse-resume',
  authenticate,
  upload.single('file'),
  candidateController.parseResume
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

export default router;
