import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma：覆盖 interview / interviewQuestionOutline / interviewEvaluation / interviewFeedback / aiMatchScore / dictionary / operationLog / candidate / job / user
vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    interview: {
      findUnique: vi.fn(),
    },
    interviewQuestionOutline: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    interviewEvaluation: {
      findMany: vi.fn(),
    },
    interviewFeedback: {
      findMany: vi.fn(),
    },
    aiMatchScore: {
      findUnique: vi.fn(),
    },
    dictionary: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    candidate: {
      // 仅用于 assertCandidateVisible 触发的 count
      count: vi.fn(),
    },
  };
  return { default: mock };
});

// Mock LLM
const callLLMMock = vi.fn();
vi.mock('../../src/lib/llm', () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
  extractResumeInfo: vi.fn(),
}));

import prisma from '../../src/lib/prisma';
import {
  MAX_OUTLINE_VERSIONS,
  generateOutline,
  listOutlines,
  finalizeOutline,
} from '../../src/services/interview-outline.service';

// 合法 cuid（c 开头 + 24 位小写字母数字），参考 match-score.test.ts
const INT_ID = 'clf3stest0000000000000001';
const CAND_ID = 'clf3stest0000000000000002';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-other';

const baseInterview = {
  id: INT_ID,
  candidateId: CAND_ID,
  jobId: 'clf3stest0000000000000003',
  scheduledAt: new Date('2026-09-15T10:00:00Z'),
  duration: 60,
  round: '复试',
  type: '视频',
  interviewers: [{ id: USER_ID, name: '王老师' }],
  candidate: {
    id: CAND_ID,
    name: '张三',
    skills: ['Vue'],
    workYears: 5,
    education: '本科',
    school: '清华',
    currentCompany: 'Acme',
    currentPosition: '前端',
    workHistories: [],
  },
  job: {
    id: 'clf3stest0000000000000003',
    title: '高级前端',
    level: 'P6',
    type: '社招',
    description: '负责核心',
    requirements: '5年经验',
  },
};

// 字典启用项（仅 hr / tech，触发 focusType=hr 合法路径）
const focusDictItems = [
  { id: 'd1', category: 'interview_focus_type', code: 'hr', name: 'HR面', sortOrder: 1, enabled: true, description: null, createdAt: new Date(), updatedAt: new Date() },
  { id: 'd2', category: 'interview_focus_type', code: 'tech', name: '技术面', sortOrder: 2, enabled: true, description: null, createdAt: new Date(), updatedAt: new Date() },
];

const validOutlineJson = {
  sections: [
    {
      theme: '求职动机',
      questions: [
        { question: '为什么看机会？', intent: '考察稳定性', referenceAnswer: '关注原因合理性' },
      ],
    },
  ],
  durationAdvice: '前 20 分钟聊动机，后 40 分钟聊项目',
};

