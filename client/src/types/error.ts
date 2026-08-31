/**
 * 后端业务错误码（与服务端 src/constants/error-codes.ts 同步）
 * HTTP 401/403/404/500 等 status 仍保留作为参考，但前端优先按 code 分支
 */
export const BackendErrorCode = {
  UNAUTHORIZED: 1001,
  TOKEN_EXPIRED: 1002,
  FORBIDDEN: 1003,

  NOT_FOUND: 2001,
  ALREADY_EXISTS: 2002,

  VALIDATION_FAILED: 3001,
  MISSING_FIELD: 3002,
  INVALID_FORMAT: 3003,

  CANDIDATE_DUPLICATE: 4001,
  CANDIDATE_DELETED: 4002,
  OFFER_NOT_APPROVABLE: 4003,
  INTERVIEW_NOT_EVALUABLE: 4004,

  INTERNAL_ERROR: 5001,
} as const;

export type BackendErrorCodeType = (typeof BackendErrorCode)[keyof typeof BackendErrorCode];

/**
 * 后端错误响应结构
 */
export interface BackendErrorResponse {
  success: false;
  error: string;
  code: BackendErrorCodeType | number;
  stack?: string; // 仅 dev
}

/**
 * 业务错误（包含 code）
 */
export class BusinessError extends Error {
  public code: BackendErrorCodeType | number;

  public statusCode: number;

  constructor(message: string, code: BackendErrorCodeType | number, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'BusinessError';
  }
}
