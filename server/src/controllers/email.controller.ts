import type { Request, Response, NextFunction } from 'express';
import * as emailTemplateService from '../services/email-template.service';
import { sendMail, isMailConfigured } from '../services/mail.service';
import prisma from '../lib/prisma';

/**
 * 邮件控制器
 * 处理邮件模板和邮件发送相关的 HTTP 请求
 */

// ============ 邮件模板 ============

export async function getTemplates(_req: Request, res: Response, next: NextFunction) {
  try {
    const templates = await emailTemplateService.getEmailTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
}

export async function getTemplateById(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await emailTemplateService.getEmailTemplateById(req.params.id);
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const template = await emailTemplateService.createEmailTemplate(req.body, userId);
    res.status(201).json({ success: true, data: template, message: '模板创建成功' });
  } catch (error) {
    next(error);
  }
}

export async function updateTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await emailTemplateService.updateEmailTemplate(req.params.id, req.body);
    res.json({ success: true, data: template, message: '模板更新成功' });
  } catch (error) {
    next(error);
  }
}

export async function deleteTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    await emailTemplateService.deleteEmailTemplate(req.params.id);
    res.json({ success: true, message: '模板删除成功' });
  } catch (error) {
    next(error);
  }
}

// ============ 发送邮件 ============

export async function sendEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { templateId, to, subject, body, variables, candidateId } = req.body;
    const userId = req.user!.userId;

    let finalSubject = subject || '';
    let finalBody = body || '';

    // 如果使用模板，先渲染模板
    if (templateId) {
      const rendered = await emailTemplateService.renderEmailByTemplate(
        templateId,
        variables || {}
      );
      finalSubject = rendered.subject;
      finalBody = rendered.body;
    }

    if (!to || !finalSubject || !finalBody) {
      res.status(400).json({ success: false, error: '收件人、主题、正文不能为空' });
      return;
    }

    // 发送邮件
    const result = await sendMail({
      to,
      subject: finalSubject,
      html: finalBody,
    });

    // 记录发送日志
    await prisma.emailLog.create({
      data: {
        templateId: templateId || null,
        candidateId: candidateId || null,
        toEmail: to,
        subject: finalSubject,
        body: finalBody,
        status: result.success ? 'sent' : 'failed',
        errorMessage: result.error || null,
        createdById: userId,
      },
    });

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error || '发送失败' });
      return;
    }

    res.json({ success: true, message: '邮件发送成功', data: { messageId: result.messageId } });
  } catch (error) {
    next(error);
  }
}

// ============ 邮件日志 ============

export async function getEmailLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
    const candidateId = req.query.candidateId as string | undefined;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (candidateId) {
      where.candidateId = candidateId;
    }

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { sentAt: 'desc' },
        include: {
          template: { select: { name: true } },
          candidate: { select: { name: true } },
        },
      }),
      prisma.emailLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============ 邮件配置状态 ============

export async function getMailStatus(_req: Request, res: Response, _next: NextFunction) {
  res.json({
    success: true,
    data: {
      configured: isMailConfigured(),
    },
  });
}
