import request from '@/utils/request';

// Offer 结果
export type OfferResult = 'pending' | 'accepted' | 'rejected';

// Offer 列表查询参数
export interface OfferListParams {
  page?: number;
  pageSize?: number;
  result?: OfferResult;
}

// 创建 Offer 参数
export interface CreateOfferParams {
  candidateId: string;
  salary: string;
  offerDate: string;
  expectedJoinDate?: string;
  note?: string;
}

// 更新 Offer 参数
export interface UpdateOfferParams {
  salary?: string;
  offerDate?: string;
  expectedJoinDate?: string;
  result?: OfferResult;
  note?: string;
}

// 更新 Offer 结果参数
export interface UpdateOfferResultParams {
  result: OfferResult;
}

// 标记入职参数
export interface MarkAsJoinedParams {
  actualJoinDate: string;
}

// 候选人简要信息
export interface CandidateBrief {
  id: string;
  name: string;
  email: string;
  phone: string;
}

// Offer 列表项
export interface OfferItem {
  id: string;
  candidateId: string;
  salary: string;
  offerDate: string;
  expectedJoinDate: string | null;
  result: OfferResult;
  joined: boolean;
  actualJoinDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: CandidateBrief;
}

// Offer 详情（包含候选人关联职位）
export interface OfferDetail extends OfferItem {
  candidate: CandidateBrief & {
    candidateJobs: {
      job: {
        id: string;
        title: string;
      };
    }[];
  };
}

// Offer 列表响应
export interface OfferListData {
  success: boolean;
  data: OfferItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Offer 详情响应
export interface OfferDetailData {
  success: boolean;
  data: OfferDetail;
}

// 操作结果响应
export interface OperationResult {
  success: boolean;
  message: string;
  data?: OfferItem;
}

/**
 * 获取 Offer 列表
 * @param params 查询参数
 */
export function getOfferList(params?: OfferListParams): Promise<OfferListData> {
  return request.get('/offers', { params }) as Promise<OfferListData>;
}

/**
 * 获取候选人的 Offer
 * @param candidateId 候选人ID
 */
export function getOfferByCandidateId(candidateId: string): Promise<OfferDetailData> {
  return request.get(`/offers/${candidateId}`) as Promise<OfferDetailData>;
}

/**
 * 创建 Offer
 * @param data Offer 数据
 */
export function createOffer(data: CreateOfferParams): Promise<OperationResult> {
  return request.post('/offers', data) as Promise<OperationResult>;
}

/**
 * 更新 Offer
 * @param candidateId 候选人ID
 * @param data 更新数据
 */
export function updateOffer(candidateId: string, data: UpdateOfferParams): Promise<OperationResult> {
  return request.patch(`/offers/${candidateId}`, data) as Promise<OperationResult>;
}

/**
 * 更新 Offer 结果
 * @param candidateId 候选人ID
 * @param data 结果数据
 */
export function updateOfferResult(candidateId: string, data: UpdateOfferResultParams): Promise<OperationResult> {
  return request.patch(`/offers/${candidateId}/result`, data) as Promise<OperationResult>;
}

/**
 * 标记入职
 * @param candidateId 候选人ID
 * @param data 入职数据
 */
export function markAsJoined(candidateId: string, data: MarkAsJoinedParams): Promise<OperationResult> {
  return request.patch(`/offers/${candidateId}/join`, data) as Promise<OperationResult>;
}

/**
 * 删除 Offer
 * @param candidateId 候选人ID
 */
export function deleteOffer(candidateId: string): Promise<OperationResult> {
  return request.delete(`/offers/${candidateId}`) as Promise<OperationResult>;
}
