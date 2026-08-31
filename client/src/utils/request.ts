import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';
import {
  BackendErrorCode,
  BusinessError,
  type BackendErrorResponse,
} from '@/types/error';

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function clearAuthAndRedirect(): void {
  ElMessage.error('登录已过期，请重新登录');
  localStorage.removeItem('ats_token');
  localStorage.removeItem('ats_user');
  router.push('/login');
}

/**
 * 按业务 code 分支处理 API 错误；未知 code 再 fallback 到 HTTP status
 */
export function handleResponseError(error: AxiosError<BackendErrorResponse>): Promise<never> {
  console.error('[HTTP] response error', error.message, error.config?.url);
  const { response } = error;

  if (!response) {
    ElMessage.error('网络错误，请检查网络连接');
    return Promise.reject(new BusinessError('网络错误', BackendErrorCode.INTERNAL_ERROR, 0));
  }

  const { status, data } = response;
  const code = data?.code ?? status;
  const message = data?.error ?? `请求失败 (${status})`;

  switch (code) {
    case BackendErrorCode.UNAUTHORIZED:
    case BackendErrorCode.TOKEN_EXPIRED:
      clearAuthAndRedirect();
      break;
    case BackendErrorCode.FORBIDDEN:
      ElMessage.error(message || '没有权限执行此操作');
      break;
    case BackendErrorCode.NOT_FOUND:
      ElMessage.error(message || '请求的资源不存在');
      break;
    case BackendErrorCode.ALREADY_EXISTS:
    case BackendErrorCode.CANDIDATE_DUPLICATE:
      ElMessage.warning(message || '记录已存在');
      break;
    case BackendErrorCode.OFFER_NOT_APPROVABLE:
      ElMessage.warning(message || 'Offer 状态不允许审批');
      break;
    default:
      if (status === 401) {
        clearAuthAndRedirect();
      } else if (status >= 500) {
        ElMessage.error('服务器内部错误，请稍后重试');
      } else {
        ElMessage.error(message);
      }
  }

  return Promise.reject(new BusinessError(message, code, status));
}

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    console.log(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`);
    // 从 localStorage 获取 token
    const token = localStorage.getItem('ats_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    console.error('[HTTP] request error', error);
    return Promise.reject(error);
  }
);

// 响应拦截器：优先按业务 code 处理，HTTP status 作为 fallback
request.interceptors.response.use(
  (response) => {
    console.log(`[HTTP] response ${response.status} ${response.config.url}`);
    return response.data;
  },
  (error: AxiosError<BackendErrorResponse>) => handleResponseError(error)
);

export default request;

// 文件上传方法
export function uploadFile(file: File): Promise<{ success: boolean; data?: { url: string }; message?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  return request.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }) as Promise<{ success: boolean; data?: { url: string }; message?: string }>;
}
