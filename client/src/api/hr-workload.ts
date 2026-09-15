import request from '@/utils/request';
import { downloadFile } from '@/api/stats';

export type WorkloadPeriod = 'day' | 'week' | 'month';

export interface HrWorkloadQuery {
  period: WorkloadPeriod;
  date: string;
  department?: string;
  hrId?: string;
}

export interface HrWorkloadProcess {
  newCandidates: number;
  communications: number;
  interviewsScheduled: number;
  interviewsCompleted: number;
  offerActions: number;
  stageAdvances: number;
}

export interface HrWorkloadResult {
  screeningPassed: number;
  interviewsCompleted: number;
  offersSent: number;
  offersAccepted: number;
  joined: number;
}

export interface HrWorkloadRates {
  screeningPassRate: number | null;
  interviewCompleteRate: number | null;
  offerAcceptRate: number | null;
  joinRate: number | null;
}

export interface HrWorkloadWeakPoint {
  stage: string;
  rate: number | null;
  teamRate: number | null;
}

export type HrWorkloadStatus = 'normal' | 'need_attention' | 'insufficient_sample';

export interface HrWorkloadRow {
  hrId: string;
  hrName: string;
  department: string | null;
  process: HrWorkloadProcess;
  result: HrWorkloadResult;
  rates: HrWorkloadRates;
  status: HrWorkloadStatus;
  weakPoints: HrWorkloadWeakPoint[];
  approximate: boolean;
}

export interface HrWorkloadOverview {
  range: { start: string; end: string };
  summary: {
    activeHrCount: number;
    newCandidates: number;
    communications: number;
    interviewsScheduled: number;
    interviewsCompleted: number;
    offersSent: number;
    offersAccepted: number;
    joined: number;
    avgCycleDays: number | null;
    weakPointCount: number;
  };
  rows: HrWorkloadRow[];
}

export interface HrWorkloadTrendPoint {
  range: { start: string; end: string };
  newCandidates: number;
  joined: number;
  joinRate: number | null;
}

export interface HrWorkloadTimelineItem {
  at: string;
  type: string;
  title: string;
}

export interface HrWorkloadCandidate {
  id: string;
  name: string;
  source: string | null;
  createdAt: string;
  anonymized: boolean;
}

export interface HrWorkloadDetail {
  range: { start: string; end: string };
  row: HrWorkloadRow;
  trend: HrWorkloadTrendPoint[];
  timeline?: HrWorkloadTimelineItem[];
  candidates?: HrWorkloadCandidate[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** 去掉空筛选，避免 hrId='' 触发后端 cuid 校验失败 */
export function compactHrWorkloadQuery(query: HrWorkloadQuery): HrWorkloadQuery {
  const params: HrWorkloadQuery = { period: query.period, date: query.date };
  if (query.department) params.department = query.department;
  if (query.hrId) params.hrId = query.hrId;
  return params;
}

export function getHrWorkloadOverview(
  query: HrWorkloadQuery
): Promise<ApiEnvelope<HrWorkloadOverview>> {
  return request.get('/hr-workload/overview', {
    params: compactHrWorkloadQuery(query),
  }) as Promise<ApiEnvelope<HrWorkloadOverview>>;
}

export function getHrWorkloadUserDetail(
  hrId: string,
  query: HrWorkloadQuery & { includeTimeline?: boolean; includeCandidates?: boolean }
): Promise<ApiEnvelope<HrWorkloadDetail>> {
  const params: Record<string, string> = {
    period: query.period,
    date: query.date,
  };
  if (query.department) params.department = query.department;
  // 后端 zod 只接受 'true' / 'false' 字符串
  if (query.includeTimeline) params.includeTimeline = 'true';
  if (query.includeCandidates) params.includeCandidates = 'true';
  return request.get(`/hr-workload/users/${hrId}`, { params }) as Promise<
    ApiEnvelope<HrWorkloadDetail>
  >;
}

/**
 * 导出 xlsx。axios 拦截器只回 blob，拿不到 Content-Disposition，
 * 默认文件名对齐 PRD：HR工作监控_日期.xlsx
 */
export async function exportHrWorkload(query: HrWorkloadQuery): Promise<void> {
  const blob = (await request.get('/hr-workload/export', {
    params: compactHrWorkloadQuery(query),
    responseType: 'blob',
  })) as Blob;
  downloadFile(blob, `HR工作监控_${query.date}.xlsx`);
}
