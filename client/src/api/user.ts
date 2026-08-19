import request from '@/utils/request';

// 用户列表查询参数
export interface UserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

// 创建用户参数
export interface CreateUserParams {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'member';
  department?: string | null;
}

// 更新用户参数
export interface UpdateUserParams {
  name?: string;
  role?: 'admin' | 'member';
  department?: string | null;
}

// 用户列表项
export interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  createdAt: string;
  updatedAt: string;
}

// 用户列表响应
export interface UserListData {
  success: boolean;
  data: UserItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// 用户详情响应
export interface UserDetailData {
  success: boolean;
  data: UserItem;
}

// 操作结果响应
export interface OperationResult {
  success: boolean;
  message?: string;
}

/**
 * 获取用户列表
 * @param params 查询参数
 */
export function getUserList(params?: UserListParams): Promise<UserListData> {
  return request.get('/users', { params }) as Promise<UserListData>;
}

// 审批人选项（Offer 提交审批时可选的审批人）
export interface ApproverOption {
  id: string;
  name: string;
  email: string;
}

// 审批人选项响应
export interface ApproverOptionsData {
  success: boolean;
  data: ApproverOption[];
}

/**
 * 获取可选审批人列表（管理员基础信息，所有登录用户可见）
 */
export function getApproverOptions(): Promise<ApproverOptionsData> {
  return request.get('/users/approver-options') as Promise<ApproverOptionsData>;
}

/**
 * 获取用户详情
 * @param id 用户ID
 */
export function getUserById(id: string): Promise<UserDetailData> {
  return request.get(`/users/${id}`) as Promise<UserDetailData>;
}

/**
 * 创建用户
 * @param data 用户数据
 */
export function createUser(data: CreateUserParams): Promise<UserDetailData> {
  return request.post('/users', data) as Promise<UserDetailData>;
}

/**
 * 更新用户
 * @param id 用户ID
 * @param data 更新数据
 */
export function updateUser(id: string, data: UpdateUserParams): Promise<UserDetailData> {
  return request.put(`/users/${id}`, data) as Promise<UserDetailData>;
}

/**
 * 删除用户
 * @param id 用户ID
 */
export function deleteUser(id: string): Promise<OperationResult> {
  return request.delete(`/users/${id}`) as Promise<OperationResult>;
}

// 修改密码参数
export interface ChangePasswordParams {
  oldPassword: string;
  newPassword: string;
}

/**
 * 修改密码
 * @param data 密码数据
 */
export function changePassword(data: ChangePasswordParams): Promise<OperationResult> {
  return request.post('/auth/change-password', data) as Promise<OperationResult>;
}

// 重置密码响应（临时密码仅本次返回）
export interface ResetPasswordResult {
  success: boolean;
  message?: string;
  data: {
    tempPassword: string;
  };
}

/**
 * 管理员重置成员密码
 * @param id 用户ID
 */
export function resetUserPassword(id: string): Promise<ResetPasswordResult> {
  return request.post(`/users/${id}/reset-password`) as Promise<ResetPasswordResult>;
}
