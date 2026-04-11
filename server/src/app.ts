import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import routes from './routes';
import { env } from './lib/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// 创建 Express 应用
const app: Application = express();

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS 配置
app.use(cors({
  origin: env.CORS_ORIGIN,
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

// 静态文件服务（上传的文件）
app.use('/uploads', express.static(path.join(process.cwd(), env.UPLOAD_DIR)));

// 挂载 API 路由
app.use('/api', routes);

// 404 处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

export default app;
