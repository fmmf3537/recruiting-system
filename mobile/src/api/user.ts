import request from '@/lib/request';

export interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserListResult {
  success: boolean;
  data: UserItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * 获取成员列表（仅管理员）
 */
export function getUsers(params: UserListParams = {}): Promise<UserListResult> {
  return request.get('/users', { params });
}
