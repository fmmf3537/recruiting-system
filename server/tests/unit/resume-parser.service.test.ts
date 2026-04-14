import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/llm', () => ({
  extractResumeInfo: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

vi.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: vi.fn(),
  },
}));

import { parseResume } from '../../src/services/resume-parser.service';
import { extractResumeInfo } from '../../src/lib/llm';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

describe('ResumeParserService - 简历解析服务单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应成功解析 PDF 简历', async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: '张三 13800138000 zhangsan@test.com' } as any);
    vi.mocked(extractResumeInfo).mockResolvedValue({
      name: '张三',
      phone: '13800138000',
      email: 'zhangsan@test.com',
      gender: '男',
      age: 28,
      workYears: 5,
      education: '本科',
      school: '清华大学',
      currentCompany: 'ABC公司',
      currentPosition: '工程师',
      expectedSalary: '20k-30k',
      workHistory: [
        { company: 'ABC公司', position: '工程师', startDate: '2020-01', endDate: '2024-01', description: '开发工作' },
      ],
      skills: ['JavaScript', 'TypeScript'],
    });

    const result = await parseResume(Buffer.from('pdf'), 'application/pdf');

    expect(result.name).toBe('张三');
    expect(result.phone).toBe('13800138000');
    expect(result.workHistory).toHaveLength(1);
    expect(result.skills).toEqual(['JavaScript', 'TypeScript']);
  });

  it('应成功解析 DOCX 简历', async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: '李四 13900139000 lisi@test.com' } as any);
    vi.mocked(extractResumeInfo).mockResolvedValue({
      name: '李四',
      phone: '13900139000',
      email: 'lisi@test.com',
    });

    const result = await parseResume(
      Buffer.from('docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    expect(result.name).toBe('李四');
  });

  it('不支持的文件类型应抛出错误', async () => {
    await expect(parseResume(Buffer.from('txt'), 'text/plain')).rejects.toThrow('Unsupported file type');
  });

  it('简历内容过短时应抛出错误', async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: 'hi' } as any);

    await expect(parseResume(Buffer.from('pdf'), 'application/pdf')).rejects.toThrow('Resume text too short or empty');
  });

  it('应正确处理 extractResumeInfo 返回的空值', async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: '这是一份完整的简历内容，包含很多文字信息' } as any);
    vi.mocked(extractResumeInfo).mockResolvedValue({
      name: undefined,
      phone: null,
      email: '',
      workHistory: null,
      skills: 'not an array',
    });

    const result = await parseResume(Buffer.from('pdf'), 'application/pdf');

    expect(result.name).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.workHistory).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  it('应正确处理 workHistory 为数组但字段缺失的情况', async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: '这是一份完整的简历内容，包含很多文字信息' } as any);
    vi.mocked(extractResumeInfo).mockResolvedValue({
      name: '王五',
      workHistory: [
        { company: undefined, position: null },
      ],
      skills: ['Python'],
    });

    const result = await parseResume(Buffer.from('pdf'), 'application/pdf');

    expect(result.workHistory[0].company).toBe('');
    expect(result.workHistory[0].position).toBe('');
    expect(result.workHistory[0].startDate).toBeNull();
    expect(result.skills).toEqual(['Python']);
  });
});
