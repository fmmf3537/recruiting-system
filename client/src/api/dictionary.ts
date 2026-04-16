import request from '@/utils/request';

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
