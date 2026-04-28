import request from '@/utils/request';

export interface Tag {
  id: string;
  name: string;
  color: string;
  category: string;
  createdById: string | null;
  createdAt: string;
}

export interface TagListData {
  success: boolean;
  data: Tag[];
}

export interface TagData {
  success: boolean;
  data: Tag;
}

export interface SetTagsParams {
  tagIds: string[];
}

/**
 * 获取所有标签
 */
export function getTags(category?: string): Promise<TagListData> {
  return request.get('/tags', { params: { category } });
}

/**
 * 创建标签
 */
export function createTag(data: { name: string; color?: string; category?: string }): Promise<TagData> {
  return request.post('/tags', data);
}

/**
 * 更新标签
 */
export function updateTag(id: string, data: Partial<{ name: string; color: string; category: string }>): Promise<TagData> {
  return request.patch(`/tags/${id}`, data);
}

/**
 * 删除标签
 */
export function deleteTag(id: string): Promise<{ success: boolean; message: string }> {
  return request.delete(`/tags/${id}`);
}

/**
 * 初始化预设标签
 */
export function initPresetTags(): Promise<{ success: boolean; message: string }> {
  return request.post('/tags/init-presets');
}

/**
 * 获取候选人的标签
 */
export function getCandidateTags(candidateId: string): Promise<TagListData> {
  return request.get(`/candidates/${candidateId}/tags`);
}

/**
 * 设置候选人的标签
 */
export function setCandidateTags(candidateId: string, data: SetTagsParams): Promise<TagListData> {
  return request.put(`/candidates/${candidateId}/tags`, data);
}

/**
 * 获取职位的标签
 */
export function getJobTags(jobId: string): Promise<TagListData> {
  return request.get(`/jobs/${jobId}/tags`);
}

/**
 * 设置职位的标签
 */
export function setJobTags(jobId: string, data: SetTagsParams): Promise<TagListData> {
  return request.put(`/jobs/${jobId}/tags`, data);
}
