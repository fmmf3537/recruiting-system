import { Writable } from 'node:stream';

import { context, trace } from '@opentelemetry/api';
import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from './env';

/** 把当前 span 的 trace_id / span_id 写入日志；无 active span 时返回空对象 */
export function traceLogMixin(): { trace_id?: string; span_id?: string } {
  const span = trace.getSpan(context.active());
  if (!span) {
    return {};
  }
  const spanCtx = span.spanContext();
  return { trace_id: spanCtx.traceId, span_id: spanCtx.spanId };
}

/**
 * pino 配置：JSON 结构化日志 + PII redact（个保法）。
 * 不使用 pino-pretty（禁止事项：除 pino / pino-http 外不新增依赖）。
 */
export const loggerOptions: LoggerOptions = {
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'phone',
      'email',
      '*.password',
      '*.phone',
      '*.email',
      '*.name',
      '*.resumeUrl',
      '*.*.phone',
      '*.*.email',
      '*.*.name',
      '*.detail.password',
      '*.detail.phone',
      '*.detail.email',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin: traceLogMixin,
};

/**
 * 创建 logger（测试可注入 Writable 捕获输出）。
 */
export function createLogger(destination?: Writable): Logger {
  if (destination) {
    return pino(loggerOptions, destination);
  }
  return pino(loggerOptions);
}

export const logger = createLogger();

export default logger;
