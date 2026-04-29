import request from '@/utils/request';

export interface InterviewerInfo {
  id: string;
  name: string;
}

export interface InterviewParams {
  candidateId: string;
  jobId?: string;
  round: string;
  type: string;
  interviewers: InterviewerInfo[];
  scheduledAt: string;
  duration?: number;
  location?: string;
  notes?: string;
}

export interface InterviewItem {
  id: string;
  round: string;
  type: string;
  interviewers: InterviewerInfo[];
  scheduledAt: string;
  duration: number;
  location: string | null;
  notes: string | null;
  status: string;
  candidateId: string;
  candidateName: string;
  jobId: string | null;
  jobTitle: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
}

export interface InterviewListParams {
  page?: number;
  pageSize?: number;
  candidateId?: string;
  jobId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface InterviewListData {
  success: boolean;
  data: InterviewItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 获取面试列表
export function getInterviews(params: InterviewListParams): Promise<InterviewListData> {
  return request.get('/interviews', { params }) as Promise<InterviewListData>;
}

// 创建面试安排
export function createInterview(data: InterviewParams) {
  return request.post('/interviews', data);
}

// 获取面试详情
export function getInterviewById(id: string) {
  return request.get(`/interviews/${id}`);
}

// 更新面试安排
export function updateInterview(id: string, data: Partial<InterviewParams>) {
  return request.patch(`/interviews/${id}`, data);
}

// 取消面试
export function cancelInterview(id: string, reason?: string) {
  return request.post(`/interviews/${id}/cancel`, { reason });
}

// 标记面试完成
export function completeInterview(id: string) {
  return request.post(`/interviews/${id}/complete`);
}

// 获取候选人的面试安排
export function getCandidateInterviews(candidateId: string) {
  return request.get(`/candidates/${candidateId}/interviews`);
}

// 查询面试官冲突
export function getInterviewerConflicts(interviewerId: string, startDate: string, endDate: string) {
  return request.get('/interviews/conflicts', {
    params: { interviewerId, startDate, endDate },
  });
}
