/**
 * 将存储的简历 URL 转为可浏览器/飞书预览的鉴权链接
 */
export function resolveFileUrl(storedUrl: string): string {
  if (!storedUrl) return '';

  let path = storedUrl;
  if (path.startsWith('/uploads/')) {
    const filename = path.replace(/^\/uploads\//, '');
    path = `/api/files/${filename}`;
  }

  const token = localStorage.getItem('ats_token');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  let fullUrl = path;
  if (path.startsWith('http')) {
    fullUrl = path;
  } else if (path.startsWith('/')) {
    fullUrl = `${origin}${path}`;
  }

  if (token && !fullUrl.includes('token=')) {
    const sep = fullUrl.includes('?') ? '&' : '?';
    fullUrl = `${fullUrl}${sep}token=${encodeURIComponent(token)}`;
  }

  return fullUrl;
}
