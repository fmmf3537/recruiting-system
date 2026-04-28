import nodemailer from 'nodemailer';
import { env } from '../lib/env';

/**
 * 邮件服务
 * 基于 nodemailer 封装，支持 SMTP 发送
 */

// 懒加载 transporter，仅在需要时创建
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_SECURE } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT || 587,
    secure: SMTP_SECURE || false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * 发送邮件
 * @returns 是否发送成功
 */
export async function sendMail(options: SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const t = getTransporter();
  if (!t) {
    return {
      success: false,
      error: '邮件服务未配置，请检查 SMTP 环境变量',
    };
  }

  try {
    const info = await t.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error('[MailService] 发送邮件失败:', error);
    return {
      success: false,
      error: error.message || '发送邮件失败',
    };
  }
}

/**
 * 检查邮件服务是否可用
 */
export function isMailConfigured(): boolean {
  return !!getTransporter();
}
