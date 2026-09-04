import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    dictionary: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  };
  return { default: mock };
});

vi.mock('../../src/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import prisma from '../../src/lib/prisma';
import { dictionaryService } from '../../src/services/dictionary.service';
import {
  parseEnabled,
  parseSortOrder,
  type DictionaryImportRawRow,
} from '../../src/utils/xlsx-import';

const USER_ID = 'user-admin-1';

function rawRow(overrides: Partial<DictionaryImportRawRow> = {}): DictionaryImportRawRow {
  return {
    row: 2,
    category: 'department',
    code: 'tech',
    name: '技术部',
    sortOrder: '1',
    enabled: '启用',
    description: '',
    ...overrides,
  };
}

describe('dictionary.service importDictionaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.dictionary.findMany).mockResolvedValue([]);
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.dictionary.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dictionary.create).mockResolvedValue({ id: 'd1' } as never);
    vi.mocked(prisma.dictionary.update).mockResolvedValue({ id: 'd1' } as never);
  });

  it('新 code → create', async () => {
    const result = await dictionaryService.importDictionaries([rawRow()], USER_ID);
    expect(prisma.dictionary.create).toHaveBeenCalledTimes(1);
    expect(prisma.dictionary.update).not.toHaveBeenCalled();
    expect(prisma.dictionary.count).not.toHaveBeenCalled();
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'dictionary_import',
          targetType: 'Dictionary',
          targetId: 'department',
        }),
      })
    );
  });

  it('已存在 code → update', async () => {
    vi.mocked(prisma.dictionary.findFirst).mockResolvedValue({
      id: 'exist-1',
      category: 'department',
      code: 'tech',
    } as never);

    const result = await dictionaryService.importDictionaries(
      [rawRow({ name: '技术部-改' })],
      USER_ID
    );

    expect(prisma.dictionary.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exist-1' },
        data: expect.objectContaining({ name: '技术部-改' }),
      })
    );
    expect(prisma.dictionary.create).not.toHaveBeenCalled();
    expect(result.success).toBe(1);
  });

  it('行内重复 code → 后行覆盖且只写库一次', async () => {
    const result = await dictionaryService.importDictionaries(
      [
        rawRow({ row: 2, name: '旧名', sortOrder: '1' }),
        rawRow({ row: 3, name: '新名', sortOrder: '9' }),
      ],
      USER_ID
    );

    expect(prisma.dictionary.create).toHaveBeenCalledTimes(1);
    expect(prisma.dictionary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: '新名', sortOrder: 9 }),
      })
    );
    expect(result.success).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('单行失败记 errors 且 failed++，其它行仍成功', async () => {
    const result = await dictionaryService.importDictionaries(
      [
        rawRow({ row: 2, code: '' }),
        rawRow({ row: 3, code: 'product', name: '产品部' }),
      ],
      USER_ID
    );

    expect(result.failed).toBe(1);
    expect(result.success).toBe(1);
    expect(result.errors).toEqual([{ row: 2, reason: '编码不能为空' }]);
    expect(prisma.dictionary.create).toHaveBeenCalledTimes(1);
  });

  it('未知分类记失败', async () => {
    const result = await dictionaryService.importDictionaries(
      [rawRow({ category: 'not_a_real_category' })],
      USER_ID
    );
    expect(result.failed).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors[0].reason).toBe('未知分类');
    expect(prisma.dictionary.create).not.toHaveBeenCalled();
  });

  it('空 rows → 400', async () => {
    await expect(dictionaryService.importDictionaries([], USER_ID)).rejects.toMatchObject({
      message: '文件没有有效数据行',
      statusCode: 400,
    } satisfies Partial<AppError>);
  });

  it('errors 截断 20 条并提示总数', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      rawRow({ row: i + 2, code: '' })
    );
    const result = await dictionaryService.importDictionaries(rows, USER_ID);
    expect(result.failed).toBe(21);
    expect(result.errors).toHaveLength(20);
    expect(result.errors[19].reason).toContain('…等 21 条错误');
  });
});

describe('xlsx-import 字段解析', () => {
  it('enabled 解析 true/false/1/0/启用/禁用/空/非法', () => {
    expect(parseEnabled('true', 1)).toBe(true);
    expect(parseEnabled('1', 1)).toBe(true);
    expect(parseEnabled('启用', 1)).toBe(true);
    expect(parseEnabled('', 1)).toBe(true);
    expect(parseEnabled('false', 1)).toBe(false);
    expect(parseEnabled('0', 1)).toBe(false);
    expect(parseEnabled('禁用', 1)).toBe(false);
    expect(() => parseEnabled('yes', 3)).toThrow('第 3 行：状态值无效');
  });

  it('sortOrder 解析数字/空/非法', () => {
    expect(parseSortOrder('10', 1)).toBe(10);
    expect(parseSortOrder('', 1)).toBe(0);
    expect(() => parseSortOrder('abc', 4)).toThrow('第 4 行：排序必须为非负整数');
    expect(() => parseSortOrder('-1', 5)).toThrow('第 5 行：排序必须为非负整数');
  });
});
