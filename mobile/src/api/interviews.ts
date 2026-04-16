import request from '@/lib/request';
import type { InterviewRound, InterviewConclusion } from './candidates';

export interface InterviewListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  round?: string;
  conclusion?: string;
  startDate?: string;
  endDate?: string;
}

export interface InterviewListItem {
  id: string;
  round: InterviewRound;
  interviewerName: string;
  interviewTime: string;
  conclusion: InterviewConclusion | null;
  feedbackContent: string | null;
  rejectReason: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
}

export interface InterviewListData {
  success: boolean;
  data: InterviewListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function getInterviewList(params?: InterviewListParams): Promise<InterviewListData> {
  return request.get('/api/candidates/interviews', { params });
}
