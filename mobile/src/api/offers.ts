import request from '@/lib/request';

export type OfferResult = 'pending' | 'accepted' | 'rejected';

export interface OfferListParams {
  page?: number;
  pageSize?: number;
  result?: OfferResult;
}

export interface CreateOfferParams {
  candidateId: string;
  salary: string;
  offerDate: string;
  expectedJoinDate?: string;
  note?: string;
}

export interface UpdateOfferParams {
  salary?: string;
  offerDate?: string;
  expectedJoinDate?: string;
  result?: OfferResult;
  note?: string;
}

export interface UpdateOfferResultParams {
  result: OfferResult;
}

export interface MarkAsJoinedParams {
  actualJoinDate: string;
}

export interface CandidateBrief {
  id: string;
  name: string;
  email: string;
  phone: string;
}

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

export interface OfferDetailData {
  success: boolean;
  data: OfferItem & {
    candidate: CandidateBrief & {
      candidateJobs: {
        job: {
          id: string;
          title: string;
        };
      }[];
    };
  };
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export function getOfferList(params?: OfferListParams): Promise<OfferListData> {
  return request.get('/api/offers', { params });
}

export function getOfferByCandidateId(candidateId: string): Promise<OfferDetailData> {
  return request.get(`/api/offers/${candidateId}`);
}

export function createOffer(data: CreateOfferParams): Promise<OperationResult> {
  return request.post('/api/offers', data);
}

export function updateOffer(candidateId: string, data: UpdateOfferParams): Promise<OperationResult> {
  return request.put(`/api/offers/${candidateId}`, data);
}

export function updateOfferResult(candidateId: string, data: UpdateOfferResultParams): Promise<OperationResult> {
  return request.put(`/api/offers/${candidateId}/result`, data);
}

export function markOfferAsJoined(candidateId: string, data: MarkAsJoinedParams): Promise<OperationResult> {
  return request.post(`/api/offers/${candidateId}/join`, data);
}
