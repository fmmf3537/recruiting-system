/**
 * 格式化数字，保留指定小数位
 */
export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}
