import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';
import { pinyin } from 'pinyin-pro';
import {
  MAX_IMPORT_ERROR_DETAILS,
  parseImportRow,
  type DictionaryImportRawRow,
} from '../utils/xlsx-import';

// 默认字典数据：按 category 分组
// description 可选：matching_dimension 等需要在 description 存附加信息（权重等）的字典携带该字段
export const DEFAULT_DICTIONARIES: Record<
  string,
  Array<{ code: string; name: string; sortOrder: number; description?: string }>
> = {
  department: [
    { code: 'tech', name: '技术部', sortOrder: 1 },
    { code: 'product', name: '产品部', sortOrder: 2 },
    { code: 'design', name: '设计部', sortOrder: 3 },
    { code: 'operation', name: '运营部', sortOrder: 4 },
    { code: 'marketing', name: '市场部', sortOrder: 5 },
    { code: 'sales', name: '销售部', sortOrder: 6 },
    { code: 'hr', name: '人力资源部', sortOrder: 7 },
    { code: 'finance', name: '财务部', sortOrder: 8 },
    { code: 'xinhang', name: '新航卓越', sortOrder: 9 },
    { code: 'xinhang_production', name: '新航-生产部', sortOrder: 10 },
    { code: 'xinhang_procurement', name: '新航-采购部', sortOrder: 11 },
    { code: 'xinhang_rd', name: '新航-技术研发中心', sortOrder: 12 },
  ],
  location: [
    { code: 'beijing', name: '北京', sortOrder: 1 },
    { code: 'shanghai', name: '上海', sortOrder: 2 },
    { code: 'shenzhen', name: '深圳', sortOrder: 3 },
    { code: 'hangzhou', name: '杭州', sortOrder: 4 },
    { code: 'guangzhou', name: '广州', sortOrder: 5 },
    { code: 'chengdu', name: '成都', sortOrder: 6 },
    { code: 'meishan', name: '眉山', sortOrder: 7 },
    { code: 'wuhan', name: '武汉', sortOrder: 8 },
    { code: 'xian', name: '西安', sortOrder: 9 },
    { code: 'other', name: '其他', sortOrder: 99 },
  ],
  education: [
    { code: 'doctor', name: '博士', sortOrder: 1 },
    { code: 'master', name: '硕士', sortOrder: 2 },
    { code: 'bachelor', name: '本科', sortOrder: 3 },
    { code: 'college', name: '大专', sortOrder: 4 },
    { code: 'high_school', name: '高中及以下', sortOrder: 5 },
  ],
  source: [
    { code: 'boss', name: 'BOSS直聘', sortOrder: 1 },
    { code: 'liepin', name: '猎聘', sortOrder: 2 },
    { code: 'zhaopin', name: '智联招聘', sortOrder: 3 },
    { code: '51job', name: '前程无忧', sortOrder: 4 },
    { code: 'referral', name: '内推', sortOrder: 5 },
    { code: 'official', name: '官网投递', sortOrder: 6 },
    { code: 'other', name: '其他', sortOrder: 99 },
  ],
  job_type: [
    { code: 'social', name: '社招', sortOrder: 1 },
    { code: 'campus', name: '校招', sortOrder: 2 },
    { code: 'intern', name: '实习生', sortOrder: 3 },
  ],
  skills: [
    { code: 'javascript', name: 'JavaScript', sortOrder: 1 },
    { code: 'typescript', name: 'TypeScript', sortOrder: 2 },
    { code: 'vuejs', name: 'Vue.js', sortOrder: 3 },
    { code: 'react', name: 'React', sortOrder: 4 },
    { code: 'nodejs', name: 'Node.js', sortOrder: 5 },
    { code: 'python', name: 'Python', sortOrder: 6 },
    { code: 'java', name: 'Java', sortOrder: 7 },
    { code: 'go', name: 'Go', sortOrder: 8 },
    { code: 'mysql', name: 'MySQL', sortOrder: 9 },
    { code: 'redis', name: 'Redis', sortOrder: 10 },
    { code: 'docker', name: 'Docker', sortOrder: 11 },
    { code: 'kubernetes', name: 'Kubernetes', sortOrder: 12 },
  ],
  // 面试评估维度（结构化评估表单的评分维度）
  evaluation_dimension: [
    { code: 'professional', name: '专业能力', sortOrder: 1 },
    { code: 'communication', name: '沟通表达', sortOrder: 2 },
    { code: 'logic', name: '逻辑思维', sortOrder: 3 },
    { code: 'culture_fit', name: '文化匹配', sortOrder: 4 },
    { code: 'motivation', name: '求职动机', sortOrder: 5 },
  ],
  // 简历-JD 匹配打分维度（F2-S）：description 字段存权重数字字符串
  // （Dictionary 表无 weight 列；权重约定存 description，解析失败/缺失按 0 处理并回退等权）
  matching_dimension: [
    { code: 'skill_match', name: '专业技能匹配', sortOrder: 1, description: '40' },
    { code: 'experience_match', name: '工作经验与年限', sortOrder: 2, description: '25' },
    { code: 'education_match', name: '学历与院校背景', sortOrder: 3, description: '15' },
    { code: 'stability', name: '职业稳定性', sortOrder: 4, description: '10' },
    { code: 'bonus', name: '加分项（证书/行业背景）', sortOrder: 5, description: '10' },
  ],
  // F3-S：面试考察方向（仅配置名称 + 启停用；出题侧重不放 description，
  // 统一在 interview-outline.service.ts 的 FOCUS_TYPE_GUIDANCE 常量里维护）
  interview_focus_type: [
    { code: 'hr', name: 'HR面', sortOrder: 1 },
    { code: 'tech', name: '技术面', sortOrder: 2 },
    { code: 'comprehensive', name: '综合面', sortOrder: 3 },
    { code: 'manager', name: '主管面', sortOrder: 4 },
    { code: 'cross', name: '交叉面', sortOrder: 5 },
  ],
};

