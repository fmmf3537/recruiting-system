import { env } from './env';
import { AppError } from '../middleware/errorHandler';

interface FeishuAppTokenResponse {
  code: number;
  msg?: string;
  app_access_token?: string;
}

interface FeishuUserTokenResponse {
  code: number;
  msg?: string;
  data?: {
    employee_no?: string;
    user_id?: string;
    name?: string;
  };
}

/**
 * 用飞书 authCode 换取员工标识（employee_no 或 user_id）
 */
export async function resolveFeishuEmployeeId(authCode: string): Promise<string> {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    throw new AppError('飞书应用未配置', 503);
  }

  const appAccessTokenRes = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      }),
    }
  ).then((r) => r.json() as Promise<FeishuAppTokenResponse>);

  if (appAccessTokenRes.code !== 0 || !appAccessTokenRes.app_access_token) {
    throw new AppError(appAccessTokenRes.msg || '获取飞书应用凭证失败', 400);
  }

  const userInfoRes = await fetch(
    'https://open.feishu.cn/open-apis/authen/v1/access_token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appAccessTokenRes.app_access_token}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authCode,
      }),
    }
  ).then((r) => r.json() as Promise<FeishuUserTokenResponse>);

  if (userInfoRes.code !== 0) {
    throw new AppError(userInfoRes.msg || '飞书授权码无效或已过期', 400);
  }

  const employeeId = userInfoRes.data?.employee_no || userInfoRes.data?.user_id || '';
  if (!employeeId) {
    throw new AppError('无法获取飞书用户标识', 400);
  }

  return employeeId;
}
