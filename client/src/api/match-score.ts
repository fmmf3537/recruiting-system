import request from '@/utils/request';

// ============ 类型（与 server match-score.service.ts ScoreResult 对齐） ============

// 评分维度项（server MatchDimensionOutput）
export interface MatchDimension {
  code?: string;
  name: string;
  weight?: number;
  score: number;
  comment?: string;
}

// 单条打分对象（server ScoreResult；列表接口额外带回填字段）
export interface MatchScore {
  id: string;
  candidateId: string;
  jobId: string;
  overallScore: number;
  grade: string;
  summary: string | null;
  dimensions: MatchDimension[];
  risks: string[] | null;
  highlights: string[] | null;
  stale: boolean;
  triggeredBy: string;
  createdAt: string;
  updatedAt: string;
}

// 候选人维度列表（每条带关联 job 标题）
export interface CandidateMatchScore extends MatchScore {
  jobTitle: string;
}

// 职位维度列表（每条带候选人姓名；server 已按 overallScore desc 排序）
export interface JobMatchScore extends MatchScore {
  candidateName: string;
}

export interface MatchScoreResponse<T> {
  success: boolean;
  data: T;
}

// ============ 接口 ============

/**
 * 触发对指定候选人-职位组合打分（同步执行，LLM 调用最长 60s）
 * @param candidateId 候选人 ID
 * @param jobId 关联职位 ID
 */
export function triggerMatchScore(
  candidateId: string,
  jobId: string
): Promise<MatchScoreResponse<MatchScore>> {
  return request.post(`/candidates/${candidateId}/match-score`, { jobId }) as Promise<
    MatchScoreResponse<MatchScore>
  >;
}

/**
 * 获取候选人全部职位打分列表（含职位标题，按更新时间倒序）
 */
export function getCandidateMatchScores(
  candidateId: string
): Promise<MatchScoreResponse<CandidateMatchScore[]>> {
  return request.get(`/candidates/${candidateId}/match-scores`) as Promise<
    MatchScoreResponse<CandidateMatchScore[]>
  >;
}

/**
 * 获取职位下候选人打分列表（含候选人姓名，server 已按 overallScore desc 排序）
 */
export function getJobMatchScores(
  jobId: string
): Promise<MatchScoreResponse<JobMatchScore[]>> {
  return request.get(`/jobs/${jobId}/match-scores`) as Promise<
    MatchScoreResponse<JobMatchScore[]>
  >;
}