export interface DictionaryItem {
  id: string;
  category: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDictionaryInput {
  category: string;
  code?: string;
  name: string;
  sortOrder?: number;
  enabled?: boolean;
  description?: string;
}

export interface UpdateDictionaryInput {
  code?: string;
  name?: string;
  sortOrder?: number;
  enabled?: boolean;
  description?: string;
}

export interface DictionaryImportError {
  row: number;
  reason: string;
}

export interface DictionaryImportResult {
  success: number;
  skipped: number;
  failed: number;
  errors: DictionaryImportError[];
}

function importRowReason(err: unknown, row: number): string {
  const msg = err instanceof Error ? err.message : String(err);
  const prefix = `第 ${row} 行：`;
  return msg.startsWith(prefix) ? msg.slice(prefix.length) : msg;
}

function capImportErrors(
  errors: DictionaryImportError[],
  failed: number
): DictionaryImportError[] {
  if (errors.length <= MAX_IMPORT_ERROR_DETAILS) {
    return errors;
  }
  const capped = errors.slice(0, MAX_IMPORT_ERROR_DETAILS);
  const last = capped[MAX_IMPORT_ERROR_DETAILS - 1];
  capped[MAX_IMPORT_ERROR_DETAILS - 1] = {
    row: last.row,
    reason: `${last.reason}；…等 ${failed} 条错误`,
  };
  return capped;
}

async function writeImportLog(
  userId: string,
  targetId: string,
  detail: { success: number; skipped: number; failed: number }
): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId,
        targetType: 'Dictionary',
        targetId,
        action: 'dictionary_import',
        detail,
      },
    });
  } catch (err) {
    logger.error({ err, action: 'dictionary_import', targetId }, '[Dictionary] OperationLog 写入失败');
  }
}

export class DictionaryService {
  /**
   * 如果某分类下没有数据，自动初始化默认值
   */
  private async ensureDefaults(category?: string): Promise<void> {
    const categories = category ? [category] : Object.keys(DEFAULT_DICTIONARIES);

    for (const cat of categories) {
      const count = await prisma.dictionary.count({ where: { category: cat } });
      if (count === 0 && DEFAULT_DICTIONARIES[cat]) {
        await prisma.dictionary.createMany({
          data: DEFAULT_DICTIONARIES[cat].map((item) => ({
            category: cat,
            // 部分字典（如 matching_dimension）需要把权重等信息塞进 description
            // 默认项不含 description 时按 null 落库，保留历史行为
            ...item,
            enabled: true,
            description: item.description ?? null,
          })),
        });
      }
    }
  }

  /**
   * 按分类查询字典列表
   */
  async getDictionaries(category?: string, includeDisabled = false): Promise<DictionaryItem[]> {
    await this.ensureDefaults(category);

    const where = {
      ...(category ? { category } : {}),
      ...(includeDisabled ? {} : { enabled: true }),
    };

    const items = await prisma.dictionary.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return items;
  }

  /**
   * 按 ID 查询字典项
   */
  async getDictionaryById(id: string): Promise<DictionaryItem | null> {
    const item = await prisma.dictionary.findUnique({ where: { id } });
    return item;
  }

  /**
   * 根据名称自动生成拼音编码
   */
  private async generateUniqueCode(category: string, name: string): Promise<string> {
    const rawPinyin = pinyin(name, { toneType: 'none', type: 'string', separator: '' });
    let baseCode = rawPinyin
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    if (!baseCode) {
      baseCode = 'code';
    }

    let code = baseCode;
    let suffix = 2;

    while (
      await prisma.dictionary.findFirst({
        where: { category, code },
      })
    ) {
      code = `${baseCode}-${suffix}`;
      suffix++;
    }

    return code;
  }

