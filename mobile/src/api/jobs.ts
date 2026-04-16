import request from '@/lib/request';

export type JobType = '社招' | '校招' | '实习';
export type JobStatus = 'open' | 'paused' | 'closed';

export interface JobListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: JobStatus;
  type?: JobType;
  location?: string;
  department?: string;
}

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
}

export interface JobDetail extends JobItem {
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
}

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

export interface JobDetailData {
  success: boolean;
  data: JobDetail;
}

export function getJobList(params?: JobListParams): Promise<JobListData> {
  return request.get('/api/jobs', { params });
}

export function getJobById(id: string): Promise<JobDetailData> {
  return request.get(`/api/jobs/${id}`);
}
