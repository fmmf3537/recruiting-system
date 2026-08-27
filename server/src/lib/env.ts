import { z } from 'zod';
import dotenv from 'dotenv';

// 加载 .env 文件
dotenv.config();

// 环境变量验证 schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  
  // 数据库
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // JWT 配置
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  
  // 飞书
  FEISHU_APP_ID: z.string().optional(),
  FEISHU_APP_SECRET: z.string().optional(),
  
  // 文件上传
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE: z.string().default('10485760').transform((val) => parseInt(val, 10)), // 10MB
  // 文件下载是否走 Nginx X-Accel-Redirect 内部跳转（生产/Nginx 环境置 true，本地开发 Express 直接 sendFile）
  X_ACCEL_REDIRECT: z.string().optional().transform((val) => val === 'true'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // LLM 简历解析配置（可选）
  LLM_PROVIDER: z.enum(['deepseek', 'zhipu', 'kimi', 'minimax']).default('deepseek'),
  DEEPSEEK_API_KEY: z.string().optional(),
  ZHIPU_API_KEY: z.string().optional(),
  KIMI_API_KEY: z.string().optional(),
  MINIMAX_API_KEY: z.string().optional(),

  // SMTP 邮件配置（可选）
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 587)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().optional().transform((val) => val === 'true'),

  // 候选人数据匿名化定时任务（个保法合规）
  // 值为 cron 表达式（如 0 3 * * * 每日凌晨 3 点）；设为 false 或留空则关闭
  ANONYMIZE_CRON: z.string().optional().transform((val) => (val && val !== 'false' ? val : null)),

  // 面试评估催收定时任务（面试结束 24 小时后未提交评估的面试官发站内通知）
  // 值为 cron 表达式（如 0 * * * * 每小时）；设为 false 或留空则关闭
  EVALUATION_REMINDER_CRON: z.string().optional().transform((val) => (val && val !== 'false' ? val : null)),

  // 统一提醒定时任务（跟进到期 / 面试前提醒 / 阶段停留超时）
  // true 开启，固定每小时扫描一次（0 * * * *）；false 或留空则关闭
  REMINDER_CRON_ENABLED: z.string().optional().transform((val) => val === 'true'),
  // 阶段停留超时阈值（天数）：StageRecord 处于 in_progress 且 enteredAt 超过该天数触发提醒
  STAGE_OVERDUE_DAYS: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 7)),

  // OpenTelemetry（留空则禁用 tracing）
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().url().optional()
  ),
  OTEL_SAMPLING_RATIO: z.string().optional().transform((val) => (val ? parseFloat(val) : 1.0)),

  // Sentry（留空则禁用）
  SENTRY_DSN: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().url().optional()
  ),
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional().transform((v) => (v ? parseFloat(v) : 0.1)),
});

// 验证环境变量
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  parsedEnv.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

// 导出验证后的环境变量
export const env = parsedEnv.data;

export default env;
