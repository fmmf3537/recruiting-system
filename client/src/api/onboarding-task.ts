import request, { type RequestOptions } from '@/utils/request';

export interface OnboardingTask {
  id: string;
  candidateId: string;
  title: string;
  category: string;
  assigneeId: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getTasksByCandidate(
  candidateId: string,
  options?: RequestOptions
): Promise<{ success: boolean; data: OnboardingTask[] }> {
  return request.get(`/onboarding-tasks/candidates/${candidateId}`, options) as Promise<{ success: boolean; data: OnboardingTask[] }>;
}

export function createTask(data: {
  candidateId: string;
  title: string;
  category: string;
  assigneeId?: string;
  dueDate?: string;
  note?: string;
}): Promise<{ success: boolean; data: OnboardingTask; message: string }> {
  return request.post('/onboarding-tasks', data) as Promise<any>;
}

export function updateTask(id: string, data: Partial<{
  title: string;
  category: string;
  assigneeId: string;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate: string;
  note: string;
}>): Promise<{ success: boolean; data: OnboardingTask; message: string }> {
  return request.patch(`/onboarding-tasks/${id}`, data) as Promise<any>;
}

export function deleteTask(id: string): Promise<{ success: boolean; message: string }> {
  return request.delete(`/onboarding-tasks/${id}`) as Promise<any>;
}

export function generateDefaultTasks(candidateId: string): Promise<{ success: boolean; data: OnboardingTask[]; message: string }> {
  return request.post(`/onboarding-tasks/candidates/${candidateId}/generate`) as Promise<any>;
}
