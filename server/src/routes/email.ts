import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { emailSendLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendEmail,
  getEmailLogs,
  getMailStatus,
} from '../controllers/email.controller';

const router: RouterType = Router();

// ============ 验证 Schema ============

const templateIdParamSchema = z.object({
  id: z.string().max(50).cuid('无效的模板ID'),
});

const createTemplateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空').max(200),
  subject: z.string().min(1, '邮件主题不能为空').max(200),
  body: z.string().min(1, '邮件正文不能为空').max(5000),
  variables: z.array(z.string().max(100)).default([]),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  variables: z.array(z.string().max(100)).optional(),
});

const sendEmailSchema = z.object({
  templateId: z.string().max(50).optional(),
  to: z.string().email('无效的邮箱地址').max(254),
  subject: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  variables: z.record(z.string().max(500)).optional(),
  candidateId: z.string().max(50).optional(),
});

const listLogsQuerySchema = z.object({
  page: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().max(10).optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  candidateId: z.string().max(50).optional(),
});

// ============ 路由定义 ============

// 邮件配置状态
router.get('/status', authenticate, getMailStatus);

// 邮件模板 CRUD
router.get('/templates', authenticate, getTemplates);
router.post('/templates', authenticate, validate(createTemplateSchema), createTemplate);
router.get('/templates/:id', authenticate, validate(templateIdParamSchema, 'params'), getTemplateById);
router.patch('/templates/:id', authenticate, validate(templateIdParamSchema, 'params'), validate(updateTemplateSchema), updateTemplate);
router.delete('/templates/:id', authenticate, validate(templateIdParamSchema, 'params'), deleteTemplate);

// 发送邮件（限流防滥用）
router.post('/send', authenticate, emailSendLimiter, validate(sendEmailSchema), sendEmail);

// 邮件日志
router.get('/logs', authenticate, validate(listLogsQuerySchema, 'query'), getEmailLogs);

export default router;
