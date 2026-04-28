import request from '@/utils/request';
import type { Tag } from './tag';

// 职位类型
export type JobType = '社招' | '校招' | '实习生';
export type JobStatus = 'open' | 'paused' | 'closed';

// 职位列表查询参数
export interface JobListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: JobStatus;
  type?: JobType;
  location?: string;
  department?: string;
}

// 创建职位参数
export interface CreateJobParams {
  title: string;
  departments: string[];
  level: string;
  skills?: string[];
  location: string;
  type: JobType;
  description: string;
  requirements: string;
  status?: JobStatus;
  tagIds?: string[];
}

// 更新职位参数
export interface UpdateJobParams {
  title?: string;
  departments?: string[];
  level?: string;
  skills?: string[];
  location?: string;
  type?: JobType;
  description?: string;
  requirements?: string;
  status?: JobStatus;
  tagIds?: string[];
}

// 职位列表项
export interface JobItem {
  id: string;
  title: string;
  departments: string[];
  level: string;
  skills: string[];
  location: string;
  type: JobType;
  status: JobStatus;
  description: string;
  requirements: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    candidateJobs: number;
  };
  tags?: Tag[];
}

// 职位详情（包含创建者信息）
export interface JobDetail extends JobItem {
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  tags?: Tag[];
}

// 职位列表响应
export interface JobListData {
  success: boolean;
  data: JobItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 职位详情响应
export interface JobDetailData {
  success: boolean;
  data: JobDetail;
}

// 操作结果响应
export interface OperationResult {
  success: boolean;
  message: string;
  data?: JobItem;
}

/**
 * 获取职位列表
 * @param params 查询参数
 */
export function getJobList(params?: JobListParams): Promise<JobListData> {
  return request.get('/jobs', { params }) as Promise<JobListData>;
}

/**
 * 获取职位详情
 * @param id 职位ID
 */
export function getJobById(id: string): Promise<JobDetailData> {
  return request.get(`/jobs/${id}`) as Promise<JobDetailData>;
}

/**
 * 创建职位
 * @param data 职位数据
 */
export function createJob(data: CreateJobParams): Promise<OperationResult> {
  return request.post('/jobs', data) as Promise<OperationResult>;
}

/**
 * 更新职位
 * @param id 职位ID
 * @param data 更新数据
 */
export function updateJob(id: string, data: UpdateJobParams): Promise<OperationResult> {
  return request.patch(`/jobs/${id}`, data) as Promise<OperationResult>;
}

/**
 * 关闭职位
 * @param id 职位ID
 */
export function closeJob(
  id: string,
  config?: { signal?: AbortSignal }
): Promise<OperationResult> {
  return request.post(`/jobs/${id}/close`, undefined, config) as Promise<OperationResult>;
}

/**
 * 复制职位
 * @param id 职位ID
 */
export function duplicateJob(id: string): Promise<OperationResult> {
  return request.post(`/jobs/${id}/duplicate`) as Promise<OperationResult>;
}

/**
 * 删除职位
 * @param id 职位ID
 */
export function deleteJob(
  id: string,
  config?: { signal?: AbortSignal }
): Promise<OperationResult> {
  return request.delete(`/jobs/${id}`, config) as Promise<OperationResult>;
}
