import request from '@/utils/request';

// 候选人性别
export type Gender = '男' | '女';

// 候选人流转阶段
export type CandidateStage = '入库' | '初筛' | '复试' | '终面' | '拟录用' | 'Offer' | '入职';

// 阶段状态
export type StageStatus = 'in_progress' | 'passed' | 'rejected';

// 面试轮次
export type InterviewRound = '初试' | '复试' | '终面';

// 面试结论
export type InterviewConclusion = 'pass' | 'reject' | 'pending';

// 候选人列表查询参数
export interface CandidateListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  source?: string;
  stage?: string;
  status?: StageStatus;
  education?: string;
  workYearsMin?: number;
  workYearsMax?: number;
  jobId?: string;
}

// 创建候选人参数
export interface CreateCandidateParams {
  name: string;
  phone: string;
  email: string;
  gender: Gender;
  age?: number;
  education: string;
  school?: string;
  workYears?: number;
  currentCompany?: string;
  currentPosition?: string;
  expectedSalary?: string;
  resumeUrl?: string;
  source: string;
  sourceNote?: string;
  referrer?: string;
  intro?: string;
  jobIds?: string[];
  tagIds?: string[];
  skills?: string[];
  workHistory?: WorkHistory[];
}

// 更新候选人参数
export interface UpdateCandidateParams {
  name?: string;
  phone?: string;
  email?: string;
  gender?: Gender;
  age?: number;
  education?: string;
  school?: string;
  workYears?: number;
  currentCompany?: string;
  currentPosition?: string;
  expectedSalary?: string;
  resumeUrl?: string;
  source?: string;
  sourceNote?: string;
  referrer?: string;
  intro?: string;
  tagIds?: string[];
  skills?: string[];
}

// 推进阶段参数
export interface AdvanceStageParams {
  stage: CandidateStage;
  status: StageStatus;
  rejectReason?: string;
  assigneeId?: string;
  note?: string;
}

// 面试反馈参数
export interface InterviewFeedbackParams {
  round: InterviewRound;
  interviewerName: string;
  interviewTime: string;
  conclusion: InterviewConclusion;
  feedbackContent: string;
  rejectReason?: string;
}

// 阶段记录
export interface StageRecord {
  id: string;
  stage: CandidateStage;
  status: StageStatus;
  rejectReason: string | null;
  assignee: {
    id: string;
    name: string;
  } | null;
  enteredAt: string;
  completedAt: string | null;
  note: string | null;
}

// 面试反馈
export interface InterviewFeedback {
  id: string;
  round: InterviewRound;
  interviewerName: string;
  interviewTime: string;
  conclusion: InterviewConclusion;
  feedbackContent: string;
  rejectReason: string | null;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

// Offer 信息
export interface OfferInfo {
  id: string;
  salary: string;
  offerDate: string;
  expectedJoinDate: string | null;
  result: string;
  joined: boolean;
  actualJoinDate: string | null;
  note: string | null;
}

// 关联职位
export interface CandidateJob {
  id: string;
  candidateId: string;
  jobId: string;
  createdAt: string;
  job: {
    id: string;
    title: string;
  };
}

// 候选人列表项
export interface CandidateItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: Gender;
  age: number | null;
  education: string;
  school: string | null;
  workYears: number | null;
  currentCompany: string | null;
  currentPosition: string | null;
  expectedSalary: string | null;
  resumeUrl: string | null;
  source: string;
  sourceNote: string | null;
  referrer: string | null;
  intro: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  stageRecords: {
    stage: CandidateStage;
    status: StageStatus;
  }[];
  candidateJobs: CandidateJob[];
  currentStage: string;
  stageStatus: string;
  tags?: Tag[];
  skills?: string[];
}

// 候选人详情
export interface CandidateDetail extends CandidateItem {
  stageRecords: StageRecord[];
  interviewFeedbacks: InterviewFeedback[];
  offer: OfferInfo | null;
  jobs: {
    id: string;
    title: string;
  }[];
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
}

// 重复候选人信息
export interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
  email: string;
  currentStage: string;
  status: string;
  createdAt: string;
}

// 创建候选人响应
export interface CreateCandidateData {
  success: boolean;
  data: CandidateItem;
  message?: string;
  warning?: string;
  duplicates?: DuplicateCandidate[];
}

// 候选人列表响应
export interface CandidateListData {
  success: boolean;
  data: CandidateItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 候选人详情响应
export interface CandidateDetailData {
  success: boolean;
  data: CandidateDetail;
}

// 面试反馈列表响应
export interface InterviewFeedbackListData {
  success: boolean;
  data: InterviewFeedback[];
}

// 面试列表项
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

// 面试列表查询参数
export interface InterviewListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  round?: string;
  conclusion?: string;
  startDate?: string;
  endDate?: string;
}

// 面试列表响应
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

// 近期动态项
export interface ActivityItem {
  id: string;
  candidateName: string;
  action: string;
  stage: string;
  stageText: string;
  time: string;
}

