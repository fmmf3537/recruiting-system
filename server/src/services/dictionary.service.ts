import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { pinyin } from 'pinyin-pro';

// 默认字典数据：按 category 分组
const DEFAULT_DICTIONARIES: Record<string, Array<{ code: string; name: string; sortOrder: number }>> = {
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
            ...item,
            enabled: true,
            description: null,
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
}

export const dictionaryService = new DictionaryService();
