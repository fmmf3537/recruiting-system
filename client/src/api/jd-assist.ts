import request from '@/utils/request';

// ============ 类型（与 server jd-assist.service.ts 对齐） ============

// 问题严重度
export type JdIssueSeverity = '高' | '中' | '低';

// 单条问题
export interface JdIssue {
  title: string;
  detail: string;
  severity: JdIssueSeverity;
}

// 完善接口 meta（与 server ai-polish controller 入参对齐）
export interface PolishMeta {
  title?: string;
  level?: string;
  departments?: string[];
  type?: string;
}

// 完善入参
export interface PolishParams {
  jdText: string;
  meta?: PolishMeta;
}

// 完善返回
export interface PolishResult {
  issues: JdIssue[];
  improvedJd: string;
}

// 生成入参
export interface DraftParams {
  title: string;
  departments: string[];
  level: string;
  type: string;
  freeText?: string;
}

// 生成返回
export interface DraftResult {
  draftJd: string;
}

export interface JdAssistResponse<T> {
  success: boolean;
  data: T;
}

// ============ 接口 ============

/**
 * AI JD 完善：传入当前 JD 文本（与可选 meta），返回问题清单 + 优化稿。
 * 同步执行，LLM 最长 60s，限流 15 分钟 20 次（429 时由 request 层统一提示）。
 * @param params jdText + meta?
 */
export function polishJd(params: PolishParams): Promise<JdAssistResponse<PolishResult>> {
  return request.post('/jobs/ai-polish', params) as Promise<JdAssistResponse<PolishResult>>;
}

/**
 * AI JD 生成：传入职位关键字段（与选填自由描述），返回完整 JD 草稿。
 * 同步执行，LLM 最长 60s，限流 15 分钟 20 次（429 时由 request 层统一提示）。
 * @param params title + departments + level + type + freeText?
 */
export function draftJd(params: DraftParams): Promise<JdAssistResponse<DraftResult>> {
  return request.post('/jobs/ai-draft', params) as Promise<JdAssistResponse<DraftResult>>;
}
