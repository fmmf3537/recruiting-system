import request from '@/lib/request';

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
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

export interface UserInfoResult {
  success: boolean;
  user: LoginResult['user'];
}

export interface FeishuLoginParams {
  authCode: string;
}

/**
 * 账号密码登录
 */
export function login(data: LoginParams): Promise<LoginResult> {
  return request.post('/api/auth/login', data);
}

/**
 * 获取当前登录用户信息
 */
export function getMe(): Promise<UserInfoResult> {
  return request.get('/api/auth/me');
}

/**
 * 飞书免登登录
 */
export function feishuLogin(data: FeishuLoginParams): Promise<LoginResult> {
  return request.post('/api/auth/feishu/login', data);
}
