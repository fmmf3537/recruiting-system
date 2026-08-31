import fs from 'fs/promises';
import path from 'path';

import * as Sentry from '@sentry/node';

import app from './app';
import {
  registerAnonymizeCron,
  registerEvaluationReminderCron,
  registerReminderCron,
  registerHiringDigestCron,
  registerInterviewerReminderCron,
} from './lib/cron';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { isSentryEnabled } from './lib/sentry';
import './workers/resume-parser.worker';

const PORT = env.PORT;

// 确保上传临时目录存在
const tempDir = path.resolve(process.cwd(), 'uploads', 'temp');
fs.mkdir(tempDir, { recursive: true }).catch((err) => {
  logger.error({ err }, '创建上传临时目录失败');
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`
🚀 Server is running!

📡 Environment: ${env.NODE_ENV}
🔗 API URL: http://localhost:${PORT}
📁 Upload Dir: ${env.UPLOAD_DIR}

Available endpoints:
- GET  /api/health           Health check
- POST /api/auth/login       User login
- POST /api/auth/register    User register
- GET  /api/auth/me          Get current user
- GET  /api/users            List users (admin only)
- GET  /api/jobs             List jobs
- GET  /api/candidates       List candidates
- GET  /api/offers           List offers
- GET  /api/stats/dashboard  Dashboard stats
- POST /api/upload           Upload file
  `);
});

// 注册候选人匿名化定时任务（个保法合规，ANONYMIZE_CRON 控制开关）
registerAnonymizeCron();

// 注册面试评估催收定时任务（EVALUATION_REMINDER_CRON 控制开关）
registerEvaluationReminderCron();

// 注册统一提醒定时任务（跟进/面试/阶段超时，REMINDER_CRON_ENABLED 控制开关）
registerReminderCron();

// 注册 hiring_manager 日报（HIRING_DIGEST_CRON 控制开关）
registerHiringDigestCron();

// 注册 interviewer 面试前 24h 提醒（INTERVIEWER_REMINDER_CRON 控制开关）
registerInterviewerReminderCron();

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    logger.info('Server closed');
    await redis.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    logger.info('Server closed');
    await redis.disconnect();
    process.exit(0);
  });
});

// 未捕获的错误处理
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  if (isSentryEnabled()) {
    Sentry.captureException(error);
    void Sentry.flush(2000).finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled Rejection');
  if (isSentryEnabled()) {
    Sentry.captureException(reason);
    void Sentry.flush(2000).finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
