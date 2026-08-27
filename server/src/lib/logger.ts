import { Writable } from 'node:stream';

import pino, { type Logger, type LoggerOptions } from 'pino';

import { env } from './env';

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
