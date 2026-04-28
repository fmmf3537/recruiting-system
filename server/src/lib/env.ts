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

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // SMTP 邮件配置（可选）
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 587)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().optional().transform((val) => val === 'true'),
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
