import request from '@/utils/request';

// 登录请求参数
export interface LoginParams {
  email: string;
  password: string;
}

// 登录响应数据
export interface LoginData {
  success: boolean;
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
  };
}

// 当前用户信息响应
export interface UserInfoData {
  success: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
  };
}

/**
 * 用户登录
 * @param data 登录参数
 */
export function login(data: LoginParams): Promise<LoginData> {
  return request.post('/auth/login', data) as Promise<LoginData>;
}

/**
 * 获取当前登录用户信息
 */
export function getCurrentUser(): Promise<UserInfoData> {
  return request.get('/auth/me') as Promise<UserInfoData>;
}
