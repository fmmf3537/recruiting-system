import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { env } from './lib/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { setupSwagger } from './lib/swagger';

// 创建 Express 应用
const app: Application = express();

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS 配置（支持逗号分隔的多 origin）
const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// 日志中间件
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 解析 JSON 请求体
app.use(express.json({ limit: '10mb' }));

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 响应压缩
app.use(compression());

// 全局限流：15 分钟内最多 1000 次请求
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
  },
});
app.use(limiter);

// 静态文件服务（上传的文件）
app.use('/uploads', express.static(path.join(process.cwd(), env.UPLOAD_DIR)));

// 挂载 API 路由
app.use('/api', routes);

// Swagger 文档（仅在非生产环境显示）
if (env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// 404 处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

export default app;
