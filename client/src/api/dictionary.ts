import request from '@/utils/request';
import * as XLSX from 'xlsx';

export interface DictionaryItem {
  id: string;
  category: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDictionaryParams {
  category: string;
  code: string;
  name: string;
  sortOrder?: number;
  enabled?: boolean;
  description?: string;
}

export interface UpdateDictionaryParams {
  code?: string;
  name?: string;
  sortOrder?: number;
  enabled?: boolean;
  description?: string;
}

export interface DictionaryListData {
  success: boolean;
  data: DictionaryItem[];
}

export interface DictionaryDetailData {
  success: boolean;
  data: DictionaryItem;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

/**
 * 获取字典列表
 * @param params 查询参数
 */
export function getDictionaries(params?: {
  category?: string;
  includeDisabled?: boolean;
}): Promise<DictionaryListData> {
  return request.get('/dictionaries', { params }) as Promise<DictionaryListData>;
}

/**
 * 创建字典项
 * @param data 字典数据
 */
export function createDictionary(data: CreateDictionaryParams): Promise<DictionaryDetailData> {
  return request.post('/dictionaries', data) as Promise<DictionaryDetailData>;
}

/**
 * 更新字典项
 * @param id 字典项ID
 * @param data 更新数据
 */
export function updateDictionary(
  id: string,
  data: UpdateDictionaryParams
): Promise<DictionaryDetailData> {
  return request.patch(`/dictionaries/${id}`, data) as Promise<DictionaryDetailData>;
}

/**
 * 删除字典项
 * @param id 字典项ID
 */
export function deleteDictionary(id: string): Promise<OperationResult> {
  return request.delete(`/dictionaries/${id}`) as Promise<OperationResult>;
}

export interface DictionaryCategoriesData {
  success: boolean;
  data: string[];
}

export interface DictionaryImportResult {
  success: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface DictionaryImportData {
  success: boolean;
  data: DictionaryImportResult;
}

/** 分类清单（登录可读，前端分类动态化） */
export function getCategories(): Promise<DictionaryCategoriesData> {
  return request.get('/dictionaries/categories') as Promise<DictionaryCategoriesData>;
}

/** 批量导入 Excel（multipart 字段名 file） */
export function importDictionaries(file: File): Promise<DictionaryImportData> {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/dictionaries/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }) as Promise<DictionaryImportData>;
}

/** 导出当前分类为 xlsx（纯前端，不调后端） */
export function exportDictionaryCategory(category: string, items: DictionaryItem[]): void {
  const rows = items.map((i) => ({
    分类: i.category,
    编码: i.code,
    名称: i.name,
    排序: i.sortOrder,
    状态: i.enabled ? '启用' : '禁用',
    '备注/分值': i.description ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, category);
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `字典_${category}_${date}.xlsx`);
}
