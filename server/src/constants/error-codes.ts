/**
 * 业务错误码（前端按此分支处理）
 * 与 HTTP statusCode 解耦：HTTP 是传输层，code 是业务层
 */
export const ErrorCode = {
  // 认证授权 1xxx
  UNAUTHORIZED: 1001,
  TOKEN_EXPIRED: 1002,
  FORBIDDEN: 1003,

  // 资源 2xxx
  NOT_FOUND: 2001,
  ALREADY_EXISTS: 2002,

  // 校验 3xxx
  VALIDATION_FAILED: 3001,
  MISSING_FIELD: 3002,
  INVALID_FORMAT: 3003,

  // 业务逻辑 4xxx
  CANDIDATE_DUPLICATE: 4001,
  CANDIDATE_DELETED: 4002,
  OFFER_NOT_APPROVABLE: 4003,
  INTERVIEW_NOT_EVALUABLE: 4004,

  // 系统 5xxx
  INTERNAL_ERROR: 5001,
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
