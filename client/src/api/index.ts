// API 聚合入口仅导出无歧义的认证接口；业务模块请按路径导入。
export { login, getCurrentUser } from './auth';
export type { LoginData, LoginParams, UserInfoData } from './auth';
