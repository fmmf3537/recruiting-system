import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma
vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    job: {
      findMany: vi.fn(),
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
import { polishJd, draftJd } from '../../src/services/jd-assist.service';

describe('JdAssistService - JD 完善与辅助生成单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('polishJd', () => {
    it('正常路径：返回 issues + improvedJd，并写 OperationLog（成功）', async () => {
      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          issues: [
            { title: '缺少任职要求', detail: '需补充技能要求', severity: '高' },
            { title: '职责描述模糊', detail: '建议量化产出', severity: '中' },
          ],
          improvedJd: '## 岗位职责\n负责核心业务开发\n## 任职要求\n3 年以上经验\n## 加分项\n有大厂经验',
        }),
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await polishJd(
        {
          jdText: '负责核心业务开发。',
          meta: { title: '高级前端工程师', level: 'P6', departments: ['技术部'], type: '社招' },
        },
        'user-1'
      );

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toMatchObject({ title: '缺少任职要求', severity: '高' });
      expect(result.improvedJd).toContain('岗位职责');
      // LLM 调用 purpose 必须是 jd-polish
      expect(callLLMMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'jd-polish');
      // OperationLog 写入（action: ai_jd_polish, targetType: Job, targetId: 'new'）
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            targetType: 'Job',
            targetId: 'new',
            action: 'ai_jd_polish',
            detail: expect.objectContaining({ success: true }),
          }),
        })
      );
    });

    it('空 jdText 抛 AppError 400，且 OperationLog 记 success=false', async () => {
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(polishJd({ jdText: '   ' }, 'user-1')).rejects.toMatchObject({
        statusCode: 400,
        message: 'JD 内容不能为空',
      });
      // 不调 LLM
      expect(callLLMMock).not.toHaveBeenCalled();
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_jd_polish',
            detail: expect.objectContaining({ success: false }),
          }),
        })
      );
    });

    it('LLM 返回非法 JSON 时重试 1 次仍失败 → 抛 AppError 500', async () => {
      // 两次都返回非法 JSON
      callLLMMock.mockResolvedValue({
        content: 'not a json {{{{',
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(
        polishJd({ jdText: '合法的 JD 内容文本，用于测试' }, 'user-1')
      ).rejects.toMatchObject({
        statusCode: 500,
        message: 'AI 返回格式异常，请重试',
      });
      // 重试 1 次 → 共调 2 次
      expect(callLLMMock).toHaveBeenCalledTimes(2);
      // OperationLog 写失败（success=false, error 含失败信息）
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_jd_polish',
            detail: expect.objectContaining({ success: false, error: expect.any(String) }),
          }),
        })
      );
    });

    it('LLM 返回缺 improvedJd 字段 → 重试仍失败 → 抛 500', async () => {
      callLLMMock.mockResolvedValue({
        content: JSON.stringify({ issues: [{ title: 'x', detail: 'y', severity: '高' }] }),
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(
        polishJd({ jdText: '合法的 JD 内容文本，用于测试' }, 'user-1')
      ).rejects.toMatchObject({ statusCode: 500 });
      expect(callLLMMock).toHaveBeenCalledTimes(2);
    });

    it('issues 缺失字段（title/detail）→ 容错：归一化为空串，severity 非法值兜底为「中」', async () => {
      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          issues: [
            { detail: '仅有 detail' }, // 缺 title → 空串；缺 severity → '中'
            { title: '仅有 title', detail: 'detail', severity: '极高' }, // severity 非法 → '中'
            null, // null → 跳过
            { title: '正常', detail: 'detail', severity: '低' },
          ],
          improvedJd: '## 优化稿',
        }),
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await polishJd({ jdText: '合法的 JD 内容文本用于测试' }, 'user-1');

      expect(result.issues).toHaveLength(3); // null 被过滤
      expect(result.issues[0].title).toBe('');
      expect(result.issues[0].severity).toBe('中');
      expect(result.issues[1].severity).toBe('中');
      expect(result.issues[2].severity).toBe('低');
    });
  });

  describe('draftJd', () => {
    it('正常路径：参考 JD 存在时调用 LLM 返回 draftJd', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([
        {
          title: '前端工程师',
          description: 'A'.repeat(2000),
          requirements: 'B'.repeat(2000),
        },
      ] as any);
      callLLMMock.mockImplementation(async (_prompt: string, _sys: string, purpose: string) => {
        expect(purpose).toBe('jd-draft');
        return {
          content: JSON.stringify({
            draftJd: '## 岗位职责\nxxx\n## 任职要求\nxxx\n## 加分项\nxxx',
          }),
        };
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await draftJd(
        {
          title: '高级前端工程师',
          departments: ['技术部'],
          level: 'P6',
          type: '社招',
          freeText: '熟悉 Vue3',
        },
        'user-1'
      );

      expect(result.draftJd).toContain('岗位职责');
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: '社招', status: { not: 'closed' } }),
          take: 3,
        })
      );
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_jd_draft',
            detail: expect.objectContaining({ success: true, refCount: 1 }),
          }),
        })
      );
    });

    it('无参考 JD 时也能生成（不抛错），refCount=0', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([]);
      callLLMMock.mockResolvedValueOnce({
        content: JSON.stringify({
          draftJd: '## 岗位职责\nxxx\n## 任职要求\nxxx\n## 加分项\nxxx',
        }),
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      const result = await draftJd(
        { title: '工程师', departments: ['研发'], level: 'P5', type: '社招' },
        'user-1'
      );
      expect(result.draftJd).toContain('岗位职责');
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ detail: expect.objectContaining({ refCount: 0 }) }),
        })
      );
    });

    it('必填字段缺失（title 空）→ 抛 AppError 400', async () => {
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(
        draftJd(
          { title: '', departments: ['研发'], level: 'P5', type: '社招' },
          'user-1'
        )
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(callLLMMock).not.toHaveBeenCalled();
    });

    it('必填字段缺失（departments 空数组）→ 抛 AppError 400', async () => {
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(
        draftJd(
          { title: '工程师', departments: [], level: 'P5', type: '社招' },
          'user-1'
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('LLM 两次失败 → 抛 500，OperationLog 记失败', async () => {
      vi.mocked(prisma.job.findMany).mockResolvedValue([]);
      callLLMMock.mockResolvedValue({ content: 'not json' });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await expect(
        draftJd({ title: '工程师', departments: ['研发'], level: 'P5', type: '社招' }, 'user-1')
      ).rejects.toMatchObject({ statusCode: 500 });
      expect(callLLMMock).toHaveBeenCalledTimes(2);
    });

    it('参考 JD 截断逻辑：description/requirements 超 1500 字时被截', async () => {
      const longDesc = 'X'.repeat(3000);
      const longReq = 'Y'.repeat(3000);
      vi.mocked(prisma.job.findMany).mockResolvedValue([
        { title: 'ref-1', description: longDesc, requirements: longReq },
        { title: 'ref-2', description: longDesc, requirements: longReq },
        { title: 'ref-3', description: longDesc, requirements: longReq },
      ] as any);

      let capturedPrompt = '';
      callLLMMock.mockImplementation(async (prompt: string) => {
        capturedPrompt = prompt;
        return {
          content: JSON.stringify({
            draftJd: '## 岗位职责\nxxx\n## 任职要求\nxxx\n## 加分项\nxxx',
          }),
        };
      });
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);

      await draftJd(
        { title: '工程师', departments: ['研发'], level: 'P5', type: '社招' },
        'user-1'
      );

      // 每段应被截到 1500 字（X*1500 + "…"），不应出现 3000 个 X
      expect(capturedPrompt).toContain('X'.repeat(1500));
      expect(capturedPrompt).toContain('…');
      expect(capturedPrompt).not.toContain('X'.repeat(1501));
      expect(capturedPrompt).toContain('最近 3 份');
    });
  });
});