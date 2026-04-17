import { get } from '@/lib/request';

export interface DashboardKpi {
  newCandidatesThisMonth: number;
  interviewingCount: number;
  pendingOffers: number;
  joinedThisMonth: number;
}

export interface TrendItem {
  date: string;
  count: number;
}

export interface DashboardData {
  kpi: DashboardKpi;
  trend: TrendItem[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface FunnelStat {
  stage: string;
  count: number;
}

/**
 * 获取数据看板统计
 */
export function getDashboard(): Promise<ApiResponse<DashboardData>> {
  return get('/stats/dashboard');
}

/**
 * 获取招聘漏斗统计
 */
export function getFunnelStats(): Promise<ApiResponse<FunnelStat[]>> {
  return get('/stats/funnel');
}
