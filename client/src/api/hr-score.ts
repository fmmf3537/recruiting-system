import request from '@/utils/request';
import { downloadFile } from '@/api/stats';

export type ScorePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type ScoreCategory = 'business' | 'process';

export const PERIOD_OPTIONS: Array<{ label: string; value: ScorePeriod }> = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '季', value: 'quarter' },
  { label: '年', value: 'year' },
];

export interface HrScoreEvent {
  id: string;
  userId: string;
  ruleCode: string;
  category: ScoreCategory;
  points: number;
  targetType: string | null;
  targetId: string | null;
  remark: string | null;
  bizDate: string;
  createdAt: string;
}

export interface PeriodAggregate {
  businessPts: number;
  processPts: number;
  totalScore: number;
  rank: number | null;
}

/** /my 内嵌的规则只读视图（F4-S2 getMyCurrentRules：points 即分值） */
export interface MyRuleView {
  code: string;
  name: string;
  points: string | null;
  enabled: boolean;
}

export interface MyScoresResult {
  events: HrScoreEvent[];
  aggregate: PeriodAggregate;
  rank: number | null;
  rules: MyRuleView[];
}

export interface MyScoresResponse {
  success: true;
  data: MyScoresResult;
  pagination: { page: number; pageSize: number; total: number };
}

/** admin 规则字典（listRules 返回完整 Dictionary） */
export interface RuleViewItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
}

/** F4-S2 team：他人分数为 null（不是 0）；无独立 score 字段 */
export interface TeamMember {
  userId: string;
  userName: string;
  rank: number;
  isSelf: boolean;
  totalScore: number | null;
  businessPts: number | null;
  processPts: number | null;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface PeriodTotals {
  businessPts: number;
  processPts: number;
  totalScore: number;
}

export interface AdminReport {
  businessTrend: TrendPoint[];
  processTrend: TrendPoint[];
  comparison: {
    current: PeriodTotals;
    previous: PeriodTotals;
    deltaPct: number | null;
  };
  topN: Array<{
    userId: string;
    userName: string;
    totalScore: number;
    businessPts: number;
    processPts: number;
    rank: number;
  }>;
}

/** 空分显示 "—"，0 分显示 0（不能把 null 渲染成 0） */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

export function formatTarget(row: HrScoreEvent): string {
  const id = row.targetId ?? '—';
  switch (row.targetType) {
    case 'Candidate':
      return `候选人 ID ${id}`;
    case 'Offer':
      return `Offer ID ${id}`;
    case 'Interview':
      return `面试 ID ${id}`;
    case 'ProcessScore':
      return '本周汇总';
    case 'StageRecord':
      return `阶段 ID ${id}`;
    default:
      return row.targetType ? `${row.targetType} ${id}` : '—';
  }
}

export function formatBizDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || '—';
  return d.toLocaleDateString('zh-CN');
}

export function getMyScores(params: {
  period?: ScorePeriod;
  page?: number;
  pageSize?: number;
  userId?: string;
}): Promise<MyScoresResponse> {
  return request.get('/hr-score/my', { params }) as Promise<MyScoresResponse>;
}

export function getTeamRanking(params: { period?: ScorePeriod }) {
  return request.get('/hr-score/team', { params }) as Promise<{ success: true; data: TeamMember[] }>;
}

export function getAdminReport(params: {
  period?: ScorePeriod;
  from?: string;
  to?: string;
}) {
  return request.get('/hr-score/report', { params }) as Promise<{ success: true; data: AdminReport }>;
}

/** 相对路径（不含 token）；实际下载请用 exportHrScoreCsv */
export function getExportUrl(period: ScorePeriod = 'month') {
  return `/hr-score/export?period=${period}`;
}

/** 带 JWT 的 CSV 下载（authenticate 只认 Authorization，裸 a[href] 会 401） */
export async function exportHrScoreCsv(period: ScorePeriod = 'month'): Promise<void> {
  const blob = await request.get('/hr-score/export', {
    params: { period },
    responseType: 'blob',
  }) as Blob;
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(blob, `hr-score-${period}-${date}.csv`);
}

export function listRules() {
  return request.get('/hr-score/rules') as Promise<{ success: true; data: RuleViewItem[] }>;
}

export function updateRule(
  code: string,
  body: { name?: string; description?: string; enabled?: boolean },
) {
  return request.patch(`/hr-score/rules/${code}`, body) as Promise<{
    success: true;
    data: RuleViewItem;
  }>;
}
