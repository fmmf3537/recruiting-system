// 工具函数

/**
 * 格式化日期
 */
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * 格式化日期时间
 */
export const formatDateTime = (date: Date | string): string => {
  const d = new Date(date);
  return d.toISOString().replace('T', ' ').slice(0, 19);
};

/**
 * 生成随机字符串
 */
export const generateRandomString = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * 过滤对象中的空值
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const removeEmptyValues = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null)
  );
};