  /**
   * 创建字典项
   */
  async createDictionary(data: CreateDictionaryInput): Promise<DictionaryItem> {
    const code =
      data.code && data.code.trim()
        ? data.code.trim()
        : await this.generateUniqueCode(data.category, data.name);

    // 校验同一分类下 code 不能重复
    const existing = await prisma.dictionary.findFirst({
      where: {
        category: data.category,
        code,
      },
    });

    if (existing) {
      throw new AppError('该分类下已存在相同的编码', 400);
    }

    return prisma.dictionary.create({
      data: {
        category: data.category,
        code,
        name: data.name,
        sortOrder: data.sortOrder ?? 0,
        enabled: data.enabled ?? true,
        description: data.description || null,
      },
    });
  }

  /**
   * 更新字典项
   */
  async updateDictionary(id: string, data: UpdateDictionaryInput): Promise<DictionaryItem> {
    const existing = await prisma.dictionary.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('字典项不存在', 404);
    }

    // 如果修改了 code，校验唯一性
    if (data.code && data.code !== existing.code) {
      const duplicate = await prisma.dictionary.findFirst({
        where: {
          category: existing.category,
          code: data.code,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new AppError('该分类下已存在相同的编码', 400);
      }
    }

    return prisma.dictionary.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
      },
    });
  }

  /**
   * 删除字典项
   */
  async deleteDictionary(id: string): Promise<void> {
    const existing = await prisma.dictionary.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('字典项不存在', 404);
    }

    await prisma.dictionary.delete({ where: { id } });
  }

  /**
   * 分类清单：内置 DEFAULT_DICTIONARIES 键 ∪ 库中已有分类，去重排序。
   * 供前端分类动态化；内置分类即使无数据也返回。
   */
  async getCategories(): Promise<string[]> {
    const rows = await prisma.dictionary.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    const set = new Set<string>([
      ...Object.keys(DEFAULT_DICTIONARIES),
      ...rows.map((r) => r.category),
    ]);
    return Array.from(set).sort();
  }

  /**
   * 批量导入：逐行手工 upsert，不调用 ensureDefaults / getDictionaries。
   * parseSkipped 为解析阶段已跳过的表头/空行/说明行数。
   */
  async importDictionaries(
    rows: DictionaryImportRawRow[],
    userId: string,
    parseSkipped = 0
  ): Promise<DictionaryImportResult> {
    if (!rows.length) {
      throw new AppError('文件没有有效数据行', 400);
    }

    const dbCats = await prisma.dictionary.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    const knownCategories = new Set<string>([
      ...Object.keys(DEFAULT_DICTIONARIES),
      ...dbCats.map((r) => r.category),
    ]);

    let skipped = parseSkipped;
    let failed = 0;
    const errors: DictionaryImportError[] = [];
    // 同文件内 (category, code) 后行覆盖前行，最终只写库一次
    const pending = new Map<string, ReturnType<typeof parseImportRow>>();

    for (const raw of rows) {
      try {
        const parsed = parseImportRow(raw);
        if (!knownCategories.has(parsed.category)) {
          throw new AppError(`第 ${raw.row} 行：未知分类`, 400);
        }
        const key = `${parsed.category}::${parsed.code}`;
        if (pending.has(key)) {
          skipped += 1;
        }
        pending.set(key, parsed);
      } catch (err) {
        failed += 1;
        errors.push({ row: raw.row, reason: importRowReason(err, raw.row) });
      }
    }

    let success = 0;
    for (const parsed of pending.values()) {
      try {
        const existing = await prisma.dictionary.findFirst({
          where: { category: parsed.category, code: parsed.code },
        });
        if (existing) {
          await prisma.dictionary.update({
            where: { id: existing.id },
            data: {
              name: parsed.name,
              sortOrder: parsed.sortOrder,
              enabled: parsed.enabled,
              description: parsed.description,
            },
          });
        } else {
          await prisma.dictionary.create({
            data: {
              category: parsed.category,
              code: parsed.code,
              name: parsed.name,
              sortOrder: parsed.sortOrder,
              enabled: parsed.enabled,
              description: parsed.description,
            },
          });
        }
        success += 1;
      } catch (err) {
        failed += 1;
        errors.push({ row: parsed.row, reason: importRowReason(err, parsed.row) });
      }
    }

    const categories = Array.from(
      new Set(
        [...pending.values()].map((r) => r.category).concat(rows.map((r) => r.category.trim()).filter(Boolean))
      )
    );
    const targetId = categories.length === 1 ? categories[0] : 'multiple';

    await writeImportLog(userId, targetId, { success, skipped, failed });

    return {
      success,
      skipped,
      failed,
      errors: capImportErrors(errors, failed),
    };
  }
}

export const dictionaryService = new DictionaryService();
