import request from '@/utils/request';

// 日期范围参数
export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

// 工作量统计项
export interface WorkloadStat {
  userId: string;
  userName: string;
  newCandidates: number;
  stageAdvances: number;
  interviews: number;
  offers: number;
}

// 渠道效果统计项
export interface ChannelStat {
  source: string;
  candidateCount: number;
  hiredCount: number;
  conversionRate: number;
}

// 职位统计项
export interface JobStat {
  jobId: string;
  jobTitle: string;
  department: string;
  candidateCount: number;
  interviewCount: number;
  offerCount: number;
  hiredCount: number;
}

// 工作量统计响应
export interface WorkloadStatsData {
  success: boolean;
  data: WorkloadStat[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// 渠道效果统计响应
export interface ChannelStatsData {
  success: boolean;
  data: ChannelStat[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// 职位统计响应
export interface JobStatsData {
  success: boolean;
  data: JobStat[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

/**
 * 获取工作量统计
 * @param params 日期范围参数
 */
export function getWorkloadStats(params?: DateRangeParams): Promise<WorkloadStatsData> {
  return request.get('/stats/workload', { params }) as Promise<WorkloadStatsData>;
}

/**
 * 导出工作量统计 CSV
 * @param params 日期范围参数
 */
export function exportWorkloadStats(params?: DateRangeParams): Promise<Blob> {
  return request.get('/stats/workload/export', { 
    params,
    responseType: 'blob'
  }) as Promise<Blob>;
}

/**
 * 获取渠道效果分析
 * @param params 日期范围参数
 */
export function getChannelStats(params?: DateRangeParams): Promise<ChannelStatsData> {
  return request.get('/stats/channel', { params }) as Promise<ChannelStatsData>;
}

/**
 * 导出渠道效果分析 CSV
 * @param params 日期范围参数
 */
export function exportChannelStats(params?: DateRangeParams): Promise<Blob> {
  return request.get('/stats/channel/export', { 
    params,
    responseType: 'blob'
  }) as Promise<Blob>;
}

/**
 * 获取职位维度统计
 * @param params 日期范围参数
 */
export function getJobStats(params?: DateRangeParams): Promise<JobStatsData> {
  return request.get('/stats/jobs', { params }) as Promise<JobStatsData>;
}

/**
 * 导出职位维度统计 CSV
 * @param params 日期范围参数
 */
export function exportJobStats(params?: DateRangeParams): Promise<Blob> {
  return request.get('/stats/jobs/export', { 
    params,
    responseType: 'blob'
  }) as Promise<Blob>;
}

/**
 * 下载文件辅助函数
 * @param blob 文件 Blob
 * @param filename 文件名
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
