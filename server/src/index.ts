import fs from 'fs/promises';
import path from 'path';
import app from './app';
import { env } from './lib/env';
import { redis } from './lib/redis';
import './workers/resume-parser.worker';

const PORT = env.PORT;

// 确保上传临时目录存在
const tempDir = path.resolve(process.cwd(), 'uploads', 'temp');
fs.mkdir(tempDir, { recursive: true }).catch((err) => {
  console.error('创建上传临时目录失败:', err);
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

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  server.close(async () => {
    console.log('Server closed');
    await redis.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  server.close(async () => {
    console.log('Server closed');
    await redis.disconnect();
    process.exit(0);
  });
});

// 未捕获的错误处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
