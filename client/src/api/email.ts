import request from '@/utils/request';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailLog {
  id: string;
  templateId: string | null;
  template: { name: string } | null;
  candidateId: string | null;
  candidate: { name: string } | null;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  createdById: string;
}

export interface CreateTemplateParams {
  name: string;
  subject: string;
  body: string;
  variables?: string[];
}

export interface UpdateTemplateParams {
  name?: string;
  subject?: string;
  body?: string;
  variables?: string[];
}

export interface SendEmailParams {
  templateId?: string;
  to: string;
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
  candidateId?: string;
}

export function getEmailTemplates(): Promise<{ success: boolean; data: EmailTemplate[] }> {
  return request.get('/email/templates') as Promise<{ success: boolean; data: EmailTemplate[] }>;
}

export function getEmailTemplateById(id: string): Promise<{ success: boolean; data: EmailTemplate }> {
  return request.get(`/email/templates/${id}`) as Promise<{ success: boolean; data: EmailTemplate }>;
}

export function createEmailTemplate(data: CreateTemplateParams): Promise<{ success: boolean; data: EmailTemplate; message: string }> {
  return request.post('/email/templates', data) as Promise<{ success: boolean; data: EmailTemplate; message: string }>;
}

export function updateEmailTemplate(id: string, data: UpdateTemplateParams): Promise<{ success: boolean; data: EmailTemplate; message: string }> {
  return request.patch(`/email/templates/${id}`, data) as Promise<{ success: boolean; data: EmailTemplate; message: string }>;
}

export function deleteEmailTemplate(id: string): Promise<{ success: boolean; message: string }> {
  return request.delete(`/email/templates/${id}`) as Promise<{ success: boolean; message: string }>;
}

export function sendEmail(data: SendEmailParams): Promise<{ success: boolean; message: string; data?: { messageId?: string } }> {
  return request.post('/email/send', data) as Promise<{ success: boolean; message: string; data?: { messageId?: string } }>;
}

export function getEmailLogs(params?: { page?: number; pageSize?: number; candidateId?: string }): Promise<{
  success: boolean;
  data: EmailLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  return request.get('/email/logs', { params }) as Promise<any>;
}

export function getMailStatus(): Promise<{ success: boolean; data: { configured: boolean } }> {
  return request.get('/email/status') as Promise<{ success: boolean; data: { configured: boolean } }>;
}