describe('InterviewOutlineService - 面试问题一键生成单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 字典默认存在（focusType 校验）
    vi.mocked(prisma.dictionary.count).mockResolvedValue(1);
    vi.mocked(prisma.dictionary.findMany).mockImplementation(async (args: any) => {
      if (args?.where?.category === 'interview_focus_type') return focusDictItems as any;
      return [];
    });
    // 历史反馈为空
    vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interviewFeedback.findMany).mockResolvedValue([]);
    // AiMatchScore 查不到
    vi.mocked(prisma.aiMatchScore.findUnique).mockResolvedValue(null);
    // 默认没有版本
    vi.mocked(prisma.interviewQuestionOutline.count).mockResolvedValue(0);
    vi.mocked(prisma.interviewQuestionOutline.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.interviewQuestionOutline.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interviewQuestionOutline.create).mockImplementation(async (args: any) => ({
      id: 'outline-1',
      interviewId: INT_ID,
      version: args.data.version,
      focusType: args.data.focusType,
      outline: args.data.outline,
      adjustNote: args.data.adjustNote ?? null,
      editedById: args.data.editedById ?? null,
      createdById: args.data.createdById,
      createdAt: new Date(),
    }));
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.candidate.count).mockResolvedValue(1); // 可见性校验放行
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============ 正常路径 ============

  it('正常生成 v1：version=1、focusType 快照、adjustNote=null', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    callLLMMock.mockResolvedValueOnce({ content: JSON.stringify(validOutlineJson) });

    const result = await generateOutline(
      INT_ID,
      { focusType: 'hr' },
      { userId: USER_ID, role: 'admin', department: null },
    );

    expect(result.version).toBe(1);
    expect(result.focusType).toBe('hr');
    expect(result.adjustNote).toBeNull();
    expect(callLLMMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'interview-outline');
    // 成功 OperationLog
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          targetType: 'Interview',
          targetId: INT_ID,
          action: 'ai_question_outline',
          detail: expect.objectContaining({ success: true, version: 1, focusType: 'hr' }),
        }),
      }),
    );
  });

  it('带 adjustNote 再生成 v2：prompt 中包含上一版内容与调整指令', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    // 已有 v1
    vi.mocked(prisma.interviewQuestionOutline.count).mockResolvedValue(1);
    vi.mocked(prisma.interviewQuestionOutline.findFirst).mockResolvedValue({
      id: 'outline-old',
      interviewId: INT_ID,
      version: 1,
      focusType: 'hr',
      outline: validOutlineJson,
      adjustNote: null,
      editedById: null,
      createdById: USER_ID,
      createdAt: new Date(),
    } as any);
    // 二次 create 返回 v2
    vi.mocked(prisma.interviewQuestionOutline.create).mockImplementation(async (args: any) => ({
      id: 'outline-2',
      interviewId: INT_ID,
      version: args.data.version,
      focusType: args.data.focusType,
      outline: args.data.outline,
      adjustNote: args.data.adjustNote ?? null,
      editedById: null,
      createdById: args.data.createdById,
      createdAt: new Date(),
    }));
    callLLMMock.mockResolvedValueOnce({ content: JSON.stringify(validOutlineJson) });

    await generateOutline(
      INT_ID,
      { focusType: 'hr', adjustNote: '请增加技术深度' },
      { userId: USER_ID, role: 'admin', department: null },
    );

    // 断言 prompt 中包含上一版内容 + 调整指令
    const callArgs = callLLMMock.mock.calls[0];
    const userPrompt = callArgs[0] as string;
    expect(userPrompt).toContain('调整指令');
    expect(userPrompt).toContain('请增加技术深度');
    expect(userPrompt).toContain('version=1');
  });

  // ============ 校验路径 ============

  it('focusType 非字典 enabled 项 → 400', async () => {
    // 字典不含 bogus
    await expect(
      generateOutline(
        INT_ID,
        { focusType: 'bogus' },
        { userId: USER_ID, role: 'admin', department: null },
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('考察方向无效') });
    expect(callLLMMock).not.toHaveBeenCalled();
  });

  it('focusType 空字符串 → 400', async () => {
    await expect(
      generateOutline(
        INT_ID,
        { focusType: '' },
        { userId: USER_ID, role: 'admin', department: null },
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('focusType 必填') });
  });

  it('版本已达上限（10） → 400', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    vi.mocked(prisma.interviewQuestionOutline.count).mockResolvedValue(MAX_OUTLINE_VERSIONS);
    await expect(
      generateOutline(
        INT_ID,
        { focusType: 'hr' },
        { userId: USER_ID, role: 'admin', department: null },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('版本数已达上限'),
    });
    expect(callLLMMock).not.toHaveBeenCalled();
  });

  it('interviewer 非该场面试官 → 403', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    await expect(
      generateOutline(
        INT_ID,
        { focusType: 'hr' },
        { userId: OTHER_USER_ID, role: 'interviewer', department: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(callLLMMock).not.toHaveBeenCalled();
  });

  it('interviewer 是该场面试官 → 放行', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    callLLMMock.mockResolvedValueOnce({ content: JSON.stringify(validOutlineJson) });
    const result = await generateOutline(
      INT_ID,
      { focusType: 'hr' },
      { userId: USER_ID, role: 'interviewer', department: null }, // USER_ID 在 interviewers 中
    );
    expect(result.version).toBe(1);
  });

  // ============ LLM 重试 ============

  it('LLM 输出结构不合格 → 重试 1 次后仍失败 → AppError 500 + OperationLog 失败记录', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    // 两次返回都不合格
    callLLMMock
      .mockResolvedValueOnce({ content: JSON.stringify({ sections: [] }) }) // 空 sections 不合格
      .mockResolvedValueOnce({ content: JSON.stringify({ sections: [{ theme: 'x', questions: [] }] }) }); // 空 questions 不合格

    await expect(
      generateOutline(
        INT_ID,
        { focusType: 'hr' },
        { userId: USER_ID, role: 'admin', department: null },
      ),
    ).rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('AI 大纲生成失败') });

    // 调用了 2 次（首调 + 1 次重试）
    expect(callLLMMock).toHaveBeenCalledTimes(2);
    // 失败 OperationLog 已写
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ai_question_outline',
          detail: expect.objectContaining({ success: false }),
        }),
      }),
    );
  });

  // ============ finalizeOutline ============

  it('finalizeOutline：结构不合格 → 400', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    await expect(
      finalizeOutline(
        INT_ID,
        1,
        { sections: [] },
        { userId: USER_ID, role: 'admin', department: null },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.interviewQuestionOutline.update).not.toHaveBeenCalled();
  });

  it('finalizeOutline：成功时不调 LLM + 写入 editedById', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    vi.mocked(prisma.interviewQuestionOutline.findUnique).mockResolvedValue({
      id: 'outline-1',
      interviewId: INT_ID,
      version: 1,
      focusType: 'hr',
      outline: validOutlineJson,
      adjustNote: null,
      editedById: null,
      createdById: USER_ID,
      createdAt: new Date(),
    } as any);
    vi.mocked(prisma.interviewQuestionOutline.update).mockImplementation(async (args: any) => ({
      ...((await prisma.interviewQuestionOutline.findUnique({
        where: { interviewId_version: { interviewId: INT_ID, version: 1 } },
      })) as any),
      ...args.data,
    }));

    const result = await finalizeOutline(
      INT_ID,
      1,
      validOutlineJson,
      { userId: USER_ID, role: 'admin', department: null },
    );

    expect(result.editedById).toBe(USER_ID);
    expect(callLLMMock).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'question_outline_edit',
          detail: expect.objectContaining({ version: 1, editedById: USER_ID }),
        }),
      }),
    );
  });

  // ============ 历史反馈组装 ============

  it('前几轮反馈组装：有历史评估时 prompt 含其结论', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([
      {
        id: 'eval-1',
        interviewerId: USER_ID,
        submittedAt: new Date('2026-09-10T12:00:00Z'),
        overallScore: 4,
        conclusion: 'pass',
        dimensions: [{ name: '专业能力', score: 4 }],
        interviewer: { name: '王老师' },
        interview: { round: '初试', scheduledAt: new Date('2026-09-10T10:00:00Z') },
      },
    ] as any);
    callLLMMock.mockResolvedValueOnce({ content: JSON.stringify(validOutlineJson) });

    await generateOutline(
      INT_ID,
      { focusType: 'hr' },
      { userId: USER_ID, role: 'admin', department: null },
    );

    const userPrompt = callLLMMock.mock.calls[0][0] as string;
    expect(userPrompt).toContain('前几轮面试评估');
    expect(userPrompt).toContain('王老师');
    expect(userPrompt).toContain('综合分=4');
  });

  it('历史反馈为空时 prompt 含「首轮面试，无历史反馈」', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(baseInterview as any);
    callLLMMock.mockResolvedValueOnce({ content: JSON.stringify(validOutlineJson) });

    await generateOutline(
      INT_ID,
      { focusType: 'hr' },
      { userId: USER_ID, role: 'admin', department: null },
    );

    const userPrompt = callLLMMock.mock.calls[0][0] as string;
    expect(userPrompt).toContain('首轮面试，无历史反馈');
  });

  // ============ listOutlines ============

  it('listOutlines：面试不存在 → 404', async () => {
    vi.mocked(prisma.interview.findUnique).mockResolvedValue(null);
    await expect(
      listOutlines(INT_ID, { userId: USER_ID, role: 'admin', department: null }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});