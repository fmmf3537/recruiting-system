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

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface RegisterForm {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}
