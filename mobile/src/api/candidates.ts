import request from '@/lib/request';

export type Gender = '男' | '女';
export type CandidateStage = '入库' | '初筛' | '复试' | '终面' | '拟录用' | 'Offer' | '入职';
export type StageStatus = 'in_progress' | 'passed' | 'rejected';
export type InterviewRound = '初试' | '复试' | '终面';
export type InterviewConclusion = 'pass' | 'reject' | 'pending';

export interface CandidateListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  source?: string;
  stage?: string;
  status?: StageStatus;
  education?: string;
}

export interface WorkHistory {
  id?: string;
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

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
  intro?: string;
  jobIds?: string[];
  workHistory?: WorkHistory[];
}

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
  intro?: string;
}

export interface AdvanceStageParams {
  stage: CandidateStage;
  status: StageStatus;
  rejectReason?: string;
  assigneeId?: string;
  note?: string;
}

export interface InterviewFeedbackParams {
  round: InterviewRound;
  interviewerName: string;
  interviewTime: string;
  conclusion: InterviewConclusion;
  feedbackContent: string;
  rejectReason?: string;
}

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
  intro: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  stageRecords: {
    stage: CandidateStage;
    status: StageStatus;
  }[];
  candidateJobs: {
    id: string;
    candidateId: string;
    jobId: string;
    createdAt: string;
    job: {
      id: string;
      title: string;
    };
  }[];
  currentStage: string;
  stageStatus: string;
  workHistory?: WorkHistory[];
}

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

export interface CandidateDetailData {
  success: boolean;
  data: CandidateDetail;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export interface InterviewFeedbackListData {
  success: boolean;
  data: InterviewFeedback[];
}

export function getCandidateList(params?: CandidateListParams): Promise<CandidateListData> {
  return request.get('/api/candidates', { params });
}

export function getCandidateById(id: string): Promise<CandidateDetailData> {
  return request.get(`/api/candidates/${id}`);
}

export function createCandidate(data: CreateCandidateParams): Promise<OperationResult> {
  return request.post('/api/candidates', data);
}

export function updateCandidate(id: string, data: UpdateCandidateParams): Promise<OperationResult> {
  return request.patch(`/api/candidates/${id}`, data);
}

export function advanceStage(id: string, data: AdvanceStageParams): Promise<OperationResult> {
  return request.post(`/api/candidates/${id}/stage`, data);
}

export function addInterviewFeedback(id: string, data: InterviewFeedbackParams): Promise<OperationResult> {
  return request.post(`/api/candidates/${id}/feedback`, data);
}

export function getInterviewFeedbacks(id: string): Promise<InterviewFeedbackListData> {
  return request.get(`/api/candidates/${id}/feedback`);
}
