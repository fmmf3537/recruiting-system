import request from '@/utils/request';

export interface HCRequestItem {
  id: string;
  title: string;
  department: string;
  level: string;
  headcount: number;
  filledCount: number;
  urgency: string;
  expectedDate: string | null;
  salaryMin: string | null;
  salaryMax: string | null;
  reason: string;
  reasonNote: string | null;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  requesterId: string;
  requester?: { id: string; name: string };
  approverId: string | null;
  approver?: { id: string; name: string } | null;
  approveNote: string | null;
  createdJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HCRequestListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  department?: string;
  keyword?: string;
}

export interface CreateHCRequestParams {
  title: string;
  department: string;
  level: string;
  headcount: number;
  urgency: string;
  expectedDate?: string;
  salaryMin?: string;
  salaryMax?: string;
  reason: string;
  reasonNote?: string;
}

export interface UpdateHCRequestParams {
  title?: string;
  department?: string;
  level?: string;
  headcount?: number;
  urgency?: string;
  expectedDate?: string;
  salaryMin?: string;
  salaryMax?: string;
  reason?: string;
  reasonNote?: string;
}

export function getHCRequests(params?: HCRequestListParams): Promise<{
  success: boolean;
  data: HCRequestItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  return request.get('/hc-requests', { params }) as Promise<any>;
}

export function getHCRequestById(id: string): Promise<{ success: boolean; data: HCRequestItem }> {
  return request.get(`/hc-requests/${id}`) as Promise<any>;
}

export function createHCRequest(data: CreateHCRequestParams): Promise<{ success: boolean; data: HCRequestItem; message: string }> {
  return request.post('/hc-requests', data) as Promise<any>;
}

export function updateHCRequest(id: string, data: UpdateHCRequestParams): Promise<{ success: boolean; data: HCRequestItem; message: string }> {
  return request.patch(`/hc-requests/${id}`, data) as Promise<any>;
}

export function submitHCRequest(id: string): Promise<{ success: boolean; message: string }> {
  return request.post(`/hc-requests/${id}/submit`) as Promise<any>;
}

export function approveHCRequest(id: string, note?: string): Promise<{ success: boolean; message: string }> {
  return request.post(`/hc-requests/${id}/approve`, { note }) as Promise<any>;
}

export function rejectHCRequest(id: string, note: string): Promise<{ success: boolean; message: string }> {
  return request.post(`/hc-requests/${id}/reject`, { note }) as Promise<any>;
}

export function createJobFromHCRequest(id: string): Promise<{ success: boolean; data: any; message: string }> {
  return request.post(`/hc-requests/${id}/create-job`) as Promise<any>;
}

export function deleteHCRequest(id: string): Promise<{ success: boolean; message: string }> {
  return request.delete(`/hc-requests/${id}`) as Promise<any>;
}
