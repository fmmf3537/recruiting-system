import request from '@/utils/request';

// 评估维度（结构化面试评估）
export interface EvaluationDimension {
  name: string;
  score: number;
  comment?: string;
}

export type EvaluationConclusion = 'pass' | 'reject' | 'pending';

export interface MyEvaluationItem {
  id: string;
  interviewId: string;
  submittedAt: string | null; // null = 待填写
  dimensions: EvaluationDimension[] | null;
  overallScore: number | null; // 1-5
  conclusion: EvaluationConclusion | null;
  interview: {
    id: string;
    round: string;
    type: string;
    scheduledAt: string;
    duration: number;
    status: string;
    candidateId: string;
    candidateName: string;
    jobTitle: string | null;
  };
}

export interface InterviewEvaluationItem {
  id: string;
  interviewerId: string;
  interviewerName: string;
  dimensions: EvaluationDimension[] | null;
  overallScore: number | null;
  conclusion: EvaluationConclusion | null;
  submittedAt: string | null; // null = 该面试官尚未提交
}

export interface MyEvaluationParams {
  status?: 'pending' | 'submitted';
  page?: number;
  pageSize?: number;
}

export interface MyEvaluationListData {
  success: boolean;
  data: MyEvaluationItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface InterviewEvaluationListData {
  success: boolean;
  data: InterviewEvaluationItem[];
}

export interface SubmitEvaluationParams {
  dimensions: EvaluationDimension[];
  overallScore: number;
  conclusion: EvaluationConclusion;
}

// 获取我的评估列表（待评估 / 已提交）
export function getMyEvaluations(params: MyEvaluationParams): Promise<MyEvaluationListData> {
  return request.get('/evaluations/my', { params }) as Promise<MyEvaluationListData>;
}

// 提交/修改评估（仅评估归属的面试官本人）
export function submitEvaluation(id: string, data: SubmitEvaluationParams) {
  return request.put(`/evaluations/${id}`, data);
}

// 获取某场面试的所有面试官评估
export function getInterviewEvaluations(
  interviewId: string
): Promise<InterviewEvaluationListData> {
  return request.get(
    `/interviews/${interviewId}/evaluations`
  ) as Promise<InterviewEvaluationListData>;
}
