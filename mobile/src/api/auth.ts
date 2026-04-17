import request from '@/lib/request';

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  message?: string;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
  };
  error?: string;
  code?: string;
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
  return request.post('/auth/login', data);
}

/**
 * 获取当前登录用户信息
 */
export function getMe(): Promise<UserInfoResult> {
  return request.get('/auth/me');
}

/**
 * 飞书免登登录
 */
export function feishuLogin(data: FeishuLoginParams): Promise<LoginResult> {
  return request.post('/auth/feishu/login', data);
}

export interface BindFeishuParams {
  email: string;
  password: string;
  feishuEmployeeId: string;
}

/**
 * 飞书账号绑定本地账号
 */
export function bindFeishu(data: BindFeishuParams): Promise<LoginResult> {
  return request.post('/auth/bind-feishu', data);
}
