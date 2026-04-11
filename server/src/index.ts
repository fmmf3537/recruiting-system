import app from './app';
import { env } from './lib/env';

const PORT = env.PORT;

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
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
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
