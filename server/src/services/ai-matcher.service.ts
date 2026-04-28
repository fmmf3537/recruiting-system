import prisma from '../lib/prisma';
import { callLLM } from '../lib/llm';
import { AppError } from '../middleware/errorHandler';

export interface CandidateForMatch {
  id: string;
  name: string;
  currentPosition: string | null;
  workYears: number | null;
  education: string | null;
  skills: string[];
}

export interface MatchResult {
  candidateId: string;
  matchScore: number;
  reason: string;
}

/**
 * 为指定职位推荐匹配的候选人
 * @param jobId 职位ID
 * @param limit 最多推荐人数
 */
export async function recommendCandidatesForJob(
  jobId: string,
  limit = 5
): Promise<MatchResult[]> {
  // 获取职位详情
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      skills: true,
      requirements: true,
      description: true,
      level: true,
    },
  });

  if (!job) {
    throw new AppError('职位不存在', 404);
  }

  // 从人才库获取候选人（未关联任何职位的候选人）
  const candidates = await prisma.candidate.findMany({
    where: {
      candidateJobs: { none: {} },
    },
    select: {
      id: true,
      name: true,
      currentPosition: true,
      workYears: true,
      education: true,
      skills: true,
    },
    take: 20, // 限制候选人数，减少 LLM 计算量
    orderBy: { updatedAt: 'desc' },
  });

  if (candidates.length === 0) {
    return [];
  }

  // 构建 Prompt
  const jobSkills = Array.isArray(job.skills) ? job.skills.join(', ') : '';
  const candidatesJson = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    currentPosition: c.currentPosition,
    workYears: c.workYears,
    education: c.education,
    skills: Array.isArray(c.skills) ? c.skills : [],
  }));

  const systemPrompt = `你是一位资深招聘顾问。请根据职位要求，从候选人列表中推荐最匹配的候选人。
只返回 JSON 格式，不要包含其他文字。`;

  const userPrompt = `职位：${job.title}
职级：${job.level || '未指定'}
要求技能：${jobSkills}
职位描述：${job.description || ''}
任职要求：${job.requirements || ''}

候选人列表：
${JSON.stringify(candidatesJson, null, 2)}

请返回 JSON 格式：
{
  "recommendations": [
    {
      "candidateId": "...",
      "matchScore": 85,
      "reason": "3年相关经验，技能高度匹配..."
    }
  ]
}

要求：
1. 最多推荐 ${limit} 位候选人
2. matchScore 范围 0-100
3. 如果没有匹配的候选人，返回空数组
4. 必须严格使用候选人列表中的 candidateId`;

  try {
    const result = await callLLM(userPrompt, systemPrompt);

    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);
    const recommendations: MatchResult[] = parsed.recommendations || [];

    // 过滤无效的推荐（确保 candidateId 在列表中）
    const validIds = new Set(candidates.map((c) => c.id));
    return recommendations.filter((r) => validIds.has(r.candidateId));
  } catch (error: any) {
    console.error('[AI Matcher] LLM 调用或解析失败:', error);
    throw new AppError('AI 匹配失败，请稍后重试', 500);
  }
}
