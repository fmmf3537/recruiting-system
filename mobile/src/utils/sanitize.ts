import DOMPurify from 'dompurify';

/**
 * 消毒富文本 HTML，防止存储型 XSS（用于 v-html 渲染场景）
 * 默认白名单已过滤 script、事件属性（onclick 等）、javascript: 协议等危险内容
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) {
    return '';
  }
  return DOMPurify.sanitize(html);
}
