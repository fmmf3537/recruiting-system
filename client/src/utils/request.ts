import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('ats_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 直接返回响应数据
    return response.data;
  },
  (error: AxiosError) => {
    const { response } = error;
    
    if (response) {
      const { status, data } = response;
      const errorData = data as { success?: boolean; error?: string; message?: string };
      
      switch (status) {
        case 401:
          // 未授权，清除 token 并跳转到登录页
          ElMessage.error('登录已过期，请重新登录');
          localStorage.removeItem('ats_token');
          localStorage.removeItem('ats_user');
          router.push('/login');
          break;
        case 403:
          ElMessage.error('没有权限执行此操作');
          break;
        case 404:
          ElMessage.error(errorData.error || '请求的资源不存在');
          break;
        case 500:
          ElMessage.error('服务器内部错误，请稍后重试');
          break;
        default:
          ElMessage.error(errorData.error || `请求失败 (${status})`);
      }
    } else {
      // 网络错误或其他错误
      ElMessage.error('网络错误，请检查网络连接');
    }
    
    return Promise.reject(error);
  }
);

export default request;
