import * as Sentry from '@sentry/node';
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/node';

let initialized = false;

/** Prisma 已知错误在 errorHandler 中映射为 4xx，Sentry 侧同步跳过（不改 Prisma 处理逻辑） */
const PRISMA_4XX_CODES = new Set(['P2002', 'P2003', 'P2025', 'P2014']);

function parseTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE;
  const n = raw ? Number.parseFloat(raw) : 0.1;
  if (!Number.isFinite(n) || n < 0) {
    return 0.1;
  }
  return Math.min(n, 1);
}

function redactRequestUrl(url: string): string {
  return url
    .replace(/\/[a-z0-9]{20,}/gi, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
}

/** Sentry 特有字段脱敏（不重复 pino 的 phone/email/name 路径规则） */
export function sentryBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  if (event.request?.data) {
    event.request.data = '[REDACTED]';
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  if (event.request?.url) {
    event.request.url = redactRequestUrl(event.request.url);
  }
  return event;
}

export function sentryBeforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.category === 'http' && breadcrumb.data) {
    const url = breadcrumb.data.url;
    if (typeof url === 'string' && url.includes('token=')) {
      breadcrumb.data.url = url.split('?')[0];
    }
  }
  return breadcrumb;
}

/** 只上报 5xx；AppError/Prisma 4xx 映射/JWT 校验失败不上报 */
export function shouldHandleSentryError(error: {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  name?: string;
  code?: string;
}): boolean {
  if (error.name === 'PrismaClientKnownRequestError' && error.code && PRISMA_4XX_CODES.has(error.code)) {
    return false;
  }
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'ValidationError') {
    return false;
  }
  const status = Number(error.status ?? error.statusCode ?? error.status_code ?? 500);
  return Number.isFinite(status) && status >= 500;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    initialized = false;
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: parseTracesSampleRate(),
    sendDefaultPii: false,
    // 已有 PROMPT-07 OTel SDK，禁止 Sentry 再起一套 tracing
    skipOpenTelemetrySetup: true,
    beforeSend: sentryBeforeSend,
    beforeBreadcrumb: sentryBeforeBreadcrumb,
  });

  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

/** 仅供单元测试重置模块级开关 */
export function resetSentryState(): void {
  initialized = false;
}
