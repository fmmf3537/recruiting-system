/**
 * F5-C 猎头机构 API 封装
 * 类型与 server/src/controllers/agency.controller.ts、referral.controller.ts 实读对齐
 */

import request from '@/utils/request';

// 机构列表项（GET /api/agencies）
export interface AgencyListItem {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  enabled: boolean;
  remark: string | null;
  createdById: string;
  createdAt: string;
  linkCount: number; // 链接数（_count.links）
  referralCount: number; // 推荐数（source='猎头:'+name 的候选人数）
}

// 生成链接返回（POST /api/agencies/:id/links）
export interface AgencyLinkRecord {
  id: string;
  agencyId: string;
  token: string;
  jobId: string | null;
  expiresAt: string | null;
  disabledAt: string | null;
  createdById: string;
  createdAt: string;
  referralUrl: string; // '/referral/<token>' 相对路径
}

// 转化漏斗（GET /api/agencies/:id/stats）
export interface AgencyStats {
  total: number;
  stages: Array<{ stage: string; count: number }>;
  offers: number;
  joined: number;
}

// 公开落地页（GET /api/referral/:token）
export interface ReferralInfo {
  agencyName: string;
  jobTitle: string | null; // null = 通用推荐
}

// 通用响应包装（带 message）
export interface AgencyMutationResponse {
  success: boolean;
  message: string;
  data: AgencyListItem;
}

// 链接生成响应（token 仅此一次返回）
export interface AgencyLinkResponse {
  success: boolean;
  message: string;
  data: AgencyLinkRecord;
}

// 机构列表响应
export interface AgencyListResponse {
  success: boolean;
  data: AgencyListItem[];
}

// 漏斗响应
export interface AgencyStatsResponse {
  success: boolean;
  data: AgencyStats;
}

// 公开落地页响应
export interface ReferralInfoResponse {
  success: boolean;
  data: ReferralInfo;
}

// 公开提交响应（后端固定返回）
export interface ReferralSubmitResponse {
  success: boolean;
  message: string;
}

/**
 * 新增猎头机构
 * POST /api/agencies
 */
export function createAgency(data: {
  name: string;
  contact?: string;
  phone?: string;
  remark?: string;
}): Promise<AgencyMutationResponse> {
  return request.post('/agencies', data) as Promise<AgencyMutationResponse>;
}

/**
 * 更新猎头机构（编辑 / 启停用）
 * PATCH /api/agencies/:id
 */
export function updateAgency(
  id: string,
  data: Partial<{
    name: string;
    contact: string;
    phone: string;
    remark: string;
    enabled: boolean;
  }>
): Promise<AgencyMutationResponse> {
  return request.patch(`/agencies/${id}`, data) as Promise<AgencyMutationResponse>;
}

/**
 * 获取猎头机构列表（含 linkCount / referralCount）
 * GET /api/agencies
 */
export function getAgencyList(): Promise<AgencyListResponse> {
  return request.get('/agencies') as Promise<AgencyListResponse>;
}

/**
 * 生成猎头推荐链接（token 仅此一次返回）
 * POST /api/agencies/:id/links
 * @param data.expiresAt 缺省（不传）= 后端默认 90 天；显式 null = 长期有效；ISO 字符串 = 自定义
 */
export function createAgencyLink(
  agencyId: string,
  data: { jobId?: string; expiresAt?: string | null }
): Promise<AgencyLinkResponse> {
  return request.post(`/agencies/${agencyId}/links`, data) as Promise<AgencyLinkResponse>;
}

/**
 * 停用指定推荐链接（本切片 UI 暂不使用，仅导出备用）
 * DELETE /api/agencies/links/:linkId
 */
export function disableAgencyLink(linkId: string): Promise<{ success: boolean; message: string }> {
  return request.delete(`/agencies/links/${linkId}`) as Promise<{ success: boolean; message: string }>;
}

/**
 * 获取猎头机构转化漏斗
 * GET /api/agencies/:id/stats
 */
export function getAgencyStats(agencyId: string): Promise<AgencyStatsResponse> {
  return request.get(`/agencies/${agencyId}/stats`) as Promise<AgencyStatsResponse>;
}

/**
 * 获取公开推荐页信息（不限角色）
 * GET /api/referral/:token
 * 410 = 链接已失效（由 service 层 catch BusinessError 判断 statusCode）
 */
export function getReferralInfo(token: string): Promise<ReferralInfoResponse> {
  return request.get(`/referral/${token}`) as Promise<ReferralInfoResponse>;
}

/**
 * 公开提交推荐表单（FormData，含简历文件）
 * POST /api/referral/:token
 * @param form 候选人姓名 / 手机 / 邮箱 / 推荐理由
 * @param file 简历文件（必填，服务端强制要求）
 */
export function submitReferral(
  token: string,
  form: { name: string; phone: string; email?: string; reason?: string },
  file: File
): Promise<ReferralSubmitResponse> {
  const formData = new FormData();
  formData.append('name', form.name);
  formData.append('phone', form.phone);
  if (form.email) formData.append('email', form.email);
  if (form.reason) formData.append('reason', form.reason);
  // 授权同意固定为 true（前端已校验必勾）
  formData.append('consent', 'true');
  formData.append('file', file);

  return request.post(`/referral/${token}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<ReferralSubmitResponse>;
}