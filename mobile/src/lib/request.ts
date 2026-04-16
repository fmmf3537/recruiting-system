import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { showToast } from 'vant';
import router from '@/router';

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
});

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ats_token');
    if (token && config.headers) {
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
    return response.data;
  },
  (error: AxiosError) => {
    const { response } = error;

    if (response) {
      const { status, data } = response;
      const errorData = data as { success?: boolean; error?: string; message?: string } | undefined;
      const message = errorData?.error || errorData?.message || `请求失败 (${status})`;

      switch (status) {
        case 401: {
          const msg = errorData?.error || errorData?.message || '登录已过期，请重新登录';
          showToast(msg);
          // 登录接口的 401 只提示错误，不跳转；其他接口的 401 才清除 token 并强制跳转
          const isLoginApi = error.config?.url?.includes('/auth/login');
          if (!isLoginApi) {
            localStorage.removeItem('ats_token');
            router.push('/login');
          }
          break;
        }
        case 403:
          showToast('没有权限执行此操作');
          break;
        case 404:
          showToast(errorData?.error || '请求的资源不存在');
          break;
        case 500:
          showToast('服务器内部错误，请稍后重试');
          break;
        default:
          showToast(message);
      }
    } else {
      showToast('网络错误，请检查网络连接');
    }

    return Promise.reject(error);
  }
);

export default request;

// 封装 GET/POST/PUT/DELETE 方法
export function get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request.get(url, config) as Promise<T>;
}

export function post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request.post(url, data, config) as Promise<T>;
}

export function put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return request.put(url, data, config) as Promise<T>;
}

export function del<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request.delete(url, config) as Promise<T>;
}
