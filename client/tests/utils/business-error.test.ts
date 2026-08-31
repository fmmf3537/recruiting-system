import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosError } from 'axios';
import { BackendErrorCode, BusinessError, type BackendErrorResponse } from '@/types/error';

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

import router from '@/router';
import { ElMessage } from 'element-plus';
import { handleResponseError } from '@/utils/request';

function makeAxiosError(options: {
  status?: number;
  data?: Partial<BackendErrorResponse>;
  noResponse?: boolean;
}): AxiosError<BackendErrorResponse> {
  if (options.noResponse) {
    return {
      message: 'Network Error',
      name: 'AxiosError',
      isAxiosError: true,
      toJSON: () => ({}),
    } as AxiosError<BackendErrorResponse>;
  }

  const status = options.status ?? 400;
  return {
    message: 'Request failed',
    name: 'AxiosError',
    isAxiosError: true,
    toJSON: () => ({}),
    response: {
      status,
      statusText: 'Error',
      headers: {},
      config: {} as AxiosError['config'],
      data: {
        success: false,
        error: options.data?.error ?? '出错了',
        code: options.data?.code ?? status,
      },
    },
  } as AxiosError<BackendErrorResponse>;
}

describe('业务错误拦截器', () => {
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = { ats_token: 'token', ats_user: '{"id":"1"}' };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('UNAUTHORIZED / TOKEN_EXPIRED → 跳登录页 + 清 token', async () => {
    await expect(
      handleResponseError(
        makeAxiosError({
          status: 401,
          data: { error: '未认证', code: BackendErrorCode.UNAUTHORIZED },
        })
      )
    ).rejects.toBeInstanceOf(BusinessError);

    expect(ElMessage.error).toHaveBeenCalledWith('登录已过期，请重新登录');
    expect(storage.ats_token).toBeUndefined();
    expect(storage.ats_user).toBeUndefined();
    expect(router.push).toHaveBeenCalledWith('/login');

    vi.clearAllMocks();
    storage = { ats_token: 'token', ats_user: '{}' };

    await expect(
      handleResponseError(
        makeAxiosError({
          status: 401,
          data: { error: '认证令牌已过期', code: BackendErrorCode.TOKEN_EXPIRED },
        })
      )
    ).rejects.toMatchObject({ code: BackendErrorCode.TOKEN_EXPIRED });

    expect(router.push).toHaveBeenCalledWith('/login');
    expect(storage.ats_token).toBeUndefined();
  });

  it('FORBIDDEN → 显示无权限消息', async () => {
    await expect(
      handleResponseError(
        makeAxiosError({
          status: 403,
          data: { error: '没有权限执行此操作', code: BackendErrorCode.FORBIDDEN },
        })
      )
    ).rejects.toBeInstanceOf(BusinessError);

    expect(ElMessage.error).toHaveBeenCalledWith('没有权限执行此操作');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('CANDIDATE_DUPLICATE → 显示警告消息（不是错误）', async () => {
    await expect(
      handleResponseError(
        makeAxiosError({
          status: 409,
          data: { error: '候选人已存在', code: BackendErrorCode.CANDIDATE_DUPLICATE },
        })
      )
    ).rejects.toBeInstanceOf(BusinessError);

    expect(ElMessage.warning).toHaveBeenCalledWith('候选人已存在');
    expect(ElMessage.error).not.toHaveBeenCalled();
  });

  it('未知 code → fallback 到 HTTP status', async () => {
    await expect(
      handleResponseError(
        makeAxiosError({
          status: 401,
          data: { error: '旧版未登录', code: 401 },
        })
      )
    ).rejects.toMatchObject({ code: 401, statusCode: 401 });

    expect(ElMessage.error).toHaveBeenCalledWith('登录已过期，请重新登录');
    expect(router.push).toHaveBeenCalledWith('/login');

    vi.clearAllMocks();

    await expect(
      handleResponseError(
        makeAxiosError({
          status: 500,
          data: { error: 'boom', code: 9999 },
        })
      )
    ).rejects.toMatchObject({ code: 9999, statusCode: 500 });

    expect(ElMessage.error).toHaveBeenCalledWith('服务器内部错误，请稍后重试');
  });

  it('网络错误 → 显示网络错误', async () => {
    await expect(handleResponseError(makeAxiosError({ noResponse: true }))).rejects.toMatchObject({
      message: '网络错误',
      code: BackendErrorCode.INTERNAL_ERROR,
      statusCode: 0,
    });

    expect(ElMessage.error).toHaveBeenCalledWith('网络错误，请检查网络连接');
    expect(router.push).not.toHaveBeenCalled();
  });
});
