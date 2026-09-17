import request from '@/utils/request';

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: unknown;
  source: string | null;
  result: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string };
}

export function getAuditLogs(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}) {
  return request.get('/audit-logs', { params }) as Promise<{ success: boolean; data: AuditLogItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>;
}
