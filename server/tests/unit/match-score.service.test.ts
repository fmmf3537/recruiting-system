import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma（含 aiMatchScore / dictionary / candidate / job / operationLog 等模型）
vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    candidate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
    },
    aiMatchScore: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    dictionary: {
      count: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  };
  return { default: mock };
});

// Mock LLM（按测试需要控制返回值）
const callLLMMock = vi.fn();
vi.mock('../../src/lib/llm', () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
  extractResumeInfo: vi.fn(),
}));

import prisma from '../../src/lib/prisma';
import {
  GRADE_THRESHOLDS,
  PROMPT_VERSION,
  scoreCandidateForJob,
  listCandidateMatchScores,
  listJobMatchScores,
  computeResumeHash,
  computeJdHash,
} from '../../src/services/match-score.service';

describe('MatchScoreService - 简历自动打分单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('service.scoreCandidateForJob - 服务端重算校验 LLM 综合分', () => {
    const baseCandidate = {
      id: 'cand-1',
      name: '张三',
      skills: ['JavaScript', 'TypeScript', 'Vue.js'],
      workYears: 5,
      education: '本科',
      school: '清华大学',
      currentCompany: 'Acme',
      currentPosition: '前端工程师',
      createdById: 'user-1',
      workHistories: [
        { company: 'Acme', position: '前端工程师', startDate: new Date('2021-01-01'), endDate: null, description: '负责核心业务' },
      ],
    };
    const baseJob = {
      id: 'job-1',
      title: '高级前端工程师',
      level: 'P6',
      type: '社招',
      description: '负责核心业务开发',
      requirements: '5年以上经验',
      skills: ['Vue.js', 'TypeScript'],
    };

    it('服务端按字典权重重算纠正 LLM 自报的 overallScore（不信任 LLM 综合分）', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(baseCandidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(baseJob as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-1',
        ...args.create,
      }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      // LLM 自报 overallScore=999（明显错误），所有维度都给 80 分
      // 兜底默认权重下：4 个高权重维度（40/25/15/10）+ 加分项（10）= 都 80
      // 加权：(80*40 + 80*25 + 80*15 + 80*10 + 80*10) / 100 = 80
      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 80 },
            { code: 'experience_match', score: 80 },
            { code: 'education_match', score: 80 },
            { code: 'stability', score: 80 },
            { code: 'bonus', score: 80 },
          ],
          summary: '基本匹配',
          highlights: [],
          risks: [],
          overallScore: 999, // LLM 自报 999 应被忽略
          grade: 'strong_recommend',
        }),
      });

      const result = await scoreCandidateForJob('cand-1', 'job-1', {
        triggeredBy: 'manual',
        createdById: 'user-1',
      });

      // 综合分由服务端重算得出，应为 80（不是 LLM 的 999）
      expect(result.overallScore).toBe(80);
      expect(result.grade).toBe('recommend'); // 80 >= 70 but < 85
    });

    it('综合分 ≥85 给出 strong_recommend', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(baseCandidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(baseJob as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-2',
        ...args.create,
      }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      // 所有维度 90 分：加权 = 90
      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 90 },
            { code: 'experience_match', score: 90 },
            { code: 'education_match', score: 90 },
            { code: 'stability', score: 90 },
            { code: 'bonus', score: 90 },
          ],
          summary: '强匹配',
          highlights: [],
          risks: [],
        }),
      });

      const result = await scoreCandidateForJob('cand-1', 'job-1', { triggeredBy: 'auto' });
      expect(result.overallScore).toBe(90);
      expect(result.grade).toBe('strong_recommend');
    });

    it('综合分 70-84 给出 recommend', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(baseCandidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(baseJob as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-3',
        ...args.create,
      }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 70 },
            { code: 'experience_match', score: 70 },
            { code: 'education_match', score: 70 },
            { code: 'stability', score: 70 },
            { code: 'bonus', score: 70 },
          ],
          summary: '基本匹配',
          highlights: [],
          risks: [],
        }),
      });

      const result = await scoreCandidateForJob('cand-1', 'job-1', { triggeredBy: 'auto' });
      expect(result.overallScore).toBe(70);
      expect(result.grade).toBe('recommend');
    });

    it('综合分 50-69 给出 consider', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(baseCandidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(baseJob as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-4',
        ...args.create,
      }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 60 },
            { code: 'experience_match', score: 60 },
            { code: 'education_match', score: 60 },
            { code: 'stability', score: 60 },
            { code: 'bonus', score: 60 },
          ],
          summary: '',
          highlights: [],
          risks: [],
        }),
      });

      const result = await scoreCandidateForJob('cand-1', 'job-1', { triggeredBy: 'auto' });
      expect(result.overallScore).toBe(60);
      expect(result.grade).toBe('consider');
    });

    it('综合分 <50 给出 not_recommend', async () => {
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(baseCandidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(baseJob as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-5',
        ...args.create,
      }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 30 },
            { code: 'experience_match', score: 30 },
            { code: 'education_match', score: 30 },
            { code: 'stability', score: 30 },
            { code: 'bonus', score: 30 },
          ],
          summary: '',
          highlights: [],
          risks: [],
        }),
      });

      const result = await scoreCandidateForJob('cand-1', 'job-1', { triggeredBy: 'auto' });
      expect(result.overallScore).toBe(30);
      expect(result.grade).toBe('not_recommend');
    });
  });

  describe('service.scoreCandidateForJob - hash 去重', () => {
    it('已有同 candidate+job 记录且 resumeHash/jdHash 均相同时直接返回旧记录（不调 LLM）', async () => {
      const candidate = {
        id: 'cand-2',
        name: '李四',
        skills: ['Go'],
        workYears: 3,
        education: '本科',
        school: '北大',
        currentCompany: 'X',
        currentPosition: '工程师',
        createdById: 'user-1',
        workHistories: [],
      };
      const job = {
        id: 'job-2',
        title: '后端',
        level: 'P5',
        type: '社招',
        description: '负责后端',
        requirements: '3年经验',
        skills: ['Go'],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);

      const existing = {
        id: 'ams-existing',
        candidateId: 'cand-2',
        jobId: 'job-2',
        overallScore: 75,
        grade: 'recommend',
        summary: '匹配',
        dimensions: [],
        risks: null,
        highlights: null,
        stale: false,
        triggeredBy: 'auto',
        createdAt: new Date(),
        updatedAt: new Date(),
        // resumeHash / jdHash 与 service 内 buildCandidatePayload + 现算结果一致，确保命中 hash 去重分支
        resumeHash: computeResumeHash({
          name: candidate.name,
          skills: candidate.skills,
          workYears: candidate.workYears,
          education: candidate.education,
          school: candidate.school,
          currentCompany: candidate.currentCompany,
          currentPosition: candidate.currentPosition,
          workHistories: [],
        }),
        jdHash: computeJdHash(job.description, job.requirements),
        // promptVersion 与当前一致，才会命中去重（见 PROMPT_VERSION）
        promptVersion: PROMPT_VERSION,
      };
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(existing as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await scoreCandidateForJob('cand-2', 'job-2', { triggeredBy: 'manual', createdById: 'user-1' });

      // 返回旧记录
      expect(result.id).toBe('ams-existing');
      expect(result.overallScore).toBe(75);
      expect(callLLMMock).not.toHaveBeenCalled();
      // OperationLog 应标记 deduped: true
      expect(vi.mocked(prisma.operationLog.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_match_score',
            detail: expect.objectContaining({ deduped: true }),
          }),
        })
      );
    });

    it('promptVersion 与当前 PROMPT_VERSION 不一致时即使简历/JD hash 未变也重新打分（旧 prompt 结果失效）', async () => {
      const candidate = {
        id: 'cand-2b',
        name: '李四',
        skills: ['Go'],
        workYears: 3,
        education: '本科',
        school: '北大',
        currentCompany: 'X',
        currentPosition: '工程师',
        createdById: 'user-1',
        workHistories: [],
      };
      const job = {
        id: 'job-2b',
        title: '后端',
        level: 'P5',
        type: '社招',
        description: '负责后端',
        requirements: '3年经验',
        skills: ['Go'],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);

      // 旧版本（v1）缓存：hash 与现算一致，但 promptVersion 过期 → 不得直接复用
      const existing = {
        id: 'ams-old-version',
        candidateId: 'cand-2b',
        jobId: 'job-2b',
        overallScore: 75,
        grade: 'recommend',
        summary: '旧 prompt 结果',
        dimensions: [],
        risks: null,
        highlights: null,
        stale: false,
        triggeredBy: 'auto',
        createdAt: new Date(),
        updatedAt: new Date(),
        resumeHash: computeResumeHash({
          name: candidate.name,
          skills: candidate.skills,
          workYears: candidate.workYears,
          education: candidate.education,
          school: candidate.school,
          currentCompany: candidate.currentCompany,
          currentPosition: candidate.currentPosition,
          workHistories: [],
        }),
        jdHash: computeJdHash(job.description, job.requirements),
        promptVersion: 'v1',
      };
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(existing as any);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 88 },
            { code: 'experience_match', score: 88 },
            { code: 'education_match', score: 88 },
            { code: 'stability', score: 88 },
            { code: 'bonus', score: 88 },
          ],
          summary: '新版本重算',
          highlights: [],
          risks: [],
        }),
      });
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-refreshed',
        ...args.create,
      }));

      const result = await scoreCandidateForJob('cand-2b', 'job-2b', {
        triggeredBy: 'manual',
        createdById: 'user-1',
      });

      // 旧缓存未直接返回：重新调 LLM 并 upsert 覆盖，落新 promptVersion
      expect(callLLMMock).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('ams-refreshed');
      expect(result.overallScore).toBe(88);
      expect(vi.mocked(prisma.aiMatchScore.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ promptVersion: PROMPT_VERSION }),
          update: expect.objectContaining({ promptVersion: PROMPT_VERSION }),
        })
      );
    });
  });

  describe('service.scoreCandidateForJob - prompt 注入评估基准日期', () => {
    it('打分 prompt 显式包含当前日期，作为 LLM 判断时间先后与在职时长的“今天”基准', async () => {
      const candidate = {
        id: 'cand-7',
        name: '周九',
        skills: [],
        workYears: 1,
        education: '本科',
        school: null,
        currentCompany: 'Z',
        currentPosition: '工程师',
        createdById: 'user-1',
        workHistories: [
          // 复现线上误判场景：当前工作（至今）起始于 2025 年，对 2026 年的"今天"而言是过去
          { company: 'Z', position: '工程师', startDate: new Date('2025-03-01'), endDate: null, description: '' },
        ],
      };
      const job = {
        id: 'job-7',
        title: '工程师',
        level: 'P5',
        type: '社招',
        description: 'xx',
        requirements: 'xx',
        skills: [],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-7',
        ...args.create,
      }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      // 断言 userPrompt（mock 第一参）包含"评估基准日期 + 当天日期"
      callLLMMock.mockImplementation(async (prompt: string) => {
        const now = new Date();
        const expectedDate = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
        expect(prompt).toContain('评估基准日期');
        expect(prompt).toContain('“今天”');
        expect(prompt).toContain(expectedDate);
        return {
          content: JSON.stringify({
            dimensions: [
              { code: 'skill_match', score: 60 },
              { code: 'experience_match', score: 60 },
              { code: 'education_match', score: 60 },
              { code: 'stability', score: 60 },
              { code: 'bonus', score: 60 },
            ],
            summary: '',
            highlights: [],
            risks: [],
          }),
        };
      });

      const result = await scoreCandidateForJob('cand-7', 'job-7', { triggeredBy: 'auto' });
      expect(result.overallScore).toBe(60);
    });
  });

  describe('service.scoreCandidateForJob - 字典回退', () => {
    it('字典空时回退 DEFAULT_MATCH_DIMENSIONS 维度', async () => {
      const candidate = {
        id: 'cand-3',
        name: '王五',
        skills: [],
        workYears: 1,
        education: '大专',
        school: null,
        currentCompany: null,
        currentPosition: null,
        createdById: 'user-1',
        workHistories: [],
      };
      const job = {
        id: 'job-3',
        title: '初级',
        level: 'P4',
        type: '实习',
        description: '初级',
        requirements: '入门',
        skills: [],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      // 期望 prompt 含 5 个兜底维度
      callLLMMock.mockImplementation(async (prompt: string) => {
        expect(prompt).toContain('专业技能匹配');
        expect(prompt).toContain('工作经验与年限');
        expect(prompt).toContain('学历与院校背景');
        expect(prompt).toContain('职业稳定性');
        expect(prompt).toContain('加分项');
        return {
          content: JSON.stringify({
            dimensions: [
              { code: 'skill_match', score: 50 },
              { code: 'experience_match', score: 50 },
              { code: 'education_match', score: 50 },
              { code: 'stability', score: 50 },
              { code: 'bonus', score: 50 },
            ],
            summary: '',
            highlights: [],
            risks: [],
          }),
        };
      });
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({ id: 'ams-3', ...args.create }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await scoreCandidateForJob('cand-3', 'job-3', { triggeredBy: 'auto' });
      expect(result.overallScore).toBe(50);
    });

    it('权重全部解析失败时回退等权', async () => {
      const candidate = {
        id: 'cand-4',
        name: '赵六',
        skills: [],
        workYears: 1,
        education: '高中',
        school: null,
        currentCompany: null,
        currentPosition: null,
        createdById: 'user-1',
        workHistories: [],
      };
      const job = {
        id: 'job-4',
        title: '打包员',
        level: 'P3',
        type: '社招',
        description: '包装',
        requirements: '',
        skills: [],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      // 字典存在但 description 都是 "abc" 无法 parseInt → 权重 0 → 回退等权
      vi.mocked(prisma.dictionary.count).mockResolvedValue(3);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([
        { code: 'skill_match', name: '专业技能匹配', sortOrder: 1, enabled: true, description: 'abc' },
        { code: 'experience_match', name: '工作经验与年限', sortOrder: 2, enabled: true, description: 'abc' },
        { code: 'bonus', name: '加分项', sortOrder: 3, enabled: true, description: 'abc' },
      ] as any);
      callLLMMock.mockImplementation(async (prompt: string) => {
        // 等权时权重均为 100/3
        expect(prompt).toContain('weight: 33.');
        return {
          content: JSON.stringify({
            dimensions: [
              { code: 'skill_match', score: 90 },
              { code: 'experience_match', score: 60 },
              { code: 'bonus', score: 60 },
            ],
            summary: '',
            highlights: [],
            risks: [],
          }),
        };
      });
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({ id: 'ams-4', ...args.create }));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await scoreCandidateForJob('cand-4', 'job-4', { triggeredBy: 'auto' });
      // 等权下：(90 + 60 + 60) / 3 = 70
      expect(result.overallScore).toBe(70);
      expect(result.grade).toBe('recommend');
    });
  });

  describe('service.scoreCandidateForJob - LLM 失败', () => {
    it('LLM 两次失败时抛 AppError 且写 OperationLog（detail 标 error）', async () => {
      const candidate = {
        id: 'cand-5',
        name: '钱七',
        skills: [],
        workYears: 1,
        education: '本科',
        school: null,
        currentCompany: null,
        currentPosition: null,
        createdById: 'user-1',
        workHistories: [],
      };
      const job = {
        id: 'job-5',
        title: '工程师',
        level: 'P5',
        type: '社招',
        description: 'xx',
        requirements: 'xx',
        skills: [],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      // LLM 第一次抛错，第二次再抛（重试 1 次后仍失败）
      callLLMMock.mockRejectedValue(new Error('upstream error'));
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(scoreCandidateForJob('cand-5', 'job-5', { triggeredBy: 'auto' }))
        .rejects.toThrow('AI 打分失败');

      expect(callLLMMock).toHaveBeenCalledTimes(2);
      // 失败 OperationLog 写入
      expect(vi.mocked(prisma.operationLog.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_match_score',
            detail: expect.objectContaining({ error: expect.any(String) }),
          }),
        })
      );
    });
  });

  describe('upsert 幂等', () => {
    it('调用两次对同一 candidateId+jobId 仅落一份记录（不抛错，upsert 覆盖）', async () => {
      const candidate = {
        id: 'cand-6',
        name: '孙八',
        skills: ['Python'],
        workYears: 2,
        education: '本科',
        school: '上交',
        currentCompany: 'Y',
        currentPosition: '工程师',
        createdById: 'user-1',
        workHistories: [],
      };
      const job = {
        id: 'job-6',
        title: 'Python',
        level: 'P5',
        type: '社招',
        description: 'Python 后端',
        requirements: '熟悉 Python',
        skills: ['Python'],
      };
      vi.mocked(prisma.candidate.findUnique).mockResolvedValue(candidate as any);
      vi.mocked(prisma.job.findUnique).mockResolvedValue(job as any);
      vi.mocked(prisma.dictionary.count).mockResolvedValue(0);
      vi.mocked(prisma.dictionary.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      callLLMMock.mockResolvedValue({
        content: JSON.stringify({
          dimensions: [
            { code: 'skill_match', score: 80 },
            { code: 'experience_match', score: 80 },
            { code: 'education_match', score: 80 },
            { code: 'stability', score: 80 },
            { code: 'bonus', score: 80 },
          ],
          summary: '匹配',
          highlights: [],
          risks: [],
        }),
      });
      vi.mocked(prisma.aiMatchScore.upsert).mockImplementation(async (args: any) => ({
        id: 'ams-same',
        ...args.create,
      }));

      const r1 = await scoreCandidateForJob('cand-6', 'job-6', { triggeredBy: 'manual' });
      const r2 = await scoreCandidateForJob('cand-6', 'job-6', { triggeredBy: 'manual' });

      // 两次都成功，upsert 被调用 2 次（覆盖语义）
      expect(r1.id).toBe('ams-same');
      expect(r2.id).toBe('ams-same');
      expect(prisma.aiMatchScore.upsert).toHaveBeenCalledTimes(2);
      // 两次都用同一 candidateId_jobId 唯一键
      expect(prisma.aiMatchScore.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { candidateId_jobId: { candidateId: 'cand-6', jobId: 'job-6' } },
        })
      );
    });
  });

  describe('service.listCandidateMatchScores / listJobMatchScores', () => {
    it('listCandidateMatchScores 直接调用 assertCandidateVisible', async () => {
      vi.mocked(prisma.candidate.count).mockResolvedValue(0);
      await expect(
        listCandidateMatchScores('cand-x', { userId: 'u', isAdmin: false, department: '技术部', role: 'hr' })
      ).rejects.toThrow();
    });

    it('listJobMatchScores - 非 admin 且 scope.department 非空，job.departments 不含该部门时返回 403', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-y',
        departments: ['市场部'],
      } as any);
      await expect(
        listJobMatchScores('job-y', { userId: 'u', isAdmin: false, department: '技术部', role: 'hr' })
      ).rejects.toThrow('无权访问该职位的打分');
    });

    it('listJobMatchScores - admin 可见全量（不校验 department）', async () => {
      vi.mocked(prisma.job.findUnique).mockResolvedValue({
        id: 'job-z',
        departments: ['某部门'],
      } as any);
      vi.mocked(prisma.aiMatchScore.findMany).mockResolvedValue([
        {
          id: 'ams-z',
          candidateId: 'cand-z',
          jobId: 'job-z',
          overallScore: 88,
          grade: 'strong_recommend',
          summary: null,
          dimensions: [{ name: '专业技能匹配', score: 88 }],
          risks: null,
          highlights: null,
          stale: false,
          triggeredBy: 'manual',
          createdAt: new Date(),
          updatedAt: new Date(),
          candidate: { name: '某人' },
        },
      ] as any);

      const result = await listJobMatchScores('job-z', {
        userId: 'admin-1',
        isAdmin: true,
        department: null,
        role: 'admin',
      });
      expect(result).toHaveLength(1);
      expect(result[0].candidateName).toBe('某人');
    });
  });

  describe('grade 阈值边界常量', () => {
    it('GRADE_THRESHOLDS 应包含四个等级', () => {
      const grades = GRADE_THRESHOLDS.map((t) => t.grade);
      expect(grades).toEqual(['strong_recommend', 'recommend', 'consider', 'not_recommend']);
    });
  });
});
