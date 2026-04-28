import request from '@/utils/request';

export interface MatchResult {
  candidateId: string;
  matchScore: number;
  reason: string;
}

export function getRecommendations(jobId: string, limit = 5): Promise<{
  success: boolean;
  data: MatchResult[];
}> {
  return request.get(`/ai-matcher/jobs/${jobId}/recommendations`, { params: { limit } }) as Promise<{
    success: boolean;
    data: MatchResult[];
  }>;
}
