import request from '@/utils/request';

// 招聘流程模板（按职位类型自定义招聘阶段）
export interface PipelineTemplate {
  id: string;
  name: string;
  type: string; // 社招/校招/实习生
  stages: string[]; // 有序阶段数组
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineTemplateParams {
  name: string;
  type: string;
  stages: string[];
  enabled?: boolean;
  isDefault?: boolean;
}

interface TemplateListData {
  success: boolean;
  data: PipelineTemplate[];
}

interface TemplateData {
  success: boolean;
  data: PipelineTemplate;
  message?: string;
}

interface StagesData {
  success: boolean;
  data: string[];
}

/**
 * 模板列表（admin）
 */
export function getPipelineTemplates() {
  return request.get('/pipeline-templates') as Promise<TemplateListData>;
}

/**
 * 获取候选人适用的阶段数组；不传 candidateId 时返回默认模板阶段
 */
export function getPipelineStages(candidateId?: string) {
  return request.get('/pipeline-templates/stages', {
    params: candidateId ? { candidateId } : {},
  }) as Promise<StagesData>;
}

/**
 * 新建模板（admin）
 */
export function createPipelineTemplate(data: PipelineTemplateParams) {
  return request.post('/pipeline-templates', data) as Promise<TemplateData>;
}

/**
 * 更新模板（admin，含启停用）
 */
export function updatePipelineTemplate(id: string, data: Partial<PipelineTemplateParams>) {
  return request.patch(`/pipeline-templates/${id}`, data) as Promise<TemplateData>;
}
