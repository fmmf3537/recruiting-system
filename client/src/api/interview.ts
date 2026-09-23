import request, { type RequestOptions } from '@/utils/request';

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
  focusType?: string;
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
  /** completed 后：pending=仍有面试官待反馈，all_submitted=可进入招聘决策 */
  feedbackStatus?: 'pending' | 'all_submitted';
  recommendation?: 'advance' | 'reject' | 'hold' | 'offer' | null;
  recommendationNote?: string | null;
  recommendedById?: string | null;
  recommendedAt?: string | null;
  candidateResponse?: 'pending' | 'confirmed' | 'reschedule_requested' | 'declined' | 'no_show';
  candidateResponseNote?: string | null;
  candidateRespondedAt?: string | null;
  finalDecision?: 'advance' | 'reject' | 'hold' | 'offer' | null;
  finalDecisionNote?: string | null;
  finalDecisionStage?: string | null;
  candidateId: string;
  candidateName: string;
  jobId: string | null;
  jobTitle: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  // F3-C 考察方向（字典 code：hr/tech/comprehensive/manager/cross）
  focusType?: string | null;
  // INTV-S2：已提交评估摘要（服务端最多返回最近 1 条）
  evaluations?: Array<{ conclusion: string | null; submittedAt: string }>;
}

// ============ 面试问题大纲（F3-C） ============

/** 大纲中单道面试题 */
export interface OutlineQuestion {
  question: string;
  intent: string;
  referenceAnswer: string;
  followUp?: string;
}

/** 大纲的一个主题分组 */
export interface OutlineSection {
  theme: string;
  questions: OutlineQuestion[];
}

/** 完整大纲结构 */
export interface QuestionOutline {
  sections: OutlineSection[];
  durationAdvice?: string;
}

/** 大纲版本记录（与后端 InterviewQuestionOutline 对应） */
export interface QuestionOutlineVersion {
  id: string;
  interviewId: string;
  version: number;
  focusType: string;
  outline: QuestionOutline;
  adjustNote: string | null;
  editedById: string | null;
  createdById: string;
  createdAt: string;
}

/** AI 大纲异步生成任务；页面据 status 轮询，不等待 LLM 请求完成。 */
export interface QuestionOutlineGeneration {
  id: string;
  interviewId: string;
  focusType: string;
  adjustNote: string | null;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  outlineVersionId: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  reused: boolean;
}

export interface InterviewListParams {
  page?: number;
  pageSize?: number;
  candidateId?: string;
  jobId?: string;
  round?: string;
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

/** 用人经理提交建议；不直接改变候选人阶段，最终动作由 HR 执行。 */
export function submitHiringRecommendation(
  interviewId: string,
  data: { recommendation: 'advance' | 'reject' | 'hold' | 'offer'; note?: string }
) {
  return request.post(`/hiring/interviews/${interviewId}/recommendation`, data);
}

export function recordCandidateResponse(
  interviewId: string,
  data: {
    response: 'pending' | 'confirmed' | 'reschedule_requested' | 'declined' | 'no_show';
    note?: string;
  }
) {
  return request.patch(`/interviews/${interviewId}/candidate-response`, data);
}

export function finalizeInterviewDecision(
  interviewId: string,
  data: { decision: 'advance' | 'reject' | 'hold' | 'offer'; note?: string; targetStage?: string }
) {
  return request.post(`/interviews/${interviewId}/final-decision`, data);
}

// 获取候选人的面试安排
export function getCandidateInterviews(candidateId: string, options?: RequestOptions) {
  return request.get(`/candidates/${candidateId}/interviews`, options);
}

// 查询面试官冲突
export function getInterviewerConflicts(interviewerId: string, startDate: string, endDate: string) {
  return request.get('/interviews/conflicts', {
    params: { interviewerId, startDate, endDate },
  });
}

// ============ F3-C 面试问题大纲接口 ============

/** 创建面试大纲异步生成任务，接口快速返回；调用方轮询任务状态。 */
export function generateQuestionOutline(
  interviewId: string,
  data: { focusType: string; adjustNote?: string }
): Promise<{ success: boolean; data: QuestionOutlineGeneration }> {
  return request.post(`/interviews/${interviewId}/question-outline`, data, {
    timeout: 15000,
  }) as Promise<{ success: boolean; data: QuestionOutlineGeneration }>;
}

/** 获取最近一次大纲生成任务，刷新页面后可恢复生成状态。 */
export function getQuestionOutlineGeneration(
  interviewId: string
): Promise<{ success: boolean; data: QuestionOutlineGeneration | null }> {
  return request.get(`/interviews/${interviewId}/question-outline-generation`) as Promise<{
    success: boolean;
    data: QuestionOutlineGeneration | null;
  }>;
}

/** 获取某场面试的大纲版本列表（返回 version 降序） */
export function getQuestionOutlines(
  interviewId: string
): Promise<{ success: boolean; data: QuestionOutlineVersion[] }> {
  return request.get(`/interviews/${interviewId}/question-outlines`) as Promise<{
    success: boolean;
    data: QuestionOutlineVersion[];
  }>;
}

/** 手动微调定稿（不调 LLM，仅保存当前 outline） */
export function finalizeQuestionOutline(
  interviewId: string,
  version: number,
  outline: QuestionOutline
): Promise<{ success: boolean; data: QuestionOutlineVersion }> {
  return request.patch(`/interviews/${interviewId}/question-outline/${version}`, {
    outline,
  }) as Promise<{ success: boolean; data: QuestionOutlineVersion }>;
}
