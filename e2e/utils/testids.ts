/**
 * data-testid 常量集中管理（P0 仅占位；P2 才在 client 补真实 testid）
 */
export const TESTIDS = {
  loginEmail: 'login-email',
  loginPassword: 'login-password',
  loginSubmit: 'login-submit',
} as const;

export type TestIdKey = keyof typeof TESTIDS;
