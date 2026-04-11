export type UserRole = 'ADMIN' | 'HR' | 'INTERVIEWER' | 'CANDIDATE';

export interface UserInfo {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  createdAt: string;
}

export interface LoginForm {
  email: string;
  password: string;
}

// 后端返回的登录响应
export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: UserInfo;
}

// 后端返回的用户信息响应
export interface UserInfoResponse {
  success: boolean;
  user: UserInfo;
}

export interface RegisterForm {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}