// 近期动态响应
export interface RecentActivitiesData {
  success: boolean;
  data: ActivityItem[];
}

// 操作结果响应
export interface OperationResult {
  success: boolean;
  message: string;
}

/**
 * 获取候选人列表
 * @param params 查询参数
 */
export function getCandidateList(params?: CandidateListParams): Promise<CandidateListData> {
  return request.get('/candidates', { params }) as Promise<CandidateListData>;
}

/**
 * 获取候选人详情
 * @param id 候选人ID
 */
export function getCandidateById(id: string): Promise<CandidateDetailData> {
  return request.get(`/candidates/${id}`) as Promise<CandidateDetailData>;
}

/**
 * 创建候选人
 * @param data 候选人数据
 */
export function createCandidate(data: CreateCandidateParams): Promise<CreateCandidateData> {
  return request.post('/candidates', data) as Promise<CreateCandidateData>;
}

/**
 * 更新候选人
 * @param id 候选人ID
 * @param data 更新数据
 */
export function updateCandidate(id: string, data: UpdateCandidateParams): Promise<OperationResult> {
  return request.patch(`/candidates/${id}`, data) as Promise<OperationResult>;
}

/**
 * 推进候选人阶段
 * @param id 候选人ID
 * @param data 阶段数据
 */
export function advanceStage(id: string, data: AdvanceStageParams): Promise<OperationResult> {
  return request.post(`/candidates/${id}/stage`, data) as Promise<OperationResult>;
}

/**
 * 添加面试反馈
 * @param id 候选人ID
 * @param data 反馈数据
 */
export function addInterviewFeedback(id: string, data: InterviewFeedbackParams): Promise<OperationResult> {
  return request.post(`/candidates/${id}/feedback`, data) as Promise<OperationResult>;
}

/**
 * 获取面试反馈列表
 * @param id 候选人ID
 */
export function getInterviewFeedbacks(id: string): Promise<InterviewFeedbackListData> {
  return request.get(`/candidates/${id}/feedback`) as Promise<InterviewFeedbackListData>;
}

/**
 * 删除候选人
 * @param id 候选人ID
 */
export function deleteCandidate(id: string): Promise<OperationResult> {
  return request.delete(`/candidates/${id}`) as Promise<OperationResult>;
}

/**
 * 批量推进候选人阶段
 * @param data 批量推进数据
 */
export function batchAdvanceStage(data: {
  candidateIds: string[];
  stage: CandidateStage;
  status: StageStatus;
  rejectReason?: string;
  note?: string;
}): Promise<OperationResult & { data?: { success: number; failed: number } }> {
  return request.post('/candidates/batch/advance', data) as Promise<OperationResult & { data?: { success: number; failed: number } }>;
}

/**
 * 批量设置候选人标签
 * @param data 批量设置标签数据
 */
export function batchSetTags(data: {
  candidateIds: string[];
  tagIds: string[];
}): Promise<OperationResult & { data?: { success: number; failed: number } }> {
  return request.post('/candidates/batch/tags', data) as Promise<OperationResult & { data?: { success: number; failed: number } }>;
}

/**
 * 获取面试列表
 * @param params 查询参数
 */
export function getInterviewList(params?: InterviewListParams): Promise<InterviewListData> {
  return request.get('/candidates/interviews', { params }) as Promise<InterviewListData>;
}

/**
 * 获取近期候选人动态
 * @param limit 数量限制
 */
export function getRecentActivities(limit = 20): Promise<RecentActivitiesData> {
  return request.get('/candidates/activities', { params: { limit } }) as Promise<RecentActivitiesData>;
}

// ============ 简历解析 ============

// 工作经历
export interface WorkHistory {
  id?: string;
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

// 简历解析结果
export interface ResumeParseResult {
  name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  workYears: number | null;
  education: string | null;
  school: string | null;
  currentCompany: string | null;
  currentPosition: string | null;
  expectedSalary: string | null;
  workHistory: WorkHistory[];
  skills: string[];
  rawText: string;
  resumeUrl?: string;
}

// 简历解析任务提交响应
export interface ParseResumeJobResponse {
  success: boolean;
  message?: string;
  data?: {
    jobId: string;
  };
}

// 简历解析状态查询响应
export interface ParseResumeStatusResponse {
  success: boolean;
  message?: string;
  data?: {
    state: string;
    result?: ResumeParseResult;
    failedReason?: string;
  };
}

/**
 * 提交简历解析任务（异步）
 * @param file 简历文件
 */
export function parseResume(file: File): Promise<ParseResumeJobResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/candidates/parse-resume', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }) as Promise<ParseResumeJobResponse>;
}

/**
 * 查询简历解析任务状态
 * @param jobId 任务ID
 */
export function getParseResumeStatus(jobId: string): Promise<ParseResumeStatusResponse> {
  return request.get(`/candidates/parse-resume/${jobId}`) as Promise<ParseResumeStatusResponse>;
}
