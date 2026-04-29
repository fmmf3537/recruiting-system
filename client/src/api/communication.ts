import request from '@/utils/request';

export interface CommunicationParams {
  candidateId: string;
  type: string;
  content: string;
  result?: string;
  followUpAt?: string;
}

export interface CommunicationItem {
  id: string;
  candidateId: string;
  candidate: { id: string; name: string };
  type: string;
  content: string;
  result: string | null;
  followUpAt: string | null;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// 获取沟通记录列表
export function getCommunications(params?: { page?: number; pageSize?: number; candidateId?: string; type?: string }) {
  return request.get('/communications', { params });
}

// 创建沟通记录
export function createCommunication(data: CommunicationParams) {
  return request.post('/communications', data);
}

// 获取沟通记录详情
export function getCommunicationById(id: string) {
  return request.get(`/communications/${id}`);
}

// 更新沟通记录
export function updateCommunication(id: string, data: Partial<CommunicationParams>) {
  return request.patch(`/communications/${id}`, data);
}

// 删除沟通记录
export function deleteCommunication(id: string) {
  return request.delete(`/communications/${id}`);
}

// 获取候选人的沟通记录
export function getCandidateCommunications(candidateId: string) {
  return request.get(`/candidates/${candidateId}/communications`);
}

// 获取待跟进提醒
export function getPendingFollowUps(mineOnly?: boolean) {
  return request.get('/communications/follow-ups', {
    params: mineOnly ? { mine: 'true' } : {},
  });
}
