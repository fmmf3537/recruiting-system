import request from './request';
import type { LoginForm, LoginResponse, UserInfo } from '@types/user';

export const login = (data: LoginForm): Promise<LoginResponse> => {
  return request.post('/auth/login', data);
};

export const register = (data: LoginForm): Promise<LoginResponse> => {
  return request.post('/auth/register', data);
};

export const getUserInfo = (): Promise<UserInfo> => {
  return request.get('/auth/me');
};

export const logout = (): Promise<void> => {
  return request.post('/auth/logout');
};